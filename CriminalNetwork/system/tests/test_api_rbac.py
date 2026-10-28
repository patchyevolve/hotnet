"""RBAC contract: role hierarchy + CaseAccess store-backed case guards.

Covers the authorization matrix the design demands:

* role hierarchy — ADMIN ≥ SUPERVISOR ≥ INSPECTOR; AUDIT_LOGGER only when
  named (``role_satisfies`` unit tests plus live-route checks);
* ``CaseAccess`` rows (Prisma ``CaseAccess`` model shape) — creator auto-
  grant on case creation, explicit grants through
  ``POST /api/cases/{id}/access``, expiry honoured;
* station scoping — SUPERVISOR create/grant/read is bound to its own
  station; ADMIN is global;
* the four guarded case operations — GET case (READ), evidence upload
  (WRITE), pipeline run (WRITE), audit read (ADMIN global / SUPERVISOR
  station / AUDIT_LOGGER read-only, INSPECTOR refused).

401 means "no valid token", 403 "valid token, not allowed". The single-
station demo flows are locked by ``test_api_views.py`` and must stay green.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api.app import app, get_state
from api.identity import Identity
from api.rbac import (
    CaseAccessGuard,
    JsonCaseAccessStore,
    role_satisfies,
)

DELHI = "JURISDICTION_DELHI_CYBERCRIME"
MUMBAI = "JURISDICTION_MUMBAI_CYBERCRIME"
DEFAULT = "JURISDICTION_DEFAULT"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A live app bound to an isolated state directory.

    ``with TestClient(app)`` runs the lifespan, which constructs ``ApiState``
    — including its ``CaseAccess`` store — so every route is live and each
    test gets its own registry, grants and active-case pointer.
    """
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv(
        "CRIMENET_SESSION_SECRET", "mimo-task006-rbac-session-secret-0123456789"
    )
    monkeypatch.delenv("CRIMENET_CASE_ACCESS_STORE", raising=False)
    with TestClient(app) as test_client:
        yield test_client


def _headers_for(client, role, display_name="Test Officer", jurisdiction=DEFAULT):
    """Sign in through the real session route and return the bearer header."""
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


def _new_case(
    client,
    headers,
    title="Case under test",
    fir_number="FIR/2024/001",
    jurisdiction=None,
):
    payload: dict = {"firNumber": fir_number, "title": title}
    if jurisdiction:
        payload["jurisdictionId"] = jurisdiction
    response = client.post("/api/cases", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _identity(role="INSPECTOR", jurisdiction=DEFAULT, user_id="USER_TEST"):
    return Identity(
        user_id=user_id,
        display_name="Test Officer",
        role=role,
        jurisdiction_id=jurisdiction,
        provider="session",
    )


class _FakeCase:
    def __init__(self, case_id="CASE_000001", jurisdiction_node_id=DEFAULT, opened_by="USER_ADMIN"):
        self.case_id = case_id
        self.jurisdiction_node_id = jurisdiction_node_id
        self.opened_by = opened_by


# ---------------------------------------------------------------------------
# Role hierarchy (unit)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "role,allowed,expected",
    [
        # exact membership
        ("INSPECTOR", ("INSPECTOR",), True),
        ("SUPERVISOR", ("SUPERVISOR",), True),
        ("ADMIN", ("ADMIN",), True),
        ("AUDIT_LOGGER", ("AUDIT_LOGGER",), True),
        # hierarchy: higher satisfies lower
        ("SUPERVISOR", ("INSPECTOR",), True),
        ("ADMIN", ("INSPECTOR",), True),
        ("ADMIN", ("SUPERVISOR", "INSPECTOR"), True),
        ("SUPERVISOR", ("ADMIN",), False),
        ("INSPECTOR", ("ADMIN", "SUPERVISOR"), False),
        # AUDIT_LOGGER is outside the ladder
        ("AUDIT_LOGGER", ("INSPECTOR",), False),
        ("AUDIT_LOGGER", ("ADMIN", "SUPERVISOR", "INSPECTOR"), False),
        ("INSPECTOR", ("AUDIT_LOGGER",), False),
        # the root-case gate used by POST /api/cases
        ("INSPECTOR", ("ADMIN", "SUPERVISOR"), False),
        ("AUDIT_LOGGER", ("ADMIN", "SUPERVISOR"), False),
    ],
)
def test_role_satisfies_hierarchy(role, allowed, expected):
    assert role_satisfies(role, allowed) is expected


