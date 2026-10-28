"""API projection view contracts.

Each test locks the wire shape a frontend type depends on — the fields are
optional there, so a snake_case leak renders blank rows instead of failing
typecheck.

The second half covers the authorization contract: who may mutate (and who
may only read), and which case a face decision is filed against.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import (
    app,
    get_state,
    require_roles,
    requires_roles,
    resolve_face_image,
    CaseAccessGuard,
)
from api.identity import Identity
from api.projection import RunProjection
from api.registry import CaseRegistry, RegistryError


def test_analytics_zones_serve_the_camelcase_contract(tmp_path):
    """`zone_scores.json` is snake_case on disk; `/api/analytics` must
    normalise it (like every other list in `analytics()`).

    Regression: zones were dumped raw, so the Risk zones panel rendered
    empty rows behind a real count — `ZoneScore` marks every field optional
    and TypeScript cannot see the mismatch.
    """
    (tmp_path / "zone_scores.json").write_text(
        json.dumps(
            [
                {
                    "hex_id": "GRID_28.566_77.243",
                    "latitude": 28.566,
                    "longitude": 77.243,
                    "location_names": ["Lajpat Nagar"],
                    "evidence_count": 3,
                    "suspect_count": 2,
                    "risk_score": 1.0,
                    "risk_band": "RED",
                    "case_ids": ["CASE_000001"],
                }
            ]
        ),
        encoding="utf-8",
    )

    zones = RunProjection(tmp_path).analytics()["zones"]

    assert zones == [
        {
            "hexId": "GRID_28.566_77.243",
            "latitude": 28.566,
            "longitude": 77.243,
            "locationNames": ["Lajpat Nagar"],
            "evidenceCount": 3,
            "suspectCount": 2,
            "riskScore": 1.0,
            "riskBand": "RED",
            "caseIds": ["CASE_000001"],
        }
    ]


def test_analytics_zones_absent_fields_stay_absent(tmp_path):
    """A missing score is not a zero score: `_present` drops `None` but
    keeps `0` and `[]`."""
    (tmp_path / "zone_scores.json").write_text(
        json.dumps([{"hex_id": "GRID_0", "risk_score": 0}]),
        encoding="utf-8",
    )

    zones = RunProjection(tmp_path).analytics()["zones"]

    assert zones == [{"hexId": "GRID_0", "riskScore": 0}]


# ---------------------------------------------------------------------------
# Face review: entityId remap + side-by-side comparison pair
# ---------------------------------------------------------------------------
def _face(
    face_id,
    file_name,
    person_id=None,
    person_name=None,
    bbox=None,
    match_confidence=0.65,
):
    return {
        "id": face_id,
        "file_name": file_name,
        "person_id": person_id,
        "person_name": person_name,
        "status": "MATCHED",
        "face_bbox": bbox
        if bbox is not None
        else {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0},
        "match_confidence": match_confidence,
        "captured_at": "2024-06-25T14:32:01",
    }


def _face_run(tmp_path, faces, matches=None, resolved=None):
    (tmp_path / "face_embeddings.json").write_text(
        json.dumps({"faces": faces, "matches": matches or [], "candidates": []}),
        encoding="utf-8",
    )
    if resolved is not None:
        (tmp_path / "resolved_entities.json").write_text(
            json.dumps(resolved), encoding="utf-8"
        )
    return RunProjection(tmp_path)


def test_face_records_remap_person_id_through_resolved_entities(tmp_path):
    """Stage 2.5 person ids get absorbed during resolution; a face still
    pointing at `PERSON_…` opens the drawer as "Entity not found", because
    `entities()` only serves resolved ids. `resolved_entities.json` carries
    the mapping in `source_entities` — the projection must follow it.
    """
    projection = _face_run(
        tmp_path,
        [_face("face_suresh_0", "suresh.jpeg", person_id="PERSON_abc", person_name="Suresh")],
        resolved={
            "RES_1": {
                "id": "RES_1",
                "canonical_name": "Suresh",
                "source_entities": ["PERSON_abc"],
            }
        },
    )

    records = projection.face_records()

    assert records[0]["entityId"] == "RES_1"
    assert any(row["id"] == "RES_1" for row in projection.entities())


def test_face_records_keep_person_id_without_resolved_match(tmp_path):
    """An id nothing absorbed stays exactly as the pipeline wrote it —
    remapping only where the data proves the link."""
    projection = _face_run(
        tmp_path,
        [_face("face_a", "a.jpeg", person_id="PERSON_abc", person_name="A")],
        resolved={},
    )

    records = projection.face_records()

    assert records[0]["entityId"] == "PERSON_abc"


def test_face_records_expose_the_match_pair_as_comparison(tmp_path):
    """Both sides of the best match arrive as reference (the face carrying
    the person claim) / capture + pixel bbox + similarity, so the review UI
    can show the two faces side by side before an investigator confirms."""
    reference_bbox = {"x": 253.7, "y": 231.6, "width": 307.0, "height": 409.0}
    capture_bbox = {"x": 251.8, "y": 253.5, "width": 317.4, "height": 450.1}
    projection = _face_run(
        tmp_path,
        [
            _face(
                "face_suresh_0",
                "suresh.jpeg",
                person_id="PERSON_abc",
                person_name="Suresh",
                bbox=reference_bbox,
            ),
            _face("face_liftCCTV_0", "liftCCTV.jpeg", bbox=capture_bbox),
        ],
        matches=[
            {
                "face_a": "face_suresh_0",
                "face_b": "face_liftCCTV_0",
                "file_a": "suresh.jpeg",
                "file_b": "liftCCTV.jpeg",
                "similarity": 0.5306,
            }
        ],
    )

    for record in projection.face_records():
        assert record["comparison"] == {
            "reference": {"file": "suresh.jpeg", "bbox": reference_bbox},
            "capture": {"file": "liftCCTV.jpeg", "bbox": capture_bbox},
            "similarity": 0.5306,
        }


def test_face_records_comparison_is_null_without_a_match_pair(tmp_path):
    """No match → no comparison claim; the field stays `null` rather than
    inventing a pair from the face's own file."""
    projection = _face_run(tmp_path, [_face("face_a", "a.jpeg")])

    assert projection.face_records()[0]["comparison"] is None


