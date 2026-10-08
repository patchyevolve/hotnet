"""API projection view contracts.

Each test locks the wire shape a frontend type depends on — the fields are
optional there, so a snake_case leak renders blank rows instead of failing
typecheck.

The second half covers the authorization contract: who may mutate (and who
may only read), and which case a face decision is filed against.
"""

import json

import pytest
from fastapi.testclient import TestClient

from api.app import app, get_state, resolve_face_image
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


def _headers_for(client, role, display_name="Test Officer"):
    """Sign in through the real session route and return the bearer header."""
    response = client.post(
        "/api/session",
        json={
            "displayName": display_name,
            "role": role,
            "jurisdictionId": "JURISDICTION_DEFAULT",
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