# ---------------------------------------------------------------------------
# CaseAccess store (Prisma model shape, JSON backend)
# ---------------------------------------------------------------------------
def test_case_access_store_round_trip(tmp_path):
    store = JsonCaseAccessStore(tmp_path)
    assert store.get("USER_A", "CASE_000001") is None

    grant = store.grant(
        user_id="USER_A",
        case_id="CASE_000001",
        access_level="WRITE",
        granted_by="USER_ADMIN",
    )
    assert grant.access_level == "WRITE"
    assert store.get("USER_A", "CASE_000001").access_level == "WRITE"
    assert store.get("USER_B", "CASE_000001") is None

    # upsert on (userId, caseId): re-grant replaces the level, one row only
    store.grant(
        user_id="USER_A",
        case_id="CASE_000001",
        access_level="ADMIN",
        granted_by="USER_ADMIN",
    )
    assert store.get("USER_A", "CASE_000001").access_level == "ADMIN"

    # a second state dir starts empty (no leakage between apps)
    assert JsonCaseAccessStore(tmp_path / "other").get("USER_A", "CASE_000001") is None


def test_case_access_grant_expiry(tmp_path):
    store = JsonCaseAccessStore(tmp_path)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    store.grant(
        user_id="USER_A",
        case_id="CASE_000001",
        access_level="READ",
        granted_by="USER_ADMIN",
        expires_at=past,
    )
    store.grant(
        user_id="USER_B",
        case_id="CASE_000001",
        access_level="READ",
        granted_by="USER_ADMIN",
        expires_at=future,
    )

    assert store.get("USER_A", "CASE_000001").is_expired() is True
    assert store.get("USER_B", "CASE_000001").is_expired() is False
    # unparseable expiry fails closed
    store.grant(
        user_id="USER_C",
        case_id="CASE_000001",
        access_level="READ",
        granted_by="USER_ADMIN",
        expires_at="not-a-date",
    )
    assert store.get("USER_C", "CASE_000001").is_expired() is True


def test_case_access_guard_uses_store_grants(tmp_path):
    """An explicit CaseAccess row lifts a cross-station identity; an expired
    row does not."""
    store = JsonCaseAccessStore(tmp_path)
    store.grant(
        user_id="USER_FAR",
        case_id="CASE_000001",
        access_level="WRITE",
        granted_by="USER_ADMIN",
    )
    expired_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    store.grant(
        user_id="USER_STALE",
        case_id="CASE_000001",
        access_level="WRITE",
        granted_by="USER_ADMIN",
        expires_at=expired_at,
    )
    case = _FakeCase(jurisdiction_node_id=DELHI, opened_by="USER_ADMIN")
    guard = CaseAccessGuard(
        registry_getter=lambda: None, store_getter=lambda: store
    )

    assert guard.effective_level(_identity(user_id="USER_FAR"), case) == "WRITE"
    assert guard.effective_level(_identity(user_id="USER_STALE"), case) == "NONE"
    # same row grants nothing on a different case
    other = _FakeCase(case_id="CASE_000002", jurisdiction_node_id=DELHI)
    assert guard.effective_level(_identity(user_id="USER_FAR"), other) == "NONE"


# ---------------------------------------------------------------------------
# POST /api/cases — ADMIN/SUPERVISOR, station-scoped, creator auto-grant
# ---------------------------------------------------------------------------
def test_supervisor_can_open_a_case_in_its_own_station(client):
    headers = _headers_for(client, "SUPERVISOR", "Sup. Delhi", jurisdiction=DELHI)

    case_id = _new_case(
        client, headers, title="Delhi case", fir_number="FIR/2024/100", jurisdiction=DELHI
    )

    case = get_state().registry.get_case(case_id)
    assert case.jurisdiction_node_id == DELHI
    # creator got the schema's ADMIN CaseAccess row
    grant = get_state().case_access.get(case.opened_by, case_id)
    assert grant is not None
    assert grant.access_level == "ADMIN"
    assert grant.granted_by == case.opened_by