# ---------------------------------------------------------------------------
# Face images: raw files only, never anything outside the case directory
# ---------------------------------------------------------------------------
def test_resolve_face_image_serves_an_ingested_image(tmp_path):
    registry = CaseRegistry(tmp_path)
    case_dir = registry.cases_dir / "CASE_000001"
    case_dir.mkdir(parents=True)
    (case_dir / "suresh.jpeg").write_bytes(b"jpeg-bytes")

    path = resolve_face_image(registry, "CASE_000001", "suresh.jpeg")

    assert path == (case_dir / "suresh.jpeg").resolve()


@pytest.mark.parametrize(
    "bad_name",
    ["../.env", "..", "sub/suresh.jpeg", ".env", "notes.txt", "suresh.jpeg/.."],
)
def test_resolve_face_image_rejects_anything_that_is_not_a_bare_image(
    tmp_path, bad_name
):
    """The endpoint serves raw bytes: directory components, non-image
    extensions and dotfiles are refused before any path is built, and
    `evidence_path` still guards the resolve step behind that."""
    registry = CaseRegistry(tmp_path)
    (registry.cases_dir / "CASE_000001").mkdir(parents=True)
    (tmp_path / ".env").write_text("SECRET", encoding="utf-8")

    with pytest.raises(RegistryError):
        resolve_face_image(registry, "CASE_000001", bad_name)


