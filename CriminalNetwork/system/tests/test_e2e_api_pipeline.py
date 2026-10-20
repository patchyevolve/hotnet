"""End-to-end pipeline lifecycle through the FastAPI surface.

The other API tests drive single routes against hand-written fixtures; this one
is the investigator's whole story against a live ``TestClient``: sign in, open a
case, register a FIR, upload the demo evidence, trigger the real pipeline the
way ``POST /api/cases/{id}/run`` always does, then read the projections back.

That matters because three layers meet here and none of them is covered
alone: the registry wiring (manifest built from uploaded bytes), the job
runner (``run.py`` as a subprocess, progress parsed out of its log), and the
projection layer (the JSON that page reads must be schema-valid for a *real*
run, not only for a fixture someone typed).

Isolation: ``CRIMENET_STATE_DIR`` is a fresh ``tmp_path`` per test and
``CRIMENET_SESSION_SECRET`` is pinned, so the registry, job store and signed
tokens start empty and nothing leaks into ``system/.state`` or the next test.
Run is submitted with ``noDatabase: True`` — PostgreSQL is not part of what
this file verifies, and the pipeline's file outputs are what the projections
project.

``test_live_api_health`` is deliberately separate: it talks to the container on
localhost:8000 when one is listening and skips when it is not, so the suite
stays green on a machine with no Docker stack running.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import app, get_state

SYSTEM_DIR = Path(__file__).resolve().parents[1]
DEMO_DIR = SYSTEM_DIR.parent / "demo_data"

#: Sample evidence this run ingests — the smallest pair that still exercises
#: both the narrative extractor (FIR text) and the CDR parser (CSV).
SAMPLE_FILES: tuple[tuple[str, str], ...] = (
    ("01_FIR.txt", "text/plain"),
    ("02_CDR_Rakesh.csv", "text/csv"),
)

LIVE_API_META = "http://localhost:8000/api/meta"

#: Poll budget for one pipeline run. Measured runs of this evidence finish in
#: well under a minute; the bound only exists so a wedged subprocess fails the
#: test with diagnostics instead of hanging the suite forever.
JOB_TIMEOUT_SECONDS = 240.0
JOB_POLL_INTERVAL_SECONDS = 0.5


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A live app bound to an isolated state directory.

    ``with TestClient(app)`` runs the lifespan, which is what constructs
    ``ApiState`` — without it every route answers 503 "API is starting up".
    The pinned secret keeps mint and verify on one key (see the same fixture
    in ``test_api_views.py``).
    """
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv(
        "CRIMENET_SESSION_SECRET", "mimo-task003-e2e-session-secret-0123456789"
    )
    with TestClient(app) as test_client:
        yield test_client


def _sign_in(client: TestClient, role: str, display_name: str) -> dict[str, str]:
    """Exchange a session payload for the bearer header every route reads."""
    response = client.post(
        "/api/session",
        json={
            "displayName": display_name,
            "role": role,
            "jurisdictionId": "JURISDICTION_DEFAULT",
        },
    )
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    assert token
    return {"Authorization": f"Bearer {token}"}


def _demo_bytes(name: str) -> bytes:
    path = DEMO_DIR / name
    assert path.is_file(), f"Demo evidence missing: {path}"
    return path.read_bytes()


def _job_log_tail(job_id: str, lines: int = 40) -> str:
    """Last lines of the subprocess log, for a failure message only."""
    try:
        job = get_state().jobs.get(job_id)
        path = Path(job.log_file) if job and job.log_file else None
        if not path or not path.is_file():
            return ""
        tail = path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
        return "\n--- pipeline log tail ---\n" + "\n".join(tail)
    except Exception:  # noqa: BLE001 - diagnostics must never mask the failure
        return ""


def _wait_for_job(client: TestClient, job_id: str) -> dict:
    """Poll ``GET /api/jobs/{job_id}`` until it reaches a terminal state.

    Bounded by wall clock: on timeout the test fails carrying the job's last
    reported stage plus the subprocess log tail, so a wedged run is
    diagnosable from the pytest output alone.
    """
    deadline = time.monotonic() + JOB_TIMEOUT_SECONDS
    last: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200, response.text
        last = response.json()
        if last["status"] in {"completed", "failed"}:
            return last
        time.sleep(JOB_POLL_INTERVAL_SECONDS)
    pytest.fail(
        f"Job {job_id} never finished in {JOB_TIMEOUT_SECONDS:.0f}s — "
        f"status={last.get('status')} stage={last.get('stage')}/"
        f"{last.get('totalStages')} detail={last.get('detail')!r} "
        f"error={last.get('error')!r}"
        + _job_log_tail(job_id)
    )


