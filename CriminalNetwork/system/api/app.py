"""FastAPI surface for the CrimeNet frontend.

Serves three distinct kinds of data:

* **Accounts** — register, log in, read the caller, change a password. These
  read and write the persistent user store; the token they mint is verified
  by the same identity layer every other route already depends on.
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
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from api.activity import CaseActivityStore
from api.identity import (
    JURISDICTIONS,
    ROLES,
    CredentialIdentityProvider,
    Identity,
    IdentityError,
    IdentityProvider,
    get_provider,
)
from api.jobs import Job, JobStore, PipelineRunner, build_argv
from api.projection import RunProjection
from api.registry import CaseRegistry, RegistryError
from api.schemas import (
    AuthChangePasswordRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    CaseAccessGrantRequest,
    CaseCreate,
    FaceDecision,
    FirCreate,
    RunRequest,
    SessionStart,
)
from api.user_store import UserStore, UserStoreError, seed_demo_accounts_from_env

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
        self.users = UserStore(state_dir)
        # ``CaseAccess`` rows (Prisma model). Defaults to the file store;
        # ``CRIMENET_CASE_ACCESS_STORE=prisma`` swaps in the Prisma client.
        self.case_access = build_case_access_store(state_dir)
        self.runner = PipelineRunner(_SYSTEM_DIR, self.jobs)
        # Hash-chained per-case activity: who did what, when, on this case.
        self.activity = CaseActivityStore(state_dir / "cases")
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


def get_user_store() -> UserStore:
    """The live account store, shared by every ``/api/auth/*`` route."""
    return get_state().users


def get_credential_provider() -> CredentialIdentityProvider:
    """Credential provider bound to this app's own store and state dir.

    ``/api/auth/login`` mints through this rather than through
    :func:`get_provider` so a login always produces a credential token —
    even while the demo picker is still the active provider.
    """
    return CredentialIdentityProvider(user_store=get_user_store())


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _state
    _state = ApiState(_state_dir())
    # Demo sign-ins exist only where CRIMENET_SEED_DEMO_USERS says so —
    # docker-compose turns it on for the demo stack, everything else keeps
    # the gate closed (see seed_demo_accounts_from_env).
    seed_demo_accounts_from_env(_state.users)
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
def _verifying_providers() -> tuple[IdentityProvider, ...]:
    """Who may vouch for a bearer token on this request.

    The active provider always decides, so ``CRIMENET_AUTH_PROVIDER=credential``
    keeps refusing picker tokens — that refusal is the whole point of the
    swap. The one extra allowance runs the other way: while the picker is
    still active, credential tokens minted by ``/api/auth/login`` must verify
    too, or the account endpoints would only work on deployments that had
    already flipped the flag. Both token kinds are signed with the same server
    secret, so accepting either never lets a client forge an identity.
    """
    active = get_provider(_state_dir())
    if active.name == CredentialIdentityProvider.name:
        return (active,)
    return (active, CredentialIdentityProvider())


def _verify_token(token: str) -> Identity:
    """Verify against every acceptable provider; keep the first diagnosis.

    The active provider runs first, so its error ("expired", "picker token
    refused in credential mode") is what the caller sees when nothing
    accepts the token.
    """
    first_error: IdentityError | None = None
    for provider in _verifying_providers():
        try:
            return provider.verify(token)
        except IdentityError as exc:
            if first_error is None:
                first_error = exc
    if first_error is None:
        raise IdentityError("Token was rejected")
    raise first_error


def current_identity(
    authorization: str | None = Header(default=None),
) -> Identity:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        return _verify_token(authorization.split(" ", 1)[1].strip())
    except IdentityError as exc:
        raise HTTPException(401, str(exc)) from exc


# ---------------------------------------------------------------------------
# RBAC — role hierarchy + CaseAccess (api/rbac.py)
# ---------------------------------------------------------------------------
# Re-exported here so route files and tests keep importing from ``api.app``;
# the implementations live in ``api/rbac.py``.
from api.rbac import (  # noqa: E402 - after current_identity (lazy DI target)
    AUDIT_ROLES,
    CASE_ACCESS_LEVELS,
    CaseAccessGuard,
    CaseAccessGrant,
    CaseAccessStore,
    JsonCaseAccessStore,
    build_case_access_store,
    requires_case_access,
    requires_roles,
    station_baseline,
)

#: Backwards-compatible alias: the decorator was named ``require_roles``
#: before the plural form became canonical. Nothing in the API contract
#: depends on the Python name, so both keep working.
require_roles = requires_roles


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


def _active_case_or_none() -> str | None:
    """The active case, or ``None`` when the API state has not started.

    ``get_state()`` answers 503 there, and a plain-function call into a
    handler (as the projection unit tests do) has no state at all. Both fall
    through to ``_projection(None)``, which is what raises the 503 on a live
    server — deciding "no active case" is only possible once state exists.
    """
    return _state.active_case() if _state is not None else None


def _log_activity(
    case_id: str,
    identity: Identity,
    action: str,
    target: str = "",
    detail: str = "",
) -> None:
    """Append an investigator action to the case's hash-chained ledger.

    The ledger *is* the case's activity history (the overview's Case Activity
    panel and any supervisor review read it), so a mutation that cannot record
    who did it fails loudly rather than leaving a silent hole. Direct
    handler calls with no live state (unit tests) have nothing to record.
    """
    if _state is None or not case_id:
        return
    _state.activity.append(
        case_id,
        actor_id=identity.user_id,
        actor_name=identity.display_name,
        actor_role=identity.role,
        action=action,
        target=target,
        detail=detail,
    )


def _activity_payload(case_id: str) -> dict[str, Any]:
    """One case's merged activity: chained user actions + pipeline trail.

    ``entries`` is newest-first. ``chainValid`` is recomputed over the user
    chain on every read — the report of who did what is only trustworthy
    together with the verification of its chain.
    """
    state = get_state()
    rows = state.activity.list(case_id)
    chain_ok = state.activity.verify(case_id)
    pipeline = _projection(case_id).audit_events()
    entries: list[dict[str, Any]] = [
        {
            "source": "activity",
            "caseId": case_id,
            "id": f"ACT_{int(row.get('seq') or 0):04d}",
            **row,
        }
        for row in rows
    ]
    entries.extend(
        {
            "source": "pipeline",
            "caseId": case_id,
            "hash": "",
            "prevHash": "",
            "actorId": "",
            "actorName": "",
            "actorRole": "",
            **event,
        }
        for event in pipeline
    )
    entries.sort(
        key=lambda row: (
            str(row.get("at") or ""),
            int(row.get("seq") or 0),
        ),
        reverse=True,
    )
    return {
        "caseId": case_id,
        "entries": entries,
        "chainValid": chain_ok,
        "chainLength": len(rows),
        "pipelineEvents": len(pipeline),
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


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
        identity, token = get_provider(_state_dir()).start(payload)
    except IdentityError as exc:
        raise HTTPException(400, str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(501, str(exc)) from exc
    return {"identity": _identity_view(identity), "token": token}


@app.get("/api/me")
def me(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    return _identity_view(identity)


# ---------------------------------------------------------------------------
# Credential accounts (/api/auth/*)
# ---------------------------------------------------------------------------
def _login_error_status(message: str) -> int:
    """Map a store refusal to HTTP: 403 for the lifecycle, 401 otherwise.

    A pending or inactive *account* is an authorisation problem, while a
    wrong password must answer exactly like an unknown account (401) so
    probing cannot enumerate registered addresses.
    """
    if "pending approval" in message or "inactive" in message:
        return 403
    return 401


@app.post("/api/auth/register", status_code=201)
def register_account(body: AuthRegisterRequest) -> dict[str, Any]:
    """Self-signup. Nobody grants themselves a role: the account lands
    ``PENDING_APPROVAL`` with ``INSPECTOR`` and cannot authenticate until an
    ADMIN or SUPERVISOR approves it in the user store."""
    try:
        user = get_user_store().register(
            email=body.email,
            name=body.name,
            password=body.password,
            jurisdiction_node_id=body.jurisdictionId,
            badge_id=body.badgeId,
        )
    except UserStoreError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {
        "user": user.to_public_dict(),
        "message": "Registration submitted for supervisor approval",
    }


@app.post("/api/auth/login")
def login(body: AuthLoginRequest) -> dict[str, Any]:
    """Exchange credentials for a signed bearer token.

    Minted by the credential provider bound to this app's store, so the token
    verifies on a stock (picker) deployment too — see :func:`_verifying_providers`.
    """
    try:
        user = get_user_store().authenticate(body.emailOrBadge, body.password)
    except UserStoreError as exc:
        raise HTTPException(_login_error_status(str(exc)), str(exc)) from exc
    _identity, token = get_credential_provider().issue(user)
    return {"token": token, "user": user.to_public_dict()}


@app.get("/api/auth/me")
def auth_me(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    """The caller's identity plus the account behind it, when there is one.

    A picker identity has no row in the user store, so ``user`` comes back
    null rather than the route refusing a token it has just accepted."""
    user = get_user_store().get_by_id(identity.user_id)
    return {
        "identity": _identity_view(identity),
        "user": user.to_public_dict() if user else None,
    }


@app.get("/api/auth/effective-level")
def effective_level(
    caseId: str | None = Query(default=None),
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    """The caller's effective ``CaseAccess`` level — the one lookup the
    frontend makes before rendering a guarded surface.

    * ``caseId`` given — the level on that case: station baseline, creator
      grant and explicit ``CaseAccess`` rows, the maximum of the three
      (``NONE`` when none apply). An unknown case is 404, exactly like
      ``GET /api/cases/{caseId}``.
    * omitted — the caller's own-station baseline (``STATION_BASELINE``), so
      the client can scope navigation before any case is chosen. ADMIN is
      global, so its baseline is ADMIN wherever it signs in from.

    Authentication runs first: no token, no answer (401). The level never
    exceeds what :class:`CaseAccessGuard` would decide for the same case.
    """
    if not caseId:
        return {
            "level": station_baseline(identity.role),
            "caseId": None,
            "role": identity.role,
        }
    try:
        case = get_registry().get_case(caseId)
    except RegistryError as exc:
        raise HTTPException(404, str(exc)) from exc
    level = CaseAccessGuard().effective_level(identity, case)
    return {"level": level, "caseId": caseId, "role": identity.role}


@app.post("/api/auth/change-password")
def change_password(
    body: AuthChangePasswordRequest,
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    """Rotate the caller's own password.

    The user id is read from the verified token, never from the body: an
    investigator can only change the password of the account they are signed
    in as. Completing a forced change (the bootstrap admin) also promotes the
    account to ACTIVE, which is what lets it approve anyone afterwards."""
    try:
        user = get_user_store().change_password(
            identity.user_id, body.oldPassword, body.newPassword
        )
    except UserStoreError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {
        "user": user.to_public_dict(),
        "message": "Password updated successfully",
    }


# ---------------------------------------------------------------------------
# Cases / FIRs / evidence
# ---------------------------------------------------------------------------
@app.get("/api/cases")
def list_cases() -> list[dict[str, Any]]:
    return _all_case_records()


@app.get("/api/cases/{case_id}")
def get_case(
    case_id: str,
    identity: Identity = Depends(
        requires_case_access(
            "ADMIN", "SUPERVISOR", "INSPECTOR", "AUDIT_LOGGER", level="READ"
        )
    ),
) -> dict[str, Any]:
    """Case detail. Every role may *attempt* a read, but the CaseAccess
    guard decides which cases: station baseline (ADMIN global,
    SUPERVISOR/INSPECTOR/AUDIT_LOGGER own-station) plus explicit grants."""
    get_state().set_active(case_id)
    return _case_record(case_id)


@app.post("/api/cases", status_code=201)
def create_case(
    body: CaseCreate,
    identity: Identity = Depends(requires_roles("ADMIN", "SUPERVISOR")),
) -> dict[str, Any]:
    """Open a root case. ADMIN may register it at any station; SUPERVISOR is
    station-scoped to its own jurisdiction. The creator is granted ADMIN
    access to the new case (the ``CaseAccess`` design: "when a Case is
    created, the creator gets ADMIN access")."""
    registry = get_registry()
    jurisdiction = body.jurisdictionId or identity.jurisdiction_id
    if identity.role != "ADMIN" and jurisdiction != identity.jurisdiction_id:
        raise HTTPException(
            403,
            f"Role {identity.role!r} may only open cases in its own station "
            f"({identity.jurisdiction_id!r})",
        )
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
    get_state().case_access.grant(
        user_id=identity.user_id,
        case_id=case.case_id,
        access_level="ADMIN",
        granted_by=identity.user_id,
    )
    get_state().set_active(case.case_id)
    _log_activity(
        case.case_id,
        identity,
        "case_opened",
        target=case.case_id,
        detail=body.title,
    )
    return _case_record(case.case_id)


@app.post("/api/cases/{case_id}/access", status_code=201)
def grant_case_access(
    case_id: str,
    body: CaseAccessGrantRequest,
    identity: Identity = Depends(requires_roles("ADMIN", "SUPERVISOR")),
) -> dict[str, Any]:
    """Grant (or update) a ``CaseAccess`` row for one user on one case.

    ADMIN may grant on any case; SUPERVISOR only within its own station.
    The row is the design's authorization layer: READ/WRITE/ADMIN, optional
    expiry, upserted on (userId, caseId) exactly like the Prisma model's
    unique constraint.
    """
    case = _registry_case(case_id)
    if identity.role != "ADMIN" and case.jurisdiction_node_id != identity.jurisdiction_id:
        raise HTTPException(
            403,
            f"Role {identity.role!r} may only grant access within its own "
            f"station ({identity.jurisdiction_id!r})",
        )
    expires_at = body.expiresAt.isoformat() if body.expiresAt else None
    grant = get_state().case_access.grant(
        user_id=body.userId,
        case_id=case_id,
        access_level=body.accessLevel,
        granted_by=identity.user_id,
        expires_at=expires_at,
    )
    _log_activity(
        case_id,
        identity,
        "access_granted",
        target=body.userId,
        detail=f"{body.accessLevel} access",
    )
    return grant.to_dict()


@app.post("/api/cases/{case_id}/firs", status_code=201)
def create_fir(
    case_id: str,
    body: FirCreate,
    identity: Identity = Depends(
        requires_case_access("ADMIN", "SUPERVISOR", "INSPECTOR")
    ),
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
    _log_activity(
        case_id,
        identity,
        "fir_added",
        target=fir.fir_id,
        detail=fir.fir_number,
    )
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
    identity: Identity = Depends(
        requires_case_access("ADMIN", "SUPERVISOR", "INSPECTOR")
    ),
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

    names = ", ".join(row.original_name for row in stored[:5])
    if len(stored) > 5:
        names += ", …"
    _log_activity(
        case_id,
        identity,
        "evidence_uploaded",
        target=fir_id,
        detail=names,
    )

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
    identity: Identity = Depends(
        requires_case_access("ADMIN", "SUPERVISOR", "INSPECTOR")
    ),
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
    _log_activity(
        case_id,
        identity,
        "run_started",
        target=job.job_id,
        detail="incremental" if incremental else "full",
    )
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
    """Face-recognition readiness + this run's Stage 2.5 stats.

    ``available`` is True when the pipeline carries the face stages (doc 08);
    ``modelAvailable`` says whether insightface weights are present in this
    environment — the pipeline degrades to zero faces without them.
    """
    from src.faces.engine import model_available  # lazy: optional dependency

    data = _projection(None).read("face_embeddings.json")
    stats = data.get("stats", {}) if isinstance(data, dict) else {}
    return {
        "available": True,
        "modelAvailable": model_available(),
        "reason": "Face recognition runs as pipeline stages 1.5 (detection), "
                  "2 (embedding) and 2.5 (matching).",
        "endpoints": ["/api/faces", "/api/faces/status", "/api/faces/decision"],
        "stats": stats,
    }


@app.post("/api/faces/decision")
def record_face_decision(
    body: FaceDecision,
    caseId: str | None = None,
    identity: Identity = Depends(
        requires_roles("ADMIN", "SUPERVISOR", "INSPECTOR")
    ),
) -> dict[str, Any]:
    """Investigator confirm/reject of a proposed face match.

    Persists to ``face_decisions.json`` beside the targeted case's run
    outputs, so every later projection of the same run still shows who
    decided what; re-running the pipeline never clears a decision.

    The case is ``body.caseId`` when the caller supplies one (the screen may
    be reviewing a case other than the global active one), else the
    ``caseId`` query param, else the active case. Without that, a decision
    made while another case was active would silently be filed against the
    wrong case.

    The target is resolved first, then run through :class:`CaseAccessGuard`
    — the case id is not a path parameter here, so the guard cannot be a
    route dependency. An unknown face keeps its 404; a foreign-jurisdiction
    identity is refused with 403 before it learns whether the face exists.
    """
    target_case = body.caseId or caseId or _active_case_or_none()
    if not target_case and _state is not None:
        raise HTTPException(404, "No active or specified case")

    # Guard only on a live server, mirroring `_active_case_or_none`: a
    # plain-function call into this handler (the stage-12 unit tests) has
    # neither state nor a real identity to check.
    if target_case is not None and _state is not None:
        CaseAccessGuard().authorize(identity, target_case, "WRITE")

    projection = _projection(target_case)
    current = next(
        (row for row in projection.face_records() if row["id"] == body.faceId),
        None,
    )
    if current is None:
        where = f"case {target_case}" if target_case else "the active case"
        raise HTTPException(
            404, f"Face record {body.faceId} not found in {where}"
        )

    path = projection.output_dir / "face_decisions.json"
    payload: dict[str, Any] = {"decisions": {}}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict) and isinstance(loaded.get("decisions"), dict):
                payload = {"decisions": loaded["decisions"]}
        except (OSError, ValueError):
            pass
    reviewer = body.reviewer.strip() or identity.display_name or identity.user_id
    payload["decisions"][body.faceId] = {
        "decision": body.decision,
        "reviewer": reviewer,
        "note": body.note,
        "decidedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    _log_activity(
        target_case or "",
        identity,
        "face_decision",
        target=body.faceId,
        detail=str(body.decision),
    )

    return next(
        row for row in projection.face_records() if row["id"] == body.faceId
    )


_FACE_IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def resolve_face_image(registry: CaseRegistry, case_id: str, name: str) -> Path:
    """Resolve an ingested image inside a case directory.

    The face-comparison view asks for bare filenames (``matchedFrom`` /
    ``comparison.*.file``), so the name must carry no directory component and
    an image extension only; ``evidence_path`` then refuses anything that
    would escape the case directory. This route serves raw files, so it must
    never be able to reach ``.env`` or the registry itself.
    """
    if Path(name).name != name:
        raise RegistryError(f"Malformed image name: {name!r}")
    if Path(name).suffix.lower() not in _FACE_IMAGE_TYPES:
        raise RegistryError(f"Not an image file: {name!r}")
    path = registry.evidence_path(case_id, name)
    if not path.is_file():
        raise FileNotFoundError(name)
    return path


@app.get("/api/faces/image")
def get_face_image(file: str, caseId: str | None = None) -> FileResponse:
    """Serve one ingested image for the side-by-side face comparison.

    Read-only like every other findings endpoint: the path is resolved inside
    the case's evidence directory (basename + extension allow-list + the
    registry's traversal check), never from a caller-supplied directory.
    """
    case_id = caseId or get_state().active_case()
    if not case_id:
        raise HTTPException(404, "No active case")
    _registry_case(case_id)
    try:
        path = resolve_face_image(get_registry(), case_id, file)
    except FileNotFoundError as exc:
        raise HTTPException(404, f"Image not found: {file}") from exc
    except RegistryError as exc:
        raise HTTPException(400, str(exc)) from exc
    return FileResponse(
        path,
        media_type=_FACE_IMAGE_TYPES[path.suffix.lower()],
        headers={"Cache-Control": "private, max-age=60"},
    )


@app.get("/api/evidence")
def get_evidence(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).evidence_records()


@app.get("/api/custody")
def get_custody(caseId: str | None = None) -> list[dict[str, Any]]:
    return _projection(caseId).custody_events()


@app.get("/api/audit")
def get_audit(
    caseId: str | None = None,
    identity: Identity = Depends(requires_roles(*AUDIT_ROLES)),
) -> list[dict[str, Any]]:
    """Audit trail, scoped by role: ADMIN global, SUPERVISOR station,
    AUDIT_LOGGER read-only (station, like SUPERVISOR). INSPECTOR is refused
    with 403 — audit oversight is not operational work.

    * ``caseId`` given — the caller needs READ on that case (guard).
    * ``caseId`` omitted and role is ADMIN — the active case's trail, as
      before; ADMIN may additionally name any case (global authority).
    * ``caseId`` omitted and role is SUPERVISOR/AUDIT_LOGGER — every case in
      the caller's own station, each row tagged with its ``caseId``.
    """
    if caseId:
        CaseAccessGuard().authorize(identity, caseId, "READ")
        return _projection(caseId).audit_events()
    if identity.role == "ADMIN":
        return _projection(None).audit_events()
    rows: list[dict[str, Any]] = []
    for case in get_registry().list_cases():
        if case.jurisdiction_node_id != identity.jurisdiction_id:
            continue
        for event in _projection(case.case_id).audit_events():
            rows.append({**event, "caseId": case.case_id})
    return rows


@app.get("/api/activity")
def get_activity(
    caseId: str | None = Query(default=None),
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    """Merged case activity: hash-chained user actions + pipeline trail.

    This is the history behind the overview's Case Activity panel — every
    investigator action on a case, chained so the record of *who did what*
    is tamper-evident, merged with the pipeline's own append-only stage log.

    Scoping answers to case access, so every assigned user reads the whole
    history of their case (including what their colleagues did on it), and a
    supervisor or ADMIN sees the same record for the cases in their
    authority:

    * ``caseId`` — READ on that case.
    * omitted — every case the caller may READ; each row is tagged with its
      ``caseId``.
    """
    if caseId:
        CaseAccessGuard().authorize(identity, caseId, "READ")
        return _activity_payload(caseId)

    entries: list[dict[str, Any]] = []
    chain_valid = True
    chain_length = 0
    pipeline_events = 0
    case_ids: list[str] = []
    for case in get_registry().list_cases():
        try:
            CaseAccessGuard().authorize(identity, case.case_id, "READ")
        except HTTPException:
            continue
        payload = _activity_payload(case.case_id)
        entries.extend(payload["entries"])
        chain_valid = chain_valid and bool(payload["chainValid"])
        chain_length += int(payload["chainLength"])
        pipeline_events += int(payload["pipelineEvents"])
        case_ids.append(case.case_id)
    entries.sort(
        key=lambda row: (
            str(row.get("at") or ""),
            int(row.get("seq") or 0),
        ),
        reverse=True,
    )
    return {
        "caseId": "",
        "entries": entries,
        "chainValid": chain_valid,
        "chainLength": chain_length,
        "pipelineEvents": pipeline_events,
        "caseIds": case_ids,
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


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


@app.get("/api/health")
def system_health(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    """Live subsystem checks — the System Status panel's source, with proof.

    Every row is measured on this request: what was checked, what it found
    (case/run/chain/evidence counts, a recomputed chain verification) and how
    long the probe took. ``operational`` is earned per check, never assumed:
    one failed probe degrades the whole report instead of painting every
    service green.
    """
    checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if _state is None:
        return {"status": "degraded", "services": [], "checkedAt": checked_at}

    services: list[dict[str, Any]] = []

    def probe(service_id: str, label: str, check: Any) -> None:
        mark = time.perf_counter()
        status = "operational"
        try:
            detail = str(check())
        except Exception:  # noqa: BLE001 - a failed probe reports degraded
            status, detail = "degraded", "check failed"
        elapsed_ms = (time.perf_counter() - mark) * 1000
        services.append(
            {
                "id": service_id,
                "label": label,
                "status": status,
                "detail": f"{detail} · {elapsed_ms:.1f} ms",
            }
        )

    def api_check() -> str:
        return "FastAPI route responding"

    def registry_check() -> str:
        cases = get_registry().list_cases()
        active = _state.active_case()
        return f"{len(cases)} case(s) registered · active {active or 'none'}"

    def pipeline_check() -> str:
        cases = get_registry().list_cases()
        active = _state.active_case()
        if not cases:
            return "no cases registered yet"
        if not active:
            raise RuntimeError("cases exist but no active case")
        nodes_path = _state.registry.output_dir(active) / "graph_nodes.json"
        if not nodes_path.is_file():
            raise RuntimeError(f"active case {active} has not run")
        nodes = json.loads(nodes_path.read_text(encoding="utf-8"))
        return f"run output present · {len(nodes)} graph nodes · {active}"

    def chain_check() -> str:
        active = _state.active_case() or ""
        rows = _state.activity.list(active) if active else []
        if not _state.activity.verify(active):
            raise RuntimeError("activity chain verification failed")
        pipeline_events = (
            len(_projection(None).audit_events()) if active else 0
        )
        return (
            f"{len(rows)} chained user entries verified · "
            f"{pipeline_events} pipeline events append-only"
        )

    def vault_check() -> str:
        active = _state.active_case()
        if not active:
            if not get_registry().list_cases():
                return "no cases registered yet"
            raise RuntimeError("no active case to inventory")
        return f"{len(get_registry().list_evidence(active))} evidence files registered"

    def faces_check() -> str:
        return f"{len(_projection(None).face_records())} face records indexed"

    probe("api", "API Service", api_check)
    probe("registry", "Case Registry", registry_check)
    probe("pipeline", "Pipeline Output", pipeline_check)
    probe("chain", "Activity Chain", chain_check)
    probe("vault", "Evidence Vault", vault_check)
    probe("faces", "Face Engine", faces_check)

    overall = (
        "ok"
        if all(row["status"] == "operational" for row in services)
        else "degraded"
    )
    return {"status": overall, "services": services, "checkedAt": checked_at}


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