def test_resolve_face_image_missing_file_is_not_an_image(tmp_path):
    registry = CaseRegistry(tmp_path)
    (registry.cases_dir / "CASE_000001").mkdir(parents=True)

    with pytest.raises(FileNotFoundError):
        resolve_face_image(registry, "CASE_000001", "gone.jpeg")


# ---------------------------------------------------------------------------
# Role-based access control (require_roles) + case-scoped face decisions
# ---------------------------------------------------------------------------
@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A live app bound to an isolated state directory.

    ``with TestClient(app)`` runs the lifespan, which is what constructs
    ``ApiState`` — without it every route answers 503 "API is starting up".
    Each test therefore gets its own registry, cases and active-case pointer.

    ``CRIMENET_SESSION_SECRET`` is pinned so mint and verify share one key:
    the file-backed default *strips* whitespace off the generated key while
    handing the unstripped bytes to the first provider, so a random key that
    begins or ends in ``\\n``/space signs a token nothing can later verify
    (``api/identity.py`` ``load_signing_secret``, outside this suite).
    """
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("CRIMENET_SESSION_SECRET", "mimo-004-test-session-secret-0123456789")
    with TestClient(app) as test_client:
        yield test_client


def _headers_for(client, role, display_name="Test Officer", jurisdiction="JURISDICTION_DEFAULT"):
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


def _new_case(client, headers, title="Case under test"):
    response = client.post(
        "/api/cases",
        headers=headers,
        json={"firNumber": "FIR/2024/001", "title": title},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_audit_logger_cannot_create_case(client):
    """Opening a root case is ADMIN/SUPERVISOR work: 403, and nothing lands
    in the registry."""
    headers = _headers_for(client, "AUDIT_LOGGER", "Auditor Iyer")

    response = client.post(
        "/api/cases",
        headers=headers,
        json={"firNumber": "FIR/2024/900", "title": "Unauthorized root case"},
    )

    assert response.status_code == 403
    assert "AUDIT_LOGGER" in response.json()["detail"]
    assert client.get("/api/cases").json() == []


def test_inspector_cannot_create_case(client):
    """INSPECTOR keeps operational access but not the root-case route."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    _new_case(client, admin)
    inspector = _headers_for(client, "INSPECTOR", "Insp. Sharma")

    response = client.post(
        "/api/cases",
        headers=inspector,
        json={"firNumber": "FIR/2024/901", "title": "Inspector root case"},
    )

    assert response.status_code == 403
    assert "INSPECTOR" in response.json()["detail"]


def test_audit_logger_cannot_trigger_run(client):
    """A queued pipeline job is a mutation: the dependency refuses the role
    before any job is created."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Run guard")
    headers = _headers_for(client, "AUDIT_LOGGER", "Auditor Iyer")

    response = client.post(
        f"/api/cases/{case_id}/run",
        headers=headers,
        json={"append": False, "noDatabase": True},
    )

    assert response.status_code == 403
    assert "AUDIT_LOGGER" in response.json()["detail"]
    assert client.get(f"/api/cases/{case_id}/jobs").json() == []


def test_audit_logger_is_blocked_on_every_mutating_route(client):
    """Acceptance: read-only oversight. Every POST the role can reach —
    cases, FIRs, evidence, runs, face decisions — answers 403."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)
    fir_id = client.get(f"/api/cases/{case_id}/firs").json()[0]["firId"]
    headers = _headers_for(client, "AUDIT_LOGGER", "Auditor Iyer")

    blocked = [
        client.post(
            "/api/cases",
            headers=headers,
            json={"firNumber": "FIR/2024/902", "title": "Blocked"},
        ),
        client.post(
            f"/api/cases/{case_id}/firs",
            headers=headers,
            json={"firNumber": "FIR/2024/903", "description": ""},
        ),
        client.post(
            f"/api/cases/{case_id}/firs/{fir_id}/evidence",
            headers=headers,
            files={"files": ("note.txt", b"note", "text/plain")},
        ),
        client.post(f"/api/cases/{case_id}/run", headers=headers, json={}),
        client.post(
            "/api/faces/decision",
            headers=headers,
            json={"faceId": "face_x", "decision": "confirm"},
        ),
    ]

    for response in blocked:
        assert response.status_code == 403, (
            f"{response.request.method} {response.request.url} "
            f"-> {response.status_code}"
        )


