"""Case activity ledger + system health — the history behind the panels.

Covers what the overview's Case Activity and System Status panels claim:

* the hash chain itself — append links each entry to the previous one,
  ``verify`` recomputes the whole chain, and any edit breaks it;
* ``GET /api/activity`` — station scoping (an inspector outside the station
  is refused), the merge of chained user actions with the pipeline's
  append-only stage log, and ``chainValid`` reflecting a live recomputation;
* mutations actually record who did what — a grant appends an
  ``access_granted`` entry carrying the actor's identity;
* ``GET /api/health`` — every service row carries a proof-bearing detail
  (counts measured on the request, not a canned "operational");
* ``GET /api/metrics`` counts *resolved entities*, so the overview's
  "Entities Identified" can never disagree with the entity roster.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.activity import CaseActivityStore, entry_hash, GENESIS_HASH
from api.app import app, get_state

DELHI = "JURISDICTION_DELHI_CYBERCRIME"
DEFAULT = "JURISDICTION_DEFAULT"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A live app bound to an isolated state directory."""
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv(
        "CRIMENET_SESSION_SECRET", "mimo-task006-rbac-session-secret-0123456789"
    )
    monkeypatch.delenv("CRIMENET_CASE_ACCESS_STORE", raising=False)
    with TestClient(app) as test_client:
        yield test_client