def test_supervisor_cannot_open_a_case_in_another_station(client):
    headers = _headers_for(client, "SUPERVISOR", "Sup. Delhi", jurisdiction=DELHI)

    response = client.post(
        "/api/cases",
        headers=headers,
        json={
            "firNumber": "FIR/2024/101",
            "title": "Mumbai from Delhi",
            "jurisdictionId": MUMBAI,
        },
    )

    assert response.status_code == 403
    assert "own station" in response.json()["detail"]
    assert get_state().registry.list_cases() == []


def test_admin_can_open_a_case_at_any_station(client):
    headers = _headers_for(client, "ADMIN", "Admin Rao", jurisdiction=DEFAULT)

    case_id = _new_case(
        client, headers, title="Admin Mumbai case", fir_number="FIR/2024/102", jurisdiction=MUMBAI
    )

    assert get_state().registry.get_case(case_id).jurisdiction_node_id == MUMBAI


# ---------------------------------------------------------------------------
# GET /api/cases/{id} — requires READ
# ---------------------------------------------------------------------------
def test_get_case_requires_a_token(client):
    response = client.get("/api/cases/CASE_000001")
    assert response.status_code == 401


def test_same_station_inspector_can_read_a_case(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)
    inspector = _headers_for(client, "INSPECTOR", "Insp. Sharma")

    response = client.get(f"/api/cases/{case_id}", headers=inspector)

    assert response.status_code == 200
    assert response.json()["id"] == case_id


def test_cross_station_inspector_is_denied_read_until_granted(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    outsider = _headers_for(
        client, "INSPECTOR", "Insp. Mumbai", jurisdiction=MUMBAI
    )
    outsider_id = client.get("/api/me", headers=outsider).json()["userId"]

    denied = client.get(f"/api/cases/{case_id}", headers=outsider)
    assert denied.status_code == 403
    assert "READ" in denied.json()["detail"]

    granted = client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": outsider_id, "accessLevel": "READ"},
    )
    assert granted.status_code == 201, granted.text

    allowed = client.get(f"/api/cases/{case_id}", headers=outsider)
    assert allowed.status_code == 200
    assert allowed.json()["id"] == case_id