def test_audit_logger_can_read_cases_and_findings(client):
    """The other half of the contract: reads stay open, so oversight still
    works."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Readable case")
    headers = _headers_for(client, "AUDIT_LOGGER", "Auditor Iyer")

    listing = client.get("/api/cases", headers=headers)
    assert listing.status_code == 200
    assert [row["id"] for row in listing.json()] == [case_id]

    for path in (
        f"/api/cases/{case_id}",
        "/api/entities",
        "/api/audit",
        "/api/timeline",
        "/api/faces",
    ):
        response = client.get(path, headers=headers)
        assert response.status_code == 200, f"{path} -> {response.status_code}"


def test_face_decision_requires_auth(client):
    """The route used to omit the identity dependency entirely, so anyone
    could file a decision. Unauthenticated and unverifiable tokens are 401."""
    body = {"faceId": "face_unknown_0", "decision": "confirm"}

    assert client.post("/api/faces/decision", json=body).status_code == 401
    assert (
        client.post(
            "/api/faces/decision",
            headers={"Authorization": "Bearer forged.token"},
            json=body,
        ).status_code
        == 401
    )


def test_face_decision_respects_case_id(client):
    """With two cases open, ``body.caseId`` decides where the decision is
    written — not the global active-case pointer."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_a = _new_case(client, admin, "Case A")
    case_b = _new_case(client, admin, "Case B")
    assert case_a != case_b

    registry = get_state().registry
    for case_id, face_id in ((case_a, "face_a_0"), (case_b, "face_b_0")):
        out_dir = registry.output_dir(case_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "face_embeddings.json").write_text(
            json.dumps(
                {
                    "faces": [_face(face_id, f"{face_id}.jpeg")],
                    "matches": [],
                    "candidates": [],
                }
            ),
            encoding="utf-8",
        )

    # Point the global active case at A on purpose: the decision for B must
    # ignore it.
    get_state().set_active(case_a)

    response = client.post(
        "/api/faces/decision",
        headers=_headers_for(client, "SUPERVISOR", "Sup. Menon"),
        json={"faceId": "face_b_0", "decision": "confirm", "caseId": case_b},
    )
    assert response.status_code == 200, response.text

    written_b = registry.output_dir(case_b) / "face_decisions.json"
    written_a = registry.output_dir(case_a) / "face_decisions.json"
    assert json.loads(written_b.read_text(encoding="utf-8"))["decisions"][
        "face_b_0"
    ]["decision"] == "confirm"
    assert not written_a.exists()
    # and B's own projection sees it, A's does not
    assert RunProjection(registry.output_dir(case_b)).face_records()[0][
        "matchStatus"
    ] == "confirmed"
    assert (
        RunProjection(registry.output_dir(case_a)).face_records()[0][
            "matchStatus"
        ]
        == "unverified"
    )