def _headers_for(client, role, display_name="Test Officer", jurisdiction=DEFAULT):
    response = client.post(
        "/api/session",
        json={
            "displayName": display_name,
            "role": role,
            "jurisdictionId": jurisdiction,
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _new_case(client, headers, title="Case under test", jurisdiction=None):
    payload: dict = {"firNumber": "FIR/2024/001", "title": title}
    if jurisdiction:
        payload["jurisdictionId"] = jurisdiction
    response = client.post("/api/cases", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


# ---------------------------------------------------------------------------
# The chain itself
# ---------------------------------------------------------------------------
def test_chain_links_entries_and_survives_verification(tmp_path):
    store = CaseActivityStore(tmp_path)
    first = store.append(
        "CASE_1",
        actor_id="U1",
        actor_name="Insp. Rao",
        actor_role="INSPECTOR",
        action="case_opened",
    )
    second = store.append(
        "CASE_1",
        actor_id="U2",
        actor_name="Supt. Verma",
        actor_role="SUPERVISOR",
        action="access_granted",
        target="U1",
        detail="READ access",
    )

    assert first["prevHash"] == GENESIS_HASH
    assert second["prevHash"] == first["hash"]
    assert second["seq"] == 2
    assert store.verify("CASE_1") is True
    # The hash is the payload's, not a placeholder.
    payload = {k: v for k, v in second.items() if k != "hash"}
    assert second["hash"] == entry_hash(payload)


def test_tampering_breaks_verification(tmp_path):
    store = CaseActivityStore(tmp_path)
    store.append(
        "CASE_1",
        actor_id="U1",
        actor_name="Insp. Rao",
        actor_role="INSPECTOR",
        action="case_opened",
    )
    store.append(
        "CASE_1",
        actor_id="U1",
        actor_name="Insp. Rao",
        actor_role="INSPECTOR",
        action="evidence_uploaded",
    )

    path = Path(tmp_path / "CASE_1" / "activity.json")
    rows = json.loads(path.read_text(encoding="utf-8"))
    rows[0]["action"] = "never_happened"
    path.write_text(json.dumps(rows), encoding="utf-8")

    assert store.verify("CASE_1") is False


# ---------------------------------------------------------------------------
# GET /api/activity
# ---------------------------------------------------------------------------
def test_activity_requires_authentication(client):
    response = client.get("/api/activity")
    assert response.status_code == 401


def test_mutation_records_actor_and_chain_valid(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)

    response = client.get(f"/api/activity?caseId={case_id}", headers=admin)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["caseId"] == case_id
    assert payload["chainValid"] is True
    assert payload["chainLength"] == 1  # the case_opened entry

    opened = [
        row for row in payload["entries"] if row["action"] == "case_opened"
    ]
    assert opened, "creating the case must be recorded"
    assert opened[0]["actorName"] == "Admin Rao"
    assert opened[0]["actorRole"] == "ADMIN"
    assert opened[0]["hash"] and opened[0]["prevHash"]

    # A second user's action lands on the same chain, newest first.
    grant = client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": "USER_COLLEAGUE", "accessLevel": "READ"},
    )
    assert grant.status_code == 201, grant.text

    response = client.get(f"/api/activity?caseId={case_id}", headers=admin)
    payload = response.json()
    assert payload["chainValid"] is True
    assert payload["chainLength"] == 2
    assert payload["entries"][0]["action"] == "access_granted"
    assert payload["entries"][0]["target"] == "USER_COLLEAGUE"
    assert payload["entries"][0]["actorName"] == "Admin Rao"


def test_activity_is_scoped_to_readable_cases(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao", jurisdiction=DEFAULT)
    case_id = _new_case(client, admin, jurisdiction=DEFAULT)

    # An inspector outside the case's station sees nothing of it.
    outsider = _headers_for(client, "INSPECTOR", "Outsider", jurisdiction=DELHI)
    refused = client.get(f"/api/activity?caseId={case_id}", headers=outsider)
    assert refused.status_code == 403

    # A station inspector holds WRITE by baseline, so READ follows.
    insider = _headers_for(client, "INSPECTOR", "Innate", jurisdiction=DEFAULT)
    allowed = client.get(f"/api/activity?caseId={case_id}", headers=insider)
    assert allowed.status_code == 200, allowed.text

    # The aggregate carries only cases the caller may read, tagged by case.
    aggregate = client.get("/api/activity", headers=insider)
    assert aggregate.status_code == 200
    body = aggregate.json()
    assert case_id in body["caseIds"]
    assert all(row["caseId"] in body["caseIds"] for row in body["entries"])


def test_pipeline_trail_merges_beneath_user_actions(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)

    out_dir = get_state().registry.output_dir(case_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "audit_trail.json").write_text(
        json.dumps(
            [
                {
                    "action": "graph_completed",
                    "stage": "graph",
                    "timestamp": "2024-06-25T14:32:01",
                    "details": {},
                }
            ]
        ),
        encoding="utf-8",
    )

    response = client.get(f"/api/activity?caseId={case_id}", headers=admin)
    payload = response.json()
    assert payload["pipelineEvents"] == 1
    sources = {row["source"] for row in payload["entries"]}
    assert sources == {"activity", "pipeline"}
    pipeline_row = next(
        row for row in payload["entries"] if row["source"] == "pipeline"
    )
    assert pipeline_row["actor"] == "pipeline"
    # Pipeline rows carry no chain; only user entries are chained.
    assert pipeline_row["hash"] == ""
    assert payload["chainLength"] == 1
    assert payload["chainValid"] is True


# ---------------------------------------------------------------------------
# GET /api/health
# ---------------------------------------------------------------------------
def test_health_reports_measured_service_details(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    assert client.get("/api/health").status_code == 401

    response = client.get("/api/health", headers=admin)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert payload["checkedAt"]

    ids = [row["id"] for row in payload["services"]]
    assert ids == [
        "api",
        "registry",
        "pipeline",
        "chain",
        "vault",
        "faces",
    ]
    for row in payload["services"]:
        assert row["status"] in {"operational", "degraded"}
        # Proof: a measured finding plus the probe's latency.
        assert "·" in row["detail"]
        assert "ms" in row["detail"]
    registry_row = next(r for r in payload["services"] if r["id"] == "registry")
    assert "case(s) registered" in registry_row["detail"]


def test_health_degrades_when_the_active_case_has_not_run(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    _new_case(client, admin)  # registered + active, but no run output

    payload = client.get("/api/health", headers=admin).json()
    assert payload["status"] == "degraded"
    pipeline_row = next(r for r in payload["services"] if r["id"] == "pipeline")
    assert pipeline_row["status"] == "degraded"


# ---------------------------------------------------------------------------
# Metrics agree with the entity roster
# ---------------------------------------------------------------------------
def test_entities_identified_counts_resolved_entities_not_nodes(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)

    out_dir = get_state().registry.output_dir(case_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Three graph nodes, only two of which resolved into entities — the
    # overview must report the roster's two, exactly as /api/entities will.
    (out_dir / "graph_nodes.json").write_text(
        json.dumps(
            [
                {"id": "N1", "node_type": "person", "name": "A"},
                {"id": "N2", "node_type": "phone", "name": "B"},
                {"id": "N3", "node_type": "amount", "name": "C"},
            ]
        ),
        encoding="utf-8",
    )
    (out_dir / "resolved_entities.json").write_text(
        json.dumps(
            [
                {"id": "N1", "entity_type": "person", "canonical_name": "A"},
                {"id": "N2", "entity_type": "phone", "canonical_name": "B"},
            ]
        ),
        encoding="utf-8",
    )

    metrics = client.get(f"/api/metrics?caseId={case_id}").json()
    identified = next(m for m in metrics if m["id"] == "cc2")
    assert identified["value"] == "2"

    entities = client.get(f"/api/entities?caseId={case_id}").json()
    assert len(entities) == 2

    dashboard = client.get(
        "/api/dashboard", params={"caseId": case_id, "role": "ADMIN"}
    ).json()
    assert sum(row["value"] for row in dashboard["riskBreakdown"]) == 2
