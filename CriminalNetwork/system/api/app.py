"""FastAPI surface for the CrimeNet frontend.

Serves two distinct kinds of data:

* **Submissions** — session, case, FIR, evidence upload, run trigger. These
  write to the case registry and enqueue a pipeline job.
* **Findings** — the read-only endpoints. Everything here is projected from
  ``<case>/output/*.json`` produced by a real run; when a case has not run yet
  the projection returns empty lists rather than placeholder numbers.

The pipeline is deliberately run as a subprocess (``api/jobs.py``): it is a
long, CPU-bound, serialised job with its own log, and keeping it out of the
request thread is what lets the UI poll progress without blocking uploads.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.identity import (
    JURISDICTIONS,
    ROLES,
    Identity,
    IdentityError,
    get_provider,
)
from api.jobs import Job, JobStore, PipelineRunner, build_argv
from api.projection import RunProjection
from api.registry import CaseRegistry, RegistryError
from api.schemas import CaseCreate, FirCreate, RunRequest, SessionStart

_SYSTEM_DIR = Path(__file__).resolve().parent.parent

#: Port the Vite dev server proxies to when run with `pnpm dev`.
DEFAULT_PORT = int(os.environ.get("CRIMENET_API_PORT") or 8000)


def _state_dir() -> Path:
    return Path(
        os.environ.get("CRIMENET_STATE_DIR")
        or (_SYSTEM_DIR / ".state")
    ).resolve()


class ApiState:
    """Long-lived handles owned by the app, torn down on shutdown."""

    def __init__(self, state_dir: Path) -> None:
        self.state_dir = state_dir
        state_dir.mkdir(parents=True, exist_ok=True)
        self.registry = CaseRegistry(state_dir)
        self.jobs = JobStore(state_dir)
        self.runner = PipelineRunner(_SYSTEM_DIR, self.jobs)
        self._active_path = state_dir / "active_case.json"

    def close(self) -> None:
        self.runner.shutdown(timeout=5.0)

    # -- active case --------------------------------------------------
    # Read endpoints mostly do not carry a case id, because the investigator
    # works one case at a time. This records which case is currently open so
    # `GET /api/cdr` etc. know which run directory to project.
    def active_case(self) -> str | None:
        try:
            payload = json.loads(self._active_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        case_id = str(payload.get("case_id") or "")
        return case_id or None

    def set_active(self, case_id: str) -> None:
        self._active_path.write_text(
            json.dumps({"case_id": case_id}, indent=2), encoding="utf-8"
        )

    # -- integrity ledger ------------------------------------------------
    def _ledger_path(self, case_id: str) -> Path:
        return self.registry.case_dir(case_id) / "integrity.json"

    def absorb_integrity(self, case_id: str) -> tuple[dict[str, str], set[str]]:
        """Merge this run's evidence verdicts into a per-case ledger.

        ``run.py --incremental`` rewrites ``extraction_summary.json`` with only
        the files it just processed, so an adversarial flag raised on the first
        run would disappear from the Evidence page after appending two more
        files. Merging into a sidecar keeps the verdict and the examination
        timestamp sticky across runs without editing any pipeline output.
        """
        path = self._ledger_path(case_id)
        try:
            ledger = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            ledger = {}
        ingested: dict[str, str] = dict(ledger.get("ingested") or {})
        tampered: set[str] = set(ledger.get("tampered") or [])

        summary = RunProjection(self.registry.output_dir(case_id)).read(
            "extraction_summary.json"
        )
        if isinstance(summary, dict):
            rows = summary.get("evidence_integrity")
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("original_filename") or "")
                    stamp = str(row.get("ingestion_time") or "")
                    if name and stamp and ingested.get(name) != stamp:
                        ingested[name] = stamp
            adversarial = (summary.get("ingestion_summary") or {}).get(
                "adversarial"
            ) or {}
            if isinstance(adversarial, dict):
                tampered.update(
                    str(name) for name in adversarial.get("suspicious_files") or []
                )

        # Only rewrite when something actually changed.
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            current = {}
        wanted = {"ingested": ingested, "tampered": sorted(tampered)}
        if current != wanted:
            path.write_text(json.dumps(wanted, indent=2), encoding="utf-8")
        return ingested, tampered


_state: ApiState | None = None


def get_state() -> ApiState:
    if _state is None:
        raise HTTPException(503, "API is starting up")
    return _state


def get_registry() -> CaseRegistry:
    return get_state().registry


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _state
    _state = ApiState(_state_dir())
    try:
        yield
    finally:
        _state.close()
        _state = None


app = FastAPI(
    title="CrimeNet Investigative API",
    version="0.1.0",
    lifespan=_lifespan,
)

# The Vite dev server proxies /api, so CORS is only a convenience for direct
# access during development and for the demo build served separately.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def current_identity(
    authorization: str | None = Header(default=None),
) -> Identity:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        return get_provider().verify(authorization.split(" ", 1)[1].strip())
    except IdentityError as exc:
        raise HTTPException(401, str(exc)) from exc


def _identity_view(identity: Identity) -> dict[str, str]:
    """camelCase over the wire, matching every other response."""
    return {
        "userId": identity.user_id,
        "displayName": identity.display_name,
        "role": identity.role,
        "jurisdictionId": identity.jurisdiction_id,
        "provider": identity.provider,
    }


# ---------------------------------------------------------------------------
# Case helpers
# ---------------------------------------------------------------------------
def _registry_case(case_id: str) -> Any:
    try:
        return get_registry().get_case(case_id)
    except RegistryError as exc:
        raise HTTPException(404, str(exc)) from exc


def _case_record(case_id: str) -> dict[str, Any]:
    registry = get_registry()
    case = _registry_case(case_id)
    firs = registry.list_firs(case_id)
    rows = _projection(case_id).case_records(
        case_id,
        case,
        [fir.fir_number for fir in firs],
        case.status,
    )
    if not rows:
        raise HTTPException(404, f"No case record for {case_id}")
    return rows[0]


def _all_case_records() -> list[dict[str, Any]]:
    registry = get_registry()
    records: list[dict[str, Any]] = []
    for case in registry.list_cases():
        try:
            records.append(_case_record(case.case_id))
        except HTTPException:
            continue
    return records


def _projection(case_id: str | None) -> RunProjection:
    """Projection for the named case, or the active one.

    The registry's upload list rides along as the spine of the evidence view,
    and the integrity ledger supplies verdicts the latest run no longer
    carries. Falls back to a directory that does not exist so an unknown case
    yields the empty state instead of another case's findings.
    """
    state = get_state()
    target = case_id or state.active_case()
    if not target:
        return RunProjection(state.state_dir / "__no_case__")
    registry = state.registry
    try:
        registry.get_case(target)
        output_dir = registry.output_dir(target)
        uploaded = [
            {
                "original_name": row.original_name,
                "stored_name": row.stored_name,
                "sha256": row.sha256,
                "uploaded_at": row.uploaded_at,
                "uploaded_by": row.uploaded_by,
            }
            for row in registry.list_evidence(target)
        ]
        ingested, tampered = state.absorb_integrity(target)
    except RegistryError:
        return RunProjection(state.state_dir / "__no_case__")
    return RunProjection(
        output_dir,
        uploaded=uploaded,
        ingested=ingested,
        tampered=tampered,
        case_id=target,
    )


def _job_view(job: Job) -> dict[str, Any]:
    return {
        "jobId": job.job_id,
        "caseId": job.case_id,
        "kind": job.kind,
        "status": job.status,
        "progress": round(job.progress, 4),
        "stage": job.stage,
        "totalStages": job.total_stages,
        "detail": job.detail,
        "stagesDone": job.stages_done,
        "fileCount": job.file_count,
        "requestedBy": job.requested_by,
        "jurisdictionId": job.jurisdiction_id,
        "createdAt": job.created_at,
        "startedAt": job.started_at,
        "finishedAt": job.finished_at,
        "error": job.error,
        "returncode": job.returncode,
        "runId": job.run_id,
    }


def _require_job(job_id: str) -> Job:
    job = get_state().jobs.get(job_id)
    if job is None:
        raise HTTPException(404, f"Unknown job: {job_id}")
    return job


def _fir_ids(case_id: str) -> set[str]:
    return {fir.fir_id for fir in get_registry().list_firs(case_id)}


# ---------------------------------------------------------------------------
# Session / meta
# ---------------------------------------------------------------------------
@app.get("/api/meta")
def meta() -> dict[str, Any]:
    """Everything the sign-in picker needs before a session exists."""
    return {"roles": list(ROLES), "jurisdictions": list(JURISDICTIONS)}


@app.post("/api/session")
def start_session(body: SessionStart) -> dict[str, Any]:
    # The HTTP surface is camelCase like the rest of the API; providers take
    # Python-style snake_case.
    payload = {
        "display_name": body.displayName,
        "role": body.role,
        "jurisdiction_id": body.jurisdictionId,
    }
    if body.credentials:
        payload.update(body.credentials)
    try:
        identity, token = get_provider().start(payload)
    except IdentityError as exc:
        raise HTTPException(400, str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(501, str(exc)) from exc
    return {"identity": _identity_view(identity), "token": token}


@app.get("/api/me")
def me(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    return _identity_view(identity)


# ---------------------------------------------------------------------------
# Cases / FIRs / evidence
# ---------------------------------------------------------------------------
@app.get("/api/cases")
def list_cases() -> list[dict[str, Any]]:
    return _all_case_records()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str) -> dict[str, Any]:
    get_state().set_active(case_id)
    return _case_record(case_id)


@app.post("/api/cases", status_code=201)
def create_case(
    body: CaseCreate, identity: Identity = Depends(current_identity)
) -> dict[str, Any]:
    registry = get_registry()
    jurisdiction = body.jurisdictionId or identity.jurisdiction_id
    try:
        case, _fir = registry.create_case(
            fir_number=body.firNumber,
            title=body.title,
            description=body.description,
            jurisdiction_node_id=jurisdiction,
            filed_by_id=identity.user_id,
        )
    except RegistryError as exc:
        raise HTTPException(400, str(exc)) from exc
    get_state().set_active(case.case_id)
    return _case_record(case.case_id)


@app.post("/api/cases/{case_id}/firs", status_code=201)
def create_fir(
    case_id: str,
    body: FirCreate,
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    registry = get_registry()
    _registry_case(case_id)
    jurisdiction = body.jurisdictionId or identity.jurisdiction_id
    try:
        fir = registry.add_fir(
            case_id,
            fir_number=body.firNumber,
            description=body.description,
            jurisdiction_node_id=jurisdiction,
            filed_by_id=identity.user_id,
        )
    except RegistryError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {
        "firId": fir.fir_id,
        "firNumber": fir.fir_number,
        "caseId": fir.case_id,
        "description": fir.description,
        "createdAt": fir.created_at,
    }


@app.get("/api/cases/{case_id}/firs")
def list_firs(case_id: str) -> list[dict[str, Any]]:
    _registry_case(case_id)
    registry = get_registry()
    return [
        {
            "firId": fir.fir_id,
            "firNumber": fir.fir_number,
            "caseId": fir.case_id,
            "description": fir.description,
            "filedById": fir.filed_by_id,
            "status": fir.investigation_status,
            "createdAt": fir.created_at,
            "fileCount": len(fir.files),
        }
        for fir in registry.list_firs(case_id)
    ]


@app.post("/api/cases/{case_id}/firs/{fir_id}/evidence", status_code=201)
async def upload_evidence(
    case_id: str,
    fir_id: str,
    files: list[UploadFile] = File(...),
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    """Append evidence to a FIR.

    Content is stored verbatim — the pipeline's Stage 1 parsers decide what is
    readable, and anything adversarial is reported rather than rejected. That
    is the "at their own risk" contract: re-uploading can add files but never
    overwrites an earlier one (``attach_files`` suffixes duplicates).
    """
    registry = get_registry()
    _registry_case(case_id)
    if fir_id not in _fir_ids(case_id):
        raise HTTPException(404, f"Unknown FIR: {fir_id}")

    rows = []
    for upload in files:
        if not upload.filename:
            raise HTTPException(400, "A file is missing a filename")
        content = await upload.read()
        rows.append((upload.filename, content, upload.content_type or ""))

    if not rows:
        raise HTTPException(400, "No files supplied")

    try:
        stored = registry.attach_files(fir_id, rows, uploaded_by=identity.user_id)
    except RegistryError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {
        "files": [
            {
                "storedName": row.stored_name,
                "originalName": row.original_name,
                "sizeBytes": row.size_bytes,
                "contentType": row.content_type,
                "sha256": row.sha256,
                "firId": row.fir_id,
                "uploadedAt": row.uploaded_at,
            }
            for row in stored
        ]
    }


@app.get("/api/cases/{case_id}/evidence")
def list_case_evidence(case_id: str) -> list[dict[str, Any]]:
    _registry_case(case_id)
    registry = get_registry()
    return [
        {
            "storedName": row.stored_name,
            "originalName": row.original_name,
            "sizeBytes": row.size_bytes,
            "contentType": row.content_type,
            "sha256": row.sha256,
            "firId": row.fir_id,
            "uploadedAt": row.uploaded_at,
            "uploadedBy": row.uploaded_by,
        }
        for row in registry.list_evidence(case_id)
    ]


# ---------------------------------------------------------------------------
# Run trigger + job polling
# ---------------------------------------------------------------------------
@app.post("/api/cases/{case_id}/run")
def run_case(
    case_id: str,
    body: RunRequest,
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    state = get_state()
    registry = state.registry
    _registry_case(case_id)
    if not registry.list_firs(case_id):
        raise HTTPException(400, "Case has no FIR to process")

    output_dir = registry.output_dir(case_id)
    has_prior_run = (output_dir / "graph_nodes.json").is_file()
    # Capture the outgoing run's verdicts before it is overwritten. Without
    # this, a second run started without any intervening read would lose the
    # first run's adversarial flags from the ledger.
    state.absorb_integrity(case_id)
    # An append request against a case that has never run is just a full run.
    incremental = bool(body.append) and has_prior_run

    job = state.jobs.create(
        case_id=case_id,
        kind="incremental" if incremental else "full",
        requested_by=identity.user_id,
        jurisdiction_id=identity.jurisdiction_id,
        file_count=len(registry.list_evidence(case_id)),
    )
    argv = build_argv(
        _SYSTEM_DIR,
        registry.manifest_path(case_id),
        output_dir,
        case_id=case_id,
        jurisdiction_id=identity.jurisdiction_id,
        incremental=incremental,
        no_database=body.noDatabase,
    )
    state.runner.submit(job, argv)
    state.set_active(case_id)
    return _job_view(job)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    return _job_view(_require_job(job_id))


@app.get("/api/cases/{case_id}/jobs")
def list_case_jobs(case_id: str) -> list[dict[str, Any]]:
    _registry_case(case_id)
    return [_job_view(job) for job in get_state().jobs.list_for_case(case_id)]


# ---------------------------------------------------------------------------
# Findings — read-only projections of the run output
# ---------------------------------------------------------------------------
@app.get("/api/entities")
def get_entities(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).entities()


@app.get("/api/entities/{entity_id}")
def get_entity(entity_id: str, caseId: str | None = None) -> dict[str, Any]:
    for row in _projection(caseId).entities():
        if row["id"] == entity_id:
            return row
    raise HTTPException(404, f"Unknown entity: {entity_id}")


@app.get("/api/network")
def get_network(caseId: str | None = None) -> dict[str, Any]:
    return _projection(caseId).network(caseId or "")


@app.get("/api/cdr")
def get_cdr(caseId: str | None = None) -> dict[str, Any]:
    proj = _projection(caseId)
    return {"records": proj.cdr_records(), "summary": proj.cdr_summary()}


@app.get("/api/money")
def get_money(caseId: str | None = None) -> dict[str, Any]:
    return _projection(caseId).money_flow(caseId or "")


@app.get("/api/map")
def get_map(caseId: str | None = None) -> dict[str, Any]:
    return _projection(caseId).map_data()


@app.get("/api/faces")
def get_faces(caseId: str | None = None) -> list[dict[str, Any]]:
    """Stub. Face recognition is planned for the pipeline but not wired.

    Returns an empty list with the same shape the page already consumes, so
    wiring the real stage later changes only this body.
    """
    return _projection(caseId).face_records()


@app.get("/api/faces/status")
def face_status() -> dict[str, Any]:
    return {
        "available": False,
        "stage": "pending",
        "reason": "Face recognition runs as a pipeline stage and is not enabled.",
        "endpoints": ["/api/faces", "/api/faces/status"],
    }


@app.get("/api/evidence")
def get_evidence(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).evidence_records()


@app.get("/api/custody")
def get_custody(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).custody_events()


@app.get("/api/audit")
def get_audit(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).audit_events()


@app.get("/api/timeline")
def get_timeline(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).timeline_events()


@app.get("/api/insights")
def get_insights(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).insights()


@app.get("/api/feed")
def get_feed(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).intelligence_feed()


@app.get("/api/notifications")
def get_notifications(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).notifications()


@app.get("/api/messages")
def get_messages(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).seeded_messages()


@app.get("/api/dashboard")
def get_dashboard(
    role: str = Query("INSPECTOR"), caseId: str | None = None
) -> dict[str, Any]:
    if role not in ROLES:
        raise HTTPException(400, f"Unknown role: {role}")
    return _projection(caseId).dashboard(role)


@app.get("/api/metrics")
def get_metrics(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).metrics()


@app.get("/api/analytics")
def get_analytics(caseId: str | None = None) -> dict[str, Any]:
    """Graph analytics: centrality, communities, components, paths, zones."""
    return _projection(caseId).analytics()


@app.get("/api/search")
def search(
    q: str = Query("", max_length=120), caseId: str | None = None
) -> list[dict[str, Any]]:
    return _projection(caseId).search(q, _all_case_records())


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=DEFAULT_PORT)