def test_face_decision_without_case_id_keeps_the_active_case(client):
    """``caseId`` is optional, so the existing frontend call (no field)
    still files the decision against the active case."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Active case")
    registry = get_state().registry
    out_dir = registry.output_dir(case_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "face_embeddings.json").write_text(
        json.dumps(
            {
                "faces": [_face("face_a_0", "face_a_0.jpeg")],
                "matches": [],
                "candidates": [],
            }
        ),
        encoding="utf-8",
    )
    get_state().set_active(case_id)

    response = client.post(
        "/api/faces/decision",
        headers=_headers_for(client, "INSPECTOR", "Insp. Sharma"),
        json={"faceId": "face_a_0", "decision": "reject", "note": "Not him"},
    )

    assert response.status_code == 200, response.text
    saved = json.loads(
        (out_dir / "face_decisions.json").read_text(encoding="utf-8")
    )["decisions"]["face_a_0"]
    assert saved["decision"] == "reject"
    # reviewer was omitted, so it falls back to the identity behind the token
    assert saved["reviewer"] == "Insp. Sharma"


def test_face_decision_without_any_case_is_a_404(client):
    """No ``caseId``, no ``caseId`` query param, no active case: refuse
    rather than invent a target."""
    headers = _headers_for(client, "ADMIN", "Admin Rao")

    response = client.post(
        "/api/faces/decision",
        headers=headers,
        json={"faceId": "face_a_0", "decision": "confirm"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "No active or specified case"


def test_inspector_can_register_fir_and_upload_evidence(client):
    """The other side of the matrix: INSPECTOR keeps operational access, so
    the role gates must not over-block (403 only where the spec says so)."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin)
    inspector = _headers_for(client, "INSPECTOR", "Insp. Sharma")

    fir = client.post(
        f"/api/cases/{case_id}/firs",
        headers=inspector,
        json={"firNumber": "FIR/2024/010", "description": "Supplementary"},
    )
    assert fir.status_code == 201, fir.text
    fir_id = fir.json()["firId"]

    upload = client.post(
        f"/api/cases/{case_id}/firs/{fir_id}/evidence",
        headers=inspector,
        files={"files": ("call_log.csv", b"msisdn,cell\n", "text/csv")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["files"][0]["originalName"] == "call_log.csv"


# ---------------------------------------------------------------------------
# CaseAccessGuard — case-scoped authorization on top of the role gate
# ---------------------------------------------------------------------------
def _identity(role="INSPECTOR", jurisdiction="JURISDICTION_DEFAULT", user_id="USER_TEST"):
    return Identity(
        user_id=user_id,
        display_name="Test Officer",
        role=role,
        jurisdiction_id=jurisdiction,
        provider="session",
    )


class _FakeCase:
    def __init__(self, jurisdiction_node_id="JURISDICTION_DEFAULT", opened_by="USER_ADMIN"):
        self.jurisdiction_node_id = jurisdiction_node_id
        self.opened_by = opened_by


def test_requires_roles_alias_is_the_same_decorator():
    """The plural form is canonical; the old name keeps working unchanged."""
    assert require_roles is requires_roles


def test_case_access_guard_levels():
    """ADMIN is global and the creator outranks jurisdiction; station peers
    get their role's baseline (SUPERVISOR ADMIN, INSPECTOR WRITE); a
    foreign identity gets nothing without a CaseAccess grant."""
    guard = CaseAccessGuard()
    case = _FakeCase(jurisdiction_node_id="JURISDICTION_DELHI_CYBERCRIME")

    assert guard.effective_level(_identity("ADMIN"), case) == "ADMIN"
    assert guard.effective_level(_identity("SUPERVISOR"), case) == "NONE"
    assert (
        guard.effective_level(
            _identity(
                "SUPERVISOR", jurisdiction="JURISDICTION_DELHI_CYBERCRIME"
            ),
            case,
        )
        == "ADMIN"
    )
    assert (
        guard.effective_level(
            _identity("INSPECTOR", user_id="USER_ADMIN"), case
        )
        == "ADMIN"
    )
    assert (
        guard.effective_level(
            _identity("INSPECTOR", jurisdiction="JURISDICTION_DELHI_CYBERCRIME"),
            case,
        )
        == "WRITE"
    )
    assert (
        guard.effective_level(
            _identity("INSPECTOR", jurisdiction="JURISDICTION_MUMBAI_CYBERCRIME"),
            case,
        )
        == "NONE"
    )


def test_cross_jurisdiction_inspector_is_403_on_every_case_write(client):
    """Role is right, jurisdiction is wrong: every case-scoped mutation the
    inspector could previously reach now answers 403 — FIRs, evidence, runs
    and face decisions — while the case stays visible to same-jurisdiction
    peers."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Delhi case")
    fir_id = client.get(f"/api/cases/{case_id}/firs").json()[0]["firId"]

    registry = get_state().registry
    out_dir = registry.output_dir(case_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "face_embeddings.json").write_text(
        json.dumps(
            {
                "faces": [_face("face_x_0", "face_x_0.jpeg")],
                "matches": [],
                "candidates": [],
            }
        ),
        encoding="utf-8",
    )

    foreigner = _headers_for(
        client,
        "INSPECTOR",
        "Insp. Mumbai",
        jurisdiction="JURISDICTION_MUMBAI_CYBERCRIME",
    )

    blocked = [
        client.post(
            f"/api/cases/{case_id}/firs",
            headers=foreigner,
            json={"firNumber": "FIR/2024/500", "description": ""},
        ),
        client.post(
            f"/api/cases/{case_id}/firs/{fir_id}/evidence",
            headers=foreigner,
            files={"files": ("note.txt", b"note", "text/plain")},
        ),
        client.post(
            f"/api/cases/{case_id}/run",
            headers=foreigner,
            json={"append": False, "noDatabase": True},
        ),
        client.post(
            "/api/faces/decision",
            headers=foreigner,
            json={"faceId": "face_x_0", "decision": "confirm", "caseId": case_id},
        ),
    ]
    for response in blocked:
        assert response.status_code == 403, (
            f"{response.request.method} {response.request.url} "
            f"-> {response.status_code}: {response.text}"
        )

    # ...and nothing leaked into the case.
    assert len(client.get(f"/api/cases/{case_id}/firs").json()) == 1
    assert client.get(f"/api/cases/{case_id}/jobs").json() == []


def test_cross_jurisdiction_admin_retains_full_case_access(client):
    """ADMIN authority is global: an admin from another jurisdiction still
    writes to the case. SUPERVISOR is station-scoped, so the same cross-
    station attempt answers 403."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Default-jurisdiction case")
    global_admin = _headers_for(
        client,
        "ADMIN",
        "Admin Mumbai",
        jurisdiction="JURISDICTION_MUMBAI_CYBERCRIME",
    )
    response = client.post(
        f"/api/cases/{case_id}/firs",
        headers=global_admin,
        json={"firNumber": "FIR/2024/501", "description": "Cross-jurisdiction"},
    )
    assert response.status_code == 201, response.text

    supervisor = _headers_for(
        client,
        "SUPERVISOR",
        "Sup. Mumbai",
        jurisdiction="JURISDICTION_MUMBAI_CYBERCRIME",
    )
    denied = client.post(
        f"/api/cases/{case_id}/firs",
        headers=supervisor,
        json={"firNumber": "FIR/2024/510", "description": "Out of station"},
    )
    assert denied.status_code == 403


def test_unknown_case_still_404_for_an_authorized_identity(client):
    """The guard must not turn the registry's 404 into a 403: an
    ADMIN hitting a case id that does not exist gets the same diagnosis
    as before the guard existed."""
    headers = _headers_for(client, "ADMIN", "Admin Rao")

    response = client.post(
        "/api/cases/CASE_999999/firs",
        headers=headers,
        json={"firNumber": "FIR/2024/502", "description": ""},
    )
    assert response.status_code == 404


def test_same_jurisdiction_inspector_writes_still_pass_the_guard(client):
    """Preservation half: the ordinary single-jurisdiction flow is byte-for
    byte what it was — FIR registration and evidence upload land 201."""
    admin = _headers_for(client, "ADMIN", "Admin Rao")
    case_id = _new_case(client, admin, "Same-jurisdiction case")
    inspector = _headers_for(client, "INSPECTOR", "Insp. Sharma")

    fir = client.post(
        f"/api/cases/{case_id}/firs",
        headers=inspector,
        json={"firNumber": "FIR/2024/503", "description": ""},
    )
    assert fir.status_code == 201, fir.text
    upload = client.post(
        f"/api/cases/{case_id}/firs/{fir.json()['firId']}/evidence",
        headers=inspector,
        files={"files": ("ok.txt", b"ok", "text/plain")},
    )
    assert upload.status_code == 201, upload.text


def _money_run(tmp_path: Path) -> None:
    """A minimal run: one dated bank transfer plus its ingestion summary."""
    (tmp_path / "relations.json").write_text(
        json.dumps(
            [
                {
                    "id": "REL_bank_1",
                    "source_entity_id": "ACCT_A",
                    "target_entity_id": "ACCT_B",
                    "relation_type": "TRANSFERRED_TO",
                    "confidence": {
                        "score": 1.0,
                        "basis": ["Bank record direct"],
                    },
                    "source": {
                        "source_type": "bank",
                        "file_name": "05_Bank_Rakesh.csv",
                        "file_hash": "sha256:deadbeef",
                        "verification": "UNVERIFIED",
                    },
                    "attributes": {
                        "amount": "15000",
                        "currency": "INR",
                        "date": "2024-03-05",
                        "description": "Transfer to Suresh",
                        "source_name": "Account 1234",
                        "target_name": "Account 1235",
                    },
                },
                {
                    "id": "REL_narrative_1",
                    "source_entity_id": "AMOUNT_x",
                    "target_entity_id": "ORG_y",
                    "relation_type": "TRANSFERRED_TO",
                    "attributes": {"narrative_pattern": True, "verb": "transferred"},
                },
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "graph_nodes.json").write_text(
        json.dumps(
            [
                {"id": "ACCT_A", "name": "Account 1234"},
                {"id": "ACCT_B", "name": "Account 1235"},
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "extraction_summary.json").write_text(
        json.dumps(
            {
                "run_id": "run_test",
                "ingestion_summary": {
                    "total_files": 63,
                    "total_records": 300,
                    "files": [
                        {
                            "name": "05_Bank_Rakesh.csv",
                            "source_type": "bank",
                            "records": 7,
                            "file_hash": "sha256:deadbeef",
                            "quality_score": 0.982,
                            "adversarial_suspicious": False,
                        },
                        {
                            "name": "07_Bank_Amit.csv",
                            "source_type": "bank",
                            "records": 4,
                            "file_hash": "sha256:cafe",
                            "quality_score": 0.948,
                            "adversarial_suspicious": False,
                        },
                        {
                            "name": "02_CDR_Rakesh.csv",
                            "source_type": "cdr",
                            "records": 15,
                            "file_hash": "sha256:cdr",
                        },
                    ],
                    "adversarial": {
                        "suspicious_files": ["31_Adversarial_Bank.csv"],
                    },
                },
                "evidence_integrity": [
                    {
                        "original_filename": "05_Bank_Rakesh.csv",
                        "file_hash": "sha256:deadbeef",
                        "ingestion_time": "2026-10-26T18:53:20",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def test_money_flow_names_the_source_file_behind_every_transfer(tmp_path):
    """Each transfer must carry file, hash, integrity, row narration and the
    extraction verdict — the backing a judge asks for when shown a total."""
    _money_run(tmp_path)
    flow = RunProjection(tmp_path, case_id="CASE_000001").money_flow(
        "CASE_000001"
    )

    assert flow["totalVolume"] == 15000.0
    assert flow["tracedLabel"] == "1 traced transfers"
    assert len(flow["transactions"]) == 1

    tx = flow["transactions"][0]
    assert tx["sourceFile"] == "05_Bank_Rakesh.csv"
    assert tx["sourceHash"] == "sha256:deadbeef"
    assert tx["sourceIntegrity"] == "verified"
    assert tx["description"] == "Transfer to Suresh"
    assert tx["extractionConfidence"] == 1.0
    assert tx["extractionBasis"] == ["Bank record direct"]


def test_money_flow_source_coverage_lists_every_bank_file(tmp_path):
    """Coverage panel data: all bank files (even 0-transfer ones), rows,
    hashes and per-file volumes that add up to the traced total."""
    _money_run(tmp_path)
    flow = RunProjection(tmp_path).money_flow("CASE_000001")

    by_file = {row["file"]: row for row in flow["sourceFiles"]}
    assert set(by_file) == {"05_Bank_Rakesh.csv", "07_Bank_Amit.csv"}
    assert by_file["05_Bank_Rakesh.csv"]["records"] == 7
    assert by_file["05_Bank_Rakesh.csv"]["transferCount"] == 1
    assert by_file["05_Bank_Rakesh.csv"]["volume"] == 15000.0
    assert by_file["05_Bank_Rakesh.csv"]["qualityScore"] == 0.982
    # A bank file that contributed nothing still appears, with an honest 0.
    assert by_file["07_Bank_Amit.csv"]["records"] == 4
    assert by_file["07_Bank_Amit.csv"]["transferCount"] == 0
    assert by_file["07_Bank_Amit.csv"]["volume"] == 0.0
    # CDR files are not money sources.
    assert "02_CDR_Rakesh.csv" not in by_file

    # The sum of per-file volumes equals the headline total.
    assert round(sum(row["volume"] for row in flow["sourceFiles"]), 2) == (
        flow["totalVolume"]
    )

    ingestion = flow["ingestion"]
    assert ingestion["bankFiles"] == 2
    assert ingestion["bankRecords"] == 11
    assert ingestion["files"] == 63
    assert ingestion["records"] == 300
    assert ingestion["runId"] == "run_test"


def test_money_flow_narrative_relations_stay_out_of_the_sum(tmp_path):
    """A narrative 'transferred …' with no amount and no date cannot enter
    the trail or the coverage rollup."""
    _money_run(tmp_path)
    flow = RunProjection(tmp_path).money_flow()

    ids = [row["id"] for row in flow["transactions"]]
    assert "REL_narrative_1" not in ids
    assert flow["totalVolume"] == 15000.0


def test_map_response_names_the_case_and_carries_zone_location_names(tmp_path):
    """The map must say which case it maps, and zone markers must carry the
    full recorded location names — the label caps at 60 chars, so district
    matching and the zone detail cannot rely on it."""
    (tmp_path / "zone_scores.json").write_text(
        json.dumps(
            [
                {
                    "hex_id": "893da115e3bffff",
                    "latitude": 28.5660924,
                    "longitude": 77.2432851,
                    "location_names": [
                        "Amit Sharma",
                        "Rose Apartments, Lajpat Nagar Part II, New Delhi",
                    ],
                    "risk_band": "RED",
                    "risk_score": 1.0,
                    "evidence_count": 3,
                    "suspect_count": 2,
                }
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "spatial_infos.json").write_text(
        json.dumps(
            [
                {
                    "id": "SPAT_1",
                    "latitude": 28.6,
                    "longitude": 77.2,
                    "address": "Lajpat Nagar, New Delhi",
                    "city": "Delhi",
                    "precision": "city",
                    "entity_id": "RES_1",
                }
            ]
        ),
        encoding="utf-8",
    )

    data = RunProjection(tmp_path, case_id="CASE_000001").map_data()

    assert data["caseId"] == "CASE_000001"
    zone = next(m for m in data["markers"] if m["kind"] == "incident")
    # Full names survive even though the display label stops at 60 chars.
    assert zone["locationNames"] == [
        "Amit Sharma",
        "Rose Apartments, Lajpat Nagar Part II, New Delhi",
    ]
    assert len(zone["label"]) <= 60
    # District attribution exists only on spatial rows; zones match via
    # their recorded location names.
    spatial = next(m for m in data["markers"] if m["kind"] != "incident")
    assert spatial["district"] == "Delhi"