def test_full_pipeline_lifecycle_through_the_api(client: TestClient):
    """Session → case → FIR → evidence → run → projections, in one pass.

    Roles follow the division of duty in ``require_roles``: the SUPERVISOR
    opens the case, the INSPECTOR does the operational work (FIR, evidence,
    run). Every assertion below is on the wire contract the frontend consumes.
    """
    supervisor = _sign_in(client, "SUPERVISOR", "Sup. Menon")
    inspector = _sign_in(client, "INSPECTOR", "Insp. Sharma")

    # -- case ------------------------------------------------------------
    created = client.post(
        "/api/cases",
        headers=supervisor,
        json={
            "firNumber": "FIR/2026/0042",
            "title": "Rakesh call-network analysis",
            "description": "End-to-end verification of the pipeline lifecycle",
            "jurisdictionId": "JURISDICTION_DEFAULT",
        },
    )
    assert created.status_code == 201, created.text
    case_id = created.json()["id"]
    assert case_id.startswith("CASE_")

    # -- FIR -------------------------------------------------------------
    fir = client.post(
        f"/api/cases/{case_id}/firs",
        headers=inspector,
        json={
            "firNumber": "FIR/2026/0042-A",
            "description": "Supplementary CDR evidence",
        },
    )
    assert fir.status_code == 201, fir.text
    fir_id = fir.json()["firId"]
    assert fir.json()["caseId"] == case_id

    # -- evidence --------------------------------------------------------
    upload = client.post(
        f"/api/cases/{case_id}/firs/{fir_id}/evidence",
        headers=inspector,
        files=[
            ("files", (name, _demo_bytes(name), content_type))
            for name, content_type in SAMPLE_FILES
        ],
    )
    assert upload.status_code == 201, upload.text
    uploaded = upload.json()["files"]
    assert [row["originalName"] for row in uploaded] == [
        name for name, _ in SAMPLE_FILES
    ]
    assert all(row["sha256"].startswith("sha256:") for row in uploaded)

    listed = client.get(f"/api/cases/{case_id}/evidence", headers=inspector)
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == len(SAMPLE_FILES)

    # -- run -------------------------------------------------------------
    run = client.post(
        f"/api/cases/{case_id}/run",
        headers=inspector,
        json={"noDatabase": True},
    )
    assert run.status_code == 200, run.text
    job_id = run.json()["jobId"]
    assert run.json()["caseId"] == case_id
    assert run.json()["fileCount"] == len(SAMPLE_FILES)

    job = _wait_for_job(client, job_id)
    assert job["status"] == "completed", (
        f"pipeline failed: {job.get('error')!r} stage={job.get('stage')}"
        f"/{job.get('totalStages')} detail={job.get('detail')!r}"
        + _job_log_tail(job_id)
    )
    assert job["returncode"] == 0
    assert job["progress"] == 1.0

    # -- projections -----------------------------------------------------
    case = client.get(f"/api/cases/{case_id}", headers=inspector)
    assert case.status_code == 200, case.text
    record = case.json()
    assert record["id"] == case_id
    assert record["title"] == "Rakesh call-network analysis"
    assert record["status"]
    # A finished run must be visible on the case row, not just on disk.
    assert record["counts"]["nodes"] > 0

    entities = client.get(
        "/api/entities", params={"caseId": case_id}, headers=inspector
    )
    assert entities.status_code == 200, entities.text
    rows = entities.json()
    assert isinstance(rows, list) and rows, "a real run must resolve entities"
    for row in rows:
        assert row["id"] and row["name"]
        assert row["linkedCaseIds"] == [case_id]

    network = client.get(
        "/api/network", params={"caseId": case_id}, headers=inspector
    )
    assert network.status_code == 200, network.text
    graph = network.json()
    assert graph["caseId"] == case_id
    assert graph["nodes"], "graph_nodes.json projected no nodes"
    assert graph["edges"], "graph_edges.json projected no edges"
    for node in graph["nodes"]:
        assert node["id"] and node["label"]
        assert 0.0 <= node["x"] <= 100.0 and 0.0 <= node["y"] <= 100.0
    node_ids = {node["id"] for node in graph["nodes"]}
    for edge in graph["edges"]:
        assert edge["source"] in node_ids and edge["target"] in node_ids

    timeline = client.get(
        "/api/timeline", params={"caseId": case_id}, headers=inspector
    )
    assert timeline.status_code == 200, timeline.text
    events = timeline.json()
    assert isinstance(events, list) and events, "no timeline events projected"
    for event in events:
        assert {"id", "at", "title", "kind"} <= set(event)

    dashboard = client.get(
        "/api/dashboard", params={"caseId": case_id}, headers=inspector
    )
    assert dashboard.status_code == 200, dashboard.text
    payload = dashboard.json()
    metrics = payload.get("metrics")
    assert isinstance(metrics, list) and metrics, "no dashboard metrics"
    for metric in metrics:
        assert {"id", "label", "value"} <= set(metric)
    assert payload["riskBreakdown"]
    assert payload["widgets"]


def test_live_api_health():
    """Live container check: ``GET /api/meta`` on localhost:8000.

    Reachable → 200 with the sign-in picker's roles; nothing listening → skip,
    so the file still runs on a machine where the Docker stack is down.
    """
    try:
        with urllib.request.urlopen(LIVE_API_META, timeout=3) as handle:
            status = handle.status
            body = handle.read()
    except urllib.error.HTTPError as exc:
        # Reachable but not 2xx: that is a failure, not an absent container.
        status, body = exc.code, exc.read()
    except (urllib.error.URLError, OSError, TimeoutError):
        pytest.skip(f"No API reachable at {LIVE_API_META}")

    assert status == 200, f"/api/meta answered {status}: {body[:200]!r}"
    payload = json.loads(body.decode("utf-8"))
    assert payload.get("roles"), "/api/meta returned no roles for the picker"
    assert "INSPECTOR" in payload["roles"]