def test_audit_logger_reads_own_station_and_is_refused_elsewhere(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    auditor_home = _headers_for(
        client, "AUDIT_LOGGER", "Auditor Delhi", jurisdiction=DELHI
    )
    auditor_away = _headers_for(
        client, "AUDIT_LOGGER", "Auditor Mumbai", jurisdiction=MUMBAI
    )

    assert client.get(f"/api/cases/{case_id}", headers=auditor_home).status_code == 200
    denied = client.get(f"/api/cases/{case_id}", headers=auditor_away)
    assert denied.status_code == 403
    assert "READ" in denied.json()["detail"]


# ---------------------------------------------------------------------------
# Evidence (WRITE) and run (WRITE) through the CaseAccess guard
# ---------------------------------------------------------------------------
def _fir_id(client, case_id):
    return client.get(f"/api/cases/{case_id}/firs").json()[0]["firId"]


def test_cross_station_evidence_requires_write_grant(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    fir_id = _fir_id(client, case_id)
    outsider = _headers_for(
        client, "INSPECTOR", "Insp. Mumbai", jurisdiction=MUMBAI
    )
    outsider_id = client.get("/api/me", headers=outsider).json()["userId"]

    # READ grant is not enough for an upload
    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": outsider_id, "accessLevel": "READ"},
    ).status_code == 201
    read_only = client.post(
        f"/api/cases/{case_id}/firs/{fir_id}/evidence",
        headers=outsider,
        files={"files": ("note.txt", b"note", "text/plain")},
    )
    assert read_only.status_code == 403
    assert "WRITE" in read_only.json()["detail"]

    # upgrading the same (userId, caseId) row to WRITE lets the upload through
    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": outsider_id, "accessLevel": "WRITE"},
    ).status_code == 201
    upload = client.post(
        f"/api/cases/{case_id}/firs/{fir_id}/evidence",
        headers=outsider,
        files={"files": ("note.txt", b"note", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["files"][0]["originalName"] == "note.txt"


def test_expired_write_grant_denies_evidence(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    fir_id = _fir_id(client, case_id)
    outsider = _headers_for(
        client, "INSPECTOR", "Insp. Mumbai", jurisdiction=MUMBAI
    )
    outsider_id = client.get("/api/me", headers=outsider).json()["userId"]
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={
            "userId": outsider_id,
            "accessLevel": "WRITE",
            "expiresAt": past,
        },
    ).status_code == 201

    response = client.post(
        f"/api/cases/{case_id}/firs/{fir_id}/evidence",
        headers=outsider,
        files={"files": ("late.txt", b"late", "text/plain")},
    )
    assert response.status_code == 403


def test_cross_station_run_requires_write_grant(client, monkeypatch):
    # never spawn a real pipeline subprocess in this suite: authorization is
    # decided before submit(), so a stubbed runner still proves the gate.
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    outsider = _headers_for(
        client, "INSPECTOR", "Insp. Mumbai", jurisdiction=MUMBAI
    )
    outsider_id = client.get("/api/me", headers=outsider).json()["userId"]

    monkeypatch.setattr(
        get_state().runner, "submit", lambda job, argv: None, raising=False
    )

    denied = client.post(
        f"/api/cases/{case_id}/run",
        headers=outsider,
        json={"append": False, "noDatabase": True},
    )
    assert denied.status_code == 403
    assert "WRITE" in denied.json()["detail"]
    assert client.get(f"/api/cases/{case_id}/jobs").json() == []

    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": outsider_id, "accessLevel": "WRITE"},
    ).status_code == 201
    allowed = client.post(
        f"/api/cases/{case_id}/run",
        headers=outsider,
        json={"append": False, "noDatabase": True},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["caseId"] == case_id


# ---------------------------------------------------------------------------
# POST /api/cases/{id}/access — the grant route itself
# ---------------------------------------------------------------------------
def test_access_grant_requires_a_token(client):
    response = client.post(
        "/api/cases/CASE_000001/access",
        json={"userId": "USER_A", "accessLevel": "READ"},
    )
    assert response.status_code == 401


def test_inspector_and_audit_logger_cannot_grant_access(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)

    for role in ("INSPECTOR", "AUDIT_LOGGER"):
        headers = _headers_for(client, role, f"Officer {role}")
        response = client.post(
            f"/api/cases/{case_id}/access",
            headers=headers,
            json={"userId": "USER_TARGET", "accessLevel": "READ"},
        )
        assert response.status_code == 403, role


def test_admin_grants_cross_station_and_supervisor_is_station_bound(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao", jurisdiction=DEFAULT)
    case_id = _new_case(
        client, admin, title="Delhi case", fir_number="FIR/2024/200", jurisdiction=DELHI
    )

    # ADMIN from another station may grant on any case
    mumbai_admin = _headers_for(
        client, "ADMIN", "Admin Mumbai", jurisdiction=MUMBAI
    )
    ok = client.post(
        f"/api/cases/{case_id}/access",
        headers=mumbai_admin,
        json={"userId": "USER_GRANT_TEST", "accessLevel": "ADMIN"},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json() == {
        "id": "CA_USER_GRANT_TEST_" + case_id,
        "userId": "USER_GRANT_TEST",
        "caseId": case_id,
        "accessLevel": "ADMIN",
        "grantedBy": client.get("/api/me", headers=mumbai_admin).json()["userId"],
        "grantedAt": ok.json()["grantedAt"],
        "expiresAt": None,
    }
    stored = get_state().case_access.get("USER_GRANT_TEST", case_id)
    assert stored.access_level == "ADMIN"

    # SUPERVISOR may grant only inside its own station
    delhi_sup = _headers_for(
        client, "SUPERVISOR", "Sup. Delhi", jurisdiction=DELHI
    )
    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=delhi_sup,
        json={"userId": "USER_SUPER_GRANT", "accessLevel": "WRITE"},
    ).status_code == 201

    mumbai_sup = _headers_for(
        client, "SUPERVISOR", "Sup. Mumbai", jurisdiction=MUMBAI
    )
    denied = client.post(
        f"/api/cases/{case_id}/access",
        headers=mumbai_sup,
        json={"userId": "USER_DENY", "accessLevel": "WRITE"},
    )
    assert denied.status_code == 403
    assert get_state().case_access.get("USER_DENY", case_id) is None


def test_access_grant_validates_level_and_case(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)

    bad_level = client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": "USER_A", "accessLevel": "OWNER"},
    )
    assert bad_level.status_code == 422  # pydantic Literal rejects it

    missing_case = client.post(
        "/api/cases/CASE_999999/access",
        headers=admin,
        json={"userId": "USER_A", "accessLevel": "READ"},
    )
    assert missing_case.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/audit — ADMIN global, SUPERVISOR station, AUDIT_LOGGER read-only
# ---------------------------------------------------------------------------
def _plant_audit_trail(client, case_id, action="INGEST"):
    out_dir = get_state().registry.output_dir(case_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "audit_trail.json").write_text(
        json.dumps(
            [
                {
                    "action": action,
                    "stage": "stage1",
                    "timestamp": "2024-06-25T14:32:01",
                    "details": {},
                }
            ]
        ),
        encoding="utf-8",
    )


def test_inspector_cannot_read_audit(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)
    inspector = _headers_for(client, "INSPECTOR", "Insp. Sharma")

    response = client.get("/api/audit", headers=inspector)
    assert response.status_code == 403
    assert "INSPECTOR" in response.json()["detail"]

    scoped = client.get(f"/api/audit?caseId={case_id}", headers=inspector)
    assert scoped.status_code == 403


def test_audit_logger_is_read_only_on_audit(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    _plant_audit_trail(client, case_id)
    auditor = _headers_for(
        client, "AUDIT_LOGGER", "Auditor Delhi", jurisdiction=DELHI
    )

    # read succeeds (station aggregate + explicit case scope)
    aggregate = client.get("/api/audit", headers=auditor)
    assert aggregate.status_code == 200
    assert [row["caseId"] for row in aggregate.json()] == [case_id]
    assert aggregate.json()[0]["action"] == "INGEST"

    scoped = client.get(f"/api/audit?caseId={case_id}", headers=auditor)
    assert scoped.status_code == 200
    assert scoped.json()[0]["action"] == "INGEST"

    # "read-only": every mutation the auditor attempts is still 403
    assert client.post(
        "/api/cases", headers=auditor, json={"firNumber": "FIR/2024/300", "title": "Nope"}
    ).status_code == 403


def test_audit_scope_is_admin_global_supervisor_station(client):
    admin = _headers_for(client, "ADMIN", "Admin Rao", jurisdiction=DEFAULT)
    delhi_case = _new_case(
        client, admin, title="Delhi case", fir_number="FIR/2024/301", jurisdiction=DELHI
    )
    mumbai_case = _new_case(
        client, admin, title="Mumbai case", fir_number="FIR/2024/302", jurisdiction=MUMBAI
    )
    _plant_audit_trail(client, delhi_case, action="DELHI_TRAIL")
    _plant_audit_trail(client, mumbai_case, action="MUMBAI_TRAIL")

    # ADMIN: explicit caseId is global — any station's trail
    admin_headers = _headers_for(client, "ADMIN", "Admin Rao", jurisdiction=DEFAULT)
    for case_id, action in ((delhi_case, "DELHI_TRAIL"), (mumbai_case, "MUMBAI_TRAIL")):
        response = client.get(f"/api/audit?caseId={case_id}", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()[0]["action"] == action

    # SUPERVISOR: the default (no caseId) view is its own station only
    delhi_sup = _headers_for(
        client, "SUPERVISOR", "Sup. Delhi", jurisdiction=DELHI
    )
    aggregate = client.get("/api/audit", headers=delhi_sup)
    assert aggregate.status_code == 200
    assert [row["caseId"] for row in aggregate.json()] == [delhi_case]

    # SUPERVISOR: an explicit cross-station caseId is refused
    denied = client.get(f"/api/audit?caseId={mumbai_case}", headers=delhi_sup)
    assert denied.status_code == 403

    # ...unless a READ grant lifts it
    sup_id = client.get("/api/me", headers=delhi_sup).json()["userId"]
    assert client.post(
        f"/api/cases/{mumbai_case}/access",
        headers=admin_headers,
        json={"userId": sup_id, "accessLevel": "READ"},
    ).status_code == 201
    allowed = client.get(f"/api/audit?caseId={mumbai_case}", headers=delhi_sup)
    assert allowed.status_code == 200
    assert allowed.json()[0]["action"] == "MUMBAI_TRAIL"


def test_audit_default_admin_view_keeps_the_active_case(client):
    """Preservation: ADMIN without a caseId still reads the active case's
    trail exactly as the pre-RBAC route did."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)
    _plant_audit_trail(client, case_id, action="ACTIVE_TRAIL")

    response = client.get("/api/audit", headers=admin)

    assert response.status_code == 200
    assert response.json()[0]["action"] == "ACTIVE_TRAIL"
    assert "caseId" not in response.json()[0]  # shape unchanged for ADMIN


# ---------------------------------------------------------------------------
# Hierarchy on live routes
# ---------------------------------------------------------------------------
def test_hierarchy_admin_satisfies_supervisor_create_gate(client):
    """ADMIN passes the SUPERVISOR-listed create gate via the hierarchy —
    already the demo flow, pinned here against regressions in role_satisfies
    wiring inside FastAPI's dependency graph."""
    headers = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, headers, title="Hierarchy")
    assert client.get(f"/api/cases/{case_id}", headers=headers).status_code == 200


def test_supervisor_satisfies_inspector_operational_routes(client):
    """SUPERVISOR (above INSPECTOR on the ladder) keeps operational access
    inside its own station without being listed twice at every call site."""
    sup = _headers_for(client, "SUPERVISOR", "Sup. Delhi", jurisdiction=DELHI)
    case_id = _new_case(
        client, sup, title="Sup ops", fir_number="FIR/2024/400", jurisdiction=DELHI
    )
    fir = client.post(
        f"/api/cases/{case_id}/firs",
        headers=sup,
        json={"firNumber": "FIR/2024/401", "description": "Supplementary"},
    )
    assert fir.status_code == 201, fir.text
    upload = client.post(
        f"/api/cases/{case_id}/firs/{fir.json()['firId']}/evidence",
        headers=sup,
        files={"files": ("call_log.csv", b"msisdn,cell\n", "text/csv")},
    )
    assert upload.status_code == 201, upload.text


# ---------------------------------------------------------------------------
# GET /api/auth/effective-level — the frontend's one RBAC lookup
# ---------------------------------------------------------------------------
def test_effective_level_requires_a_token(client):
    """401 first: the endpoint answers only for a verified identity."""
    assert client.get("/api/auth/effective-level").status_code == 401
    assert (
        client.get(
            "/api/auth/effective-level", params={"caseId": "CASE_000001"}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("ADMIN", "ADMIN"),
        ("SUPERVISOR", "ADMIN"),
        ("INSPECTOR", "WRITE"),
        ("AUDIT_LOGGER", "READ"),
    ],
)
def test_effective_level_without_a_case_is_the_station_baseline(
    client, role, expected
):
    """Before a case is chosen the answer is the role's own-station level —
    exactly what the client-side ``STATION_BASELINE`` mirror computes."""
    headers = _headers_for(client, role)
    response = client.get("/api/auth/effective-level", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == {"level": expected, "caseId": None, "role": role}


def test_effective_level_scopes_a_case_by_station_then_grant(client):
    """With a caseId: station baseline decides, a CaseAccess row lifts a
    cross-station caller, ADMIN stays global."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, title="Delhi case", jurisdiction=DELHI)
    own_station = _headers_for(
        client, "INSPECTOR", "Insp. Delhi", jurisdiction=DELHI
    )
    other_station = _headers_for(
        client, "INSPECTOR", "Insp. Mumbai", jurisdiction=MUMBAI
    )
    auditor = _headers_for(
        client, "AUDIT_LOGGER", "Aud. Delhi", jurisdiction=DELHI
    )

    def level(headers):
        response = client.get(
            "/api/auth/effective-level",
            params={"caseId": case_id},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        return response.json()["level"]

    # Baseline only: same station gets WRITE/READ, cross-station gets NONE.
    assert level(own_station) == "WRITE"
    assert level(auditor) == "READ"
    assert level(other_station) == "NONE"
    assert level(admin) == "ADMIN"

    # An explicit grant is reflected immediately (upsert, then re-read).
    outsider_id = client.get("/api/me", headers=other_station).json()["userId"]
    assert client.post(
        f"/api/cases/{case_id}/access",
        headers=admin,
        json={"userId": outsider_id, "accessLevel": "WRITE"},
    ).status_code == 201
    assert level(other_station) == "WRITE"


def test_effective_level_unknown_case_is_404(client):
    """An unknown case cannot be quietly downgraded to a baseline: it
    diagnoses exactly like GET /api/cases/{caseId}."""
    headers = _headers_for(client, "ADMIN")
    response = client.get(
        "/api/auth/effective-level",
        params={"caseId": "CASE_999999"},
        headers=headers,
    )
    assert response.status_code == 404
