"""API projection view contracts.

Each test locks the wire shape a frontend type depends on — the fields are
optional there, so a snake_case leak renders blank rows instead of failing
typecheck.
"""

import json

import pytest

from api.app import resolve_face_image
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
