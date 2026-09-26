"""Stage 12 — face recognition (RESEARCH_FACE_RECOGNITION doc 07/08/11).

Model-free: embeddings are synthetic vectors, so the suite never loads
insightface weights. Covers scoring, input-file classification, the Stage 2
promotion cutoffs, Stage 2.5 matching/candidates, resolution candidate
loading, FACE_MATCH graph edges, and the /api/faces projections.
"""

import json

import pytest

from src.faces import context as fctx
from src.faces.engine import (
    cosine_similarity,
    similarity_to_confidence,
    weighted_quality,
)
from src.faces.stage import FaceProcessingStage


# ---------------------------------------------------------------------------
# Scoring (doc 07)
# ---------------------------------------------------------------------------

def test_similarity_to_confidence_breakpoints():
    assert similarity_to_confidence(0.35) == 0.0
    assert similarity_to_confidence(0.5) == pytest.approx(0.15)
    assert similarity_to_confidence(0.7) == pytest.approx(0.6)
    assert similarity_to_confidence(0.8) == pytest.approx(0.9)
    assert similarity_to_confidence(0.9) == pytest.approx(0.95)
    assert similarity_to_confidence(1.0) == pytest.approx(1.0)


def test_weighted_quality_uses_doc07_weights():
    scores = {"blur": 1.0, "resolution": 0.0, "angle": 0.0, "lighting": 0.0, "occlusion": 0.0}
    assert weighted_quality(scores) == pytest.approx(0.20)
    assert weighted_quality({k: 1.0 for k in scores}) == pytest.approx(1.0)


def test_cosine_similarity():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    assert cosine_similarity([], [1.0]) == 0.0


# ---------------------------------------------------------------------------
# Input-file handling (doc 11)
# ---------------------------------------------------------------------------

def test_classify_screenshot_with_overlay():
    result = fctx.classify_image_input(
        "/ev/49_CCTV_Screenshot.png",
        all_files_in_folder=["49_CCTV_Screenshot.png"],
        ocr_text="Camera ID: CAM_KB7\nTime: 09:30:00",
    )
    assert result["source_type"] == "SCREENSHOT"
    assert result["context_type"] == "OVERLAID_TEXT"
    assert "face_detection" in result["extraction_methods"]


def test_classify_sidecar_beats_filename_context():
    result = fctx.classify_image_input(
        "/ev/51_SURVEILLANCE.jpg",
        all_files_in_folder=["51_SURVEILLANCE.jpg", "51_SURVEILLANCE.meta.json"],
    )
    assert result["context_type"] == "SIDECAR_FILE"
    assert result["context_sources"] == ["51_SURVEILLANCE.meta.json"]


def test_filename_tokens_drop_generic_and_digits():
    assert fctx.filename_tokens("51_SURVEILLANCE_Unknown.jpg") == set()
    assert fctx.filename_tokens("obama1.jpg") == {"obama"}
    assert fctx.filename_tokens("56_Aadhaar_Rakesh_Kumar.jpg") == {"aadhaar", "rakesh", "kumar"}


def test_identity_type_from_filename():
    assert fctx.identity_type_from_filename("56_Aadhaar_Rakesh_Kumar.jpg") == "AADHAAR"
    assert fctx.identity_type_from_filename("49_CCTV_Screenshot.png") == ""


def test_match_face_with_context_boosts():
    assert fctx.match_face_with_context(0.5, {"id_type": "AADHAAR"}) == pytest.approx(0.75)
    assert fctx.match_face_with_context(0.5, {"investigator_named": True}) == pytest.approx(0.6)
    assert fctx.match_face_with_context(
        0.5, {"investigator_named": True, "timestamp": True}
    ) == pytest.approx(0.66)
    assert fctx.match_face_with_context(0.95, {"id_type": "AADHAAR"}) == pytest.approx(1.0)


def test_overlay_extractors():
    from src.faces.engine import camera_from_text, timestamp_from_text

    text = "Date: 14/03/2024 Time: 09:30:00\nCamera ID: CAM_KB7"
    assert camera_from_text(text) == "CAM_KB7"
    assert timestamp_from_text(text) == "2024-03-14T09:30:00"
    assert camera_from_text("") == ""
    assert timestamp_from_text("no stamps here") == ""


# ---------------------------------------------------------------------------
# Stage 2 promotion (doc 08 §3.2)
# ---------------------------------------------------------------------------

def _crop(status="PENDING", det=0.95, quality=0.8, emb=None):
    return {
        "id": "face_img_0",
        "file_name": "img.jpg",
        "file_path": "/ev/img.jpg",
        "status": status,
        "detector_confidence": det,
        "quality_score": quality,
        "embedding_vector": [1.0, 0.0] if emb is None else emb,
        "quality_scores": {},
        "face_bbox": {},
        "landmarks": [],
        "created_at": "2024-03-14T09:30:00",
    }


def test_stage2_promotion_cutoffs():
    from src.extraction.engine import ExtractionEngine

    engine = ExtractionEngine()
    records = engine._extract_face_embeddings({
        "face_crops": [
            _crop(quality=0.9),
            _crop(quality=0.2),
            _crop(det=0.3),
        ],
    }, run_id="run_1")
    assert [r["status"] for r in records] == ["EXTRACTED", "LOW_QUALITY", "REJECTED"]
    assert records[1]["embedding_vector"] == []
    assert records[2]["embedding_vector"] == []
    assert all(r["run_id"] == "run_1" for r in records)


# ---------------------------------------------------------------------------
# Stage 2.5 matching + candidates (doc 08 §7)
# ---------------------------------------------------------------------------

def _face(fid, file_name, emb, **kw):
    base = {
        "id": fid,
        "file_name": file_name,
        "file_path": f"/ev/{file_name}",
        "embedding_vector": emb,
        "status": "PENDING",
        "quality_score": 0.8,
        "detector_confidence": 0.95,
        "quality_scores": {},
        "face_bbox": {},
        "landmarks": [],
        "created_at": "2024-03-14T09:30:00",
    }
    if "quality" in kw:
        kw["quality_score"] = kw.pop("quality")
    if "det" in kw:
        kw["detector_confidence"] = kw.pop("det")
    base.update(kw)
    return base


def _promotion(faces, persons, **kw):
    return FaceProcessingStage().process(faces, persons, **kw)


def test_stage25_statuses_linkage_and_matches():
    v = [1.0, 0.0, 0.0]
    faces = [
        _face("f1", "obama1.jpg", list(v)),
        _face("f2", "obama2.jpg", list(v)),
        _face("f3", "biden.jpg", [0.0, 1.0, 0.0]),
    ]
    persons = [
        {"id": "p_obama", "name": "Barack Obama", "source_id": "note.txt"},
        {"id": "p_biden", "name": "Joe Biden", "source_id": "note.txt"},
    ]
    result = _promotion(faces, persons)
    by_id = {f["id"]: f for f in result["faces"]}

    assert by_id["f1"]["status"] == "MATCHED"
    assert by_id["f2"]["status"] == "MATCHED"
    assert by_id["f3"]["status"] == "EXTRACTED"
    assert by_id["f1"]["person_id"] == "p_obama"
    assert by_id["f3"]["person_id"] == "p_biden"
    assert by_id["f1"]["link_basis"] == "filename_context"

    assert len(result["matches"]) == 1
    assert result["matches"][0]["similarity"] == pytest.approx(1.0)
    assert result["stats"]["faces"] == 3
    assert result["stats"]["linked_faces"] == 3
    assert result["stats"]["candidates"] == 0  # no cross-person match


def test_stage25_identity_candidate_for_unlinked_face():
    v = [1.0, 0.0, 0.0]
    faces = [
        _face("f_named", "obama1.jpg", list(v)),
        _face("f_unknown", "51_SURVEILLANCE_Unknown.jpg", list(v)),
    ]
    persons = [{"id": "p_obama", "name": "Barack Obama", "source_id": "note.txt"}]
    result = _promotion(faces, persons)
    by_id = {f["id"]: f for f in result["faces"]}
    identity = [c for c in result["candidates"] if c["kind"] == "identity"]

    assert by_id["f_named"]["person_id"] == "p_obama"
    assert by_id["f_unknown"].get("person_id") in (None, "")
    assert len(identity) == 1
    assert identity[0]["source_entity_id"] == "f_unknown"
    assert identity[0]["candidate_entity_id"] == "p_obama"
    assert identity[0]["candidate_person_name"] == "Barack Obama"
    assert identity[0]["match_type"] == "FACE"
    assert by_id["f_unknown"]["match_confidence"] == pytest.approx(1.0)


def test_stage25_person_alias_candidate():
    v = [1.0, 0.0, 0.0]
    faces = [
        _face("fa", "alpha_capture.jpg", list(v)),
        _face("fb", "beta_scene.jpg", list(v)),
    ]
    persons = [
        {"id": "p_alpha", "name": "Alpha Kumar", "source_id": "note.txt"},
        {"id": "p_beta", "name": "Beta Singh", "source_id": "note.txt"},
    ]
    result = _promotion(faces, persons)
    alias = [c for c in result["candidates"] if c["kind"] == "person_alias"]

    assert len(alias) == 1
    assert {alias[0]["source_entity_id"], alias[0]["candidate_entity_id"]} == {"p_alpha", "p_beta"}
    assert alias[0]["confidence"] == pytest.approx(1.0)
    assert result["stats"]["cross_person_matches"] == 1


def test_stage25_quality_and_detector_cutoffs():
    faces = [
        _face("f_low", "a.jpg", [1.0, 0.0], quality=0.2),
        _face("f_rej", "b.jpg", [1.0, 0.0], det=0.3),
    ]
    result = _promotion(faces, [])
    by_id = {f["id"]: f for f in result["faces"]}
    assert by_id["f_low"]["status"] == "LOW_QUALITY"
    assert by_id["f_low"]["embedding_vector"] == []
    assert by_id["f_rej"]["status"] == "REJECTED"
    assert result["stats"]["matches"] == 0  # dead faces never match


def test_stage25_identity_document_confirms():
    faces = [_face("f_id", "56_Aadhaar_Rakesh_Kumar.jpg", [1.0, 0.0])]
    result = _promotion(faces, [])
    assert result["faces"][0]["status"] == "CONFIRMED"
    assert result["faces"][0]["identity_document"] == "AADHAAR"


def test_stage25_merges_previous_run_faces():
    previous = [_face("f_old", "old.jpg", [1.0, 0.0], status="EXTRACTED")]
    faces = [_face("f_new", "new.jpg", [1.0, 0.0])]
    result = _promotion(faces, [], previous_faces=previous)
    assert {f["id"] for f in result["faces"]} == {"f_old", "f_new"}
    # the identical previous face now matches the new one
    assert result["stats"]["matches"] == 1


def test_stage25_context_fill_from_overlay():
    faces = [_face("f_cctv", "49_CCTV_Screenshot.png", [1.0, 0.0], quality=0.1)]
    contexts = {
        "49_CCTV_Screenshot.png": {
            "ocr_text": "Camera ID: CAM_KB7",
            "camera": "CAM_KB7",
            "overlay_timestamp": "2024-03-14T09:30:00",
            "captured_at": "2024-03-14T09:30:00",
        }
    }
    result = _promotion(faces, [], file_contexts=contexts)
    face = result["faces"][0]
    assert face["camera"] == "CAM_KB7"
    assert face["captured_at"] == "2024-03-14T09:30:00"
    assert face["capture_time_source"] == "overlay"


# ---------------------------------------------------------------------------
# Resolution candidates (doc 08 §4)
# ---------------------------------------------------------------------------

def test_resolution_loads_person_pair_face_candidates(tmp_path):
    from src.resolution.engine import ResolutionEngine

    payload = {
        "faces": [],
        "matches": [],
        "candidates": [
            {"source_entity_id": "p_a", "candidate_entity_id": "p_b",
             "match_type": "FACE", "kind": "person_alias", "confidence": 0.83,
             "signals": {"face_similarity": 0.778}},
            {"source_entity_id": "face_x_0", "candidate_entity_id": "p_a",
             "match_type": "FACE", "kind": "identity", "confidence": 0.9,
             "signals": {"face_similarity": 0.9}},
        ],
        "stats": {},
    }
    (tmp_path / "face_embeddings.json").write_text(json.dumps(payload), encoding="utf-8")

    candidates = ResolutionEngine._load_face_candidates(str(tmp_path))
    assert len(candidates) == 2
    face_pair = [c for c in candidates if c.entity_ids == ["p_a", "p_b"]]
    assert face_pair and face_pair[0].signal == "face_match"
    assert face_pair[0].confidence == pytest.approx(0.83)
    assert "0.778" in face_pair[0].description


def test_resolution_without_face_file_returns_empty(tmp_path):
    from src.resolution.engine import ResolutionEngine

    assert ResolutionEngine._load_face_candidates(str(tmp_path)) == []


# ---------------------------------------------------------------------------
# Graph FACE_MATCH edges (doc 08 §6.2)
# ---------------------------------------------------------------------------

def _entity(eid, name, score=0.8):
    return {"id": eid, "name": name, "confidence": {"score": score}}


def test_create_face_edges_from_alias_candidates(tmp_path):
    from src.graph.builder import create_face_edges

    payload = {
        "faces": [],
        "matches": [],
        "candidates": [
            {"source_entity_id": "p_a", "candidate_entity_id": "p_b",
             "match_type": "FACE", "kind": "person_alias", "confidence": 0.83,
             "signals": {"face_similarity": 0.778}, "files": ["x.jpg", "y.jpg"]},
            {"source_entity_id": "face_z_0", "candidate_entity_id": "p_a",
             "match_type": "FACE", "kind": "identity", "confidence": 0.9,
             "signals": {"face_similarity": 0.9}},
        ],
        "stats": {},
    }
    (tmp_path / "face_embeddings.json").write_text(json.dumps(payload), encoding="utf-8")
    entity_by_id = {"p_a": _entity("p_a", "Alpha"), "p_b": _entity("p_b", "Beta")}

    edges = create_face_edges(str(tmp_path), entity_by_id, resolved_entities=[], run_id="r1")
    assert len(edges) == 1
    edge = edges[0]
    assert edge.relationship_type == "FACE_MATCH"
    assert edge.edge_type == "associational"
    assert {edge.source_id, edge.target_id} == {"p_a", "p_b"}
    assert edge.epistemic_status == "inference"
    assert edge.confidence.get("score", 0) >= 0.5
    assert set(edge.supporting_evidence) == {"x.jpg", "y.jpg"}


def test_create_face_edges_skips_merged_and_unknown_nodes(tmp_path):
    from src.graph.builder import create_face_edges

    payload = {
        "faces": [],
        "matches": [],
        "candidates": [
            # both originals resolved into one node → skipped
            {"source_entity_id": "p_a", "candidate_entity_id": "p_b",
             "match_type": "FACE", "kind": "person_alias", "confidence": 0.9,
             "signals": {"face_similarity": 0.9}},
        ],
        "stats": {},
    }
    (tmp_path / "face_embeddings.json").write_text(json.dumps(payload), encoding="utf-8")
    entity_by_id = {"p_merged": _entity("p_merged", "Merged")}
    resolved = [{"id": "p_merged", "source_entities": ["p_a", "p_b"]}]

    assert create_face_edges(str(tmp_path), entity_by_id, resolved) == []


def test_create_face_edges_without_face_file(tmp_path):
    from src.graph.builder import create_face_edges

    assert create_face_edges(str(tmp_path), {}, []) == []


# ---------------------------------------------------------------------------
# API projection (FaceRecord contract)
# ---------------------------------------------------------------------------

def _face_payload():
    return {
        "faces": [
            {"id": "face_obama1_0", "status": "MATCHED", "person_id": "person_obama",
             "person_name": "Barack Obama", "file_name": "obama1.jpg",
             "match_confidence": 0.834,
             "camera": "CAM_KB7", "captured_at": "2024-03-14T09:30:00",
             "capture_time_source": "overlay", "best_similarity": 0.778,
             "link_basis": "filename_context", "context": {"context_type": "OVERLAID_TEXT"}},
            {"id": "face_unknown_0", "status": "MATCHED", "match_confidence": 0.9,
             "file_name": "51_SURVEILLANCE_Unknown.jpg",
             "best_similarity": 0.9, "camera": "", "captured_at": "",
             "context": {"context_type": "NO_CONTEXT"}},
            {"id": "face_low_0", "status": "LOW_QUALITY", "match_confidence": 0.0,
             "file_name": "low.jpg", "best_similarity": None,
             "context": {"context_type": "NO_CONTEXT"}},
            {"id": "face_rej_0", "status": "REJECTED", "match_confidence": 0.0},
        ],
        "matches": [
            {"face_a": "face_obama1_0", "face_b": "face_obama2_0",
             "file_a": "obama1.jpg", "file_b": "obama2.jpg",
             "similarity": 0.778, "confidence": 0.834},
        ],
        "candidates": [
            {"source_entity_id": "face_unknown_0", "candidate_entity_id": "person_obama",
             "candidate_person_name": "Barack Obama", "match_type": "FACE",
             "kind": "identity", "confidence": 0.9,
             "files": ["51_SURVEILLANCE_Unknown.jpg", "obama1.jpg"],
             "signals": {"face_similarity": 0.9}},
        ],
        "stats": {"faces": 4, "matches": 1, "candidates": 1},
    }


def test_face_records_projection(tmp_path):
    from api.projection import RunProjection

    (tmp_path / "face_embeddings.json").write_text(json.dumps(_face_payload()), encoding="utf-8")
    records = RunProjection(tmp_path).face_records()
    by_id = {r["id"]: r for r in records}

    # REJECTED dropped, everything else projected
    assert set(by_id) == {"face_obama1_0", "face_unknown_0", "face_low_0"}

    linked = by_id["face_obama1_0"]
    assert linked["subject"] == "Barack Obama"
    assert linked["entityId"] == "person_obama"
    assert linked["confidence"] == pytest.approx(0.834)
    assert linked["matchStatus"] == "probable"  # 0.778 >= review floor 0.60
    assert linked["camera"] == "CAM_KB7"
    assert linked["capturedAt"] == "2024-03-14T09:30:00"
    assert linked["risk"] == "low"  # no centrality/adversarial data → low
    assert "overlay" in linked["notes"]

    identity = by_id["face_unknown_0"]
    assert identity["entityId"] == "person_obama"  # via identity candidate
    assert identity["subject"] == "Barack Obama"
    assert identity["matchStatus"] == "probable"
    assert identity["matchedWith"] == "Barack Obama"
    assert set(identity["matchedFrom"]) == {"51_SURVEILLANCE_Unknown.jpg", "obama1.jpg"}
    assert identity["similarity"] == pytest.approx(0.9)

    assert linked["matchedWith"] == "Barack Obama"
    assert linked["matchedFrom"] == ["obama2.jpg"]
    assert linked["similarity"] == pytest.approx(0.778)
    assert linked["decidedBy"] == ""

    low = by_id["face_low_0"]
    assert low["matchStatus"] == "unverified"
    assert low["subject"] == "Unidentified subject"
    assert low["entityId"] == ""


def test_face_records_empty_without_run(tmp_path):
    from api.projection import RunProjection

    assert RunProjection(tmp_path).face_records() == []


def test_face_status_endpoint(monkeypatch, tmp_path):
    import api.app as app_module

    class _StubState:
        state_dir = tmp_path

        def active_case(self):
            return None

    monkeypatch.setattr(app_module, "_state", _StubState())
    payload = app_module.face_status()
    assert payload["available"] is True
    assert isinstance(payload["modelAvailable"], bool)
    assert "/api/faces" in payload["endpoints"]
    assert isinstance(payload["stats"], dict)


# ---------------------------------------------------------------------------
# Engine degradation (missing model stack)
# ---------------------------------------------------------------------------

def test_analyze_image_degrades_without_model(monkeypatch):
    from src.faces import engine

    monkeypatch.setattr(engine, "_APP_FAILED", True)
    monkeypatch.setattr(engine, "_APP", None)
    assert engine.analyze_image("/nonexistent/image.jpg") == []


def test_model_available_reflects_weights():
    from src.faces.engine import model_available

    assert isinstance(model_available(), bool)


# ---------------------------------------------------------------------------
# Demo path: suresh.jpg + CCTV frame with burned-in overlay (doc 11 §5/§6)
# ---------------------------------------------------------------------------

def test_filename_name_only_for_name_shaped_files():
    assert fctx.filename_name("suresh.jpg") == "Suresh"
    assert fctx.filename_name("john_doe_evidence.jpg") == "John Doe"
    assert fctx.filename_name("obama1.jpg") == "Obama"
    assert fctx.filename_name("49_CCTV_Screenshot.png") == ""
    assert fctx.filename_name("42_CAM_KB7.jpg") == ""
    assert fctx.filename_name("51_SURVEILLANCE_Unknown.jpg") == ""
    assert fctx.filename_name("56_Aadhaar_Rakesh_Kumar.jpg") == ""  # ID docs OCR their own names
    assert fctx.filename_name("a_b.jpg") == ""


def test_timestamp_overlay_formats():
    from src.faces.engine import timestamp_from_text

    assert timestamp_from_text("14/03/2024 09:30:00") == "2024-03-14T09:30:00"
    assert timestamp_from_text("Date: 14/03/2024 Time: 09:30:00") == "2024-03-14T09:30:00"
    assert timestamp_from_text("CAM_07 2024-03-14 09:30:00") == "2024-03-14T09:30:00"
    assert timestamp_from_text("Captured on 14/03/2024") == "2024-03-14"
    assert timestamp_from_text("no stamps here") == ""


def test_extract_image_mints_filename_person():
    from src.extraction.engine import ExtractionEngine
    from src.models.schema import SourceMetadata

    source = SourceMetadata(
        source_type="image",
        file_name="suresh.jpg",
        file_hash="deadbeef",
        ingestion_time="2024-03-14T09:30:00",
    )
    engine = ExtractionEngine()
    entities, _relations = engine._extract_image(
        {"file_path": "/ev/suresh.jpg", "ocr_text": "", "requires_vision_model": True},
        source,
    )
    persons = [e for e in entities if e.entity_type.value == "PERSON"]
    assert len(persons) == 1
    assert persons[0].name == "Suresh"
    assert persons[0].attributes.get("minted_from") == "filename"
    assert persons[0].confidence.score == pytest.approx(0.55)


def test_extract_image_never_mints_from_surveillance_filename():
    from src.extraction.engine import ExtractionEngine
    from src.models.schema import SourceMetadata

    source = SourceMetadata(
        source_type="image",
        file_name="cctv_frame_01.jpg",
        file_hash="deadbeef",
        ingestion_time="2024-03-14T09:30:00",
    )
    engine = ExtractionEngine()
    entities, _relations = engine._extract_image(
        {"file_path": "/ev/cctv_frame_01.jpg", "ocr_text": "", "requires_vision_model": True},
        source,
    )
    assert not [e for e in entities if e.entity_type.value == "PERSON"]


def test_stage25_minted_person_links_with_filename_basis():
    faces = [_face("f_s", "suresh.jpg", [1.0, 0.0])]
    persons = [
        {"id": "p_suresh", "name": "Suresh", "source_id": "suresh.jpg", "minted_from": "filename"},
    ]
    result = _promotion(faces, persons)
    face = result["faces"][0]
    assert face["person_id"] == "p_suresh"
    assert face["person_name"] == "Suresh"
    # filename-minted ≠ investigator text in the same file → no §5.3 boost
    assert face["link_basis"] == "filename_context"
    assert face["match_confidence"] == pytest.approx(0.55)  # FILENAME_CONTEXT floor


def test_stage25_same_file_text_person_keeps_same_file_basis():
    faces = [_face("f_s", "notes_scan.jpg", [1.0, 0.0])]
    persons = [
        {"id": "p_suresh", "name": "Suresh", "source_id": "notes_scan.jpg"},
    ]
    result = _promotion(faces, persons)
    assert result["faces"][0]["link_basis"] == "same_file_context"


def test_identity_candidate_boosted_by_query_overlay_timestamp():
    a = [1.0, 0.0]
    b = [0.7, 0.714142842854285]  # unit vector, cosine(a, b) = 0.7
    partner = _face("f_p", "suresh.jpg", list(a))
    query = _face("f_q", "cctv_frame_01.jpg", b)
    persons = [
        {"id": "p_suresh", "name": "Suresh", "source_id": "suresh.jpg", "minted_from": "filename"},
    ]
    contexts = {
        "cctv_frame_01.jpg": {
            "ocr_text": "14/03/2024 09:30:00 CAM_07",
            "camera": "CAM_07",
            "overlay_timestamp": "2024-03-14T09:30:00",
            "captured_at": "2024-03-14T09:30:00",
        }
    }
    result = _promotion([partner, query], persons, file_contexts=contexts)
    identity = [c for c in result["candidates"] if c["kind"] == "identity"]
    assert len(identity) == 1
    assert identity[0]["candidate_person_name"] == "Suresh"
    # similarity 0.7 → confidence 0.6, CCTV timestamp boost ×1.1 → 0.66
    assert identity[0]["confidence"] == pytest.approx(0.66, abs=1e-3)
    by_id = {f["id"]: f for f in result["faces"]}
    assert by_id["f_q"]["capture_time_source"] == "overlay"
    assert by_id["f_q"]["captured_at"] == "2024-03-14T09:30:00"


# ---------------------------------------------------------------------------
# Real demo pair: suresh.jpeg ↔ liftCCTV.jpeg (similarity ~0.53, below the
# 0.60 merge tier but above the doc 08 §3.2 candidate floor of 0.40)
# ---------------------------------------------------------------------------

def test_liftcctv_filename_is_neither_person_nor_filename_context():
    # 'liftcctv' wears 'cctv' as a substring — it must not mint a person and
    # must not preempt the CCTV overlay context classification.
    assert fctx.filename_name("liftCCTV.jpeg") == ""
    assert fctx.filename_tokens("liftCCTV.jpeg") == set()
    result = fctx.classify_image_input(
        "/ev/liftCCTV.jpeg",
        ocr_text="REC 2024-06-25 14:32:01 CAM 4 ELEVATOR 2",
    )
    assert result["source_type"] == "SCREENSHOT"
    assert result["context_type"] == "OVERLAID_TEXT"


def test_cctv_overlay_extracts_camera_and_iso_timestamp():
    from src.faces.engine import camera_from_text, timestamp_from_text

    text = "REC 2024-06-25 14:32:01 CAM 4 ELEVATOR 2"
    assert camera_from_text(text) == "CAM_4"
    assert timestamp_from_text(text) == "2024-06-25T14:32:01"


def test_identity_candidate_forms_between_040_and_060():
    """Doc 08 §3.2: candidates form at threshold 0.40 — 0.60 is the merge
    review tier, not the candidate gate. A 0.53 CCTV match must still reach
    the investigator, floored at the doc 11 §5.1 OVERLAID_TEXT 0.65."""
    partner = _face("f_suresh", "suresh.jpeg", [1.0, 0.0])
    query = _face("f_cctv", "liftCCTV.jpeg", [0.53, 0.848])
    persons = [
        {"id": "p_suresh", "name": "Suresh", "source_id": "suresh.jpeg", "minted_from": "filename"},
    ]
    contexts = {
        "liftCCTV.jpeg": {
            "ocr_text": "REC 2024-06-25 14:32:01 CAM 4 ELEVATOR 2",
            "camera": "CAM_4",
            "overlay_timestamp": "2024-06-25T14:32:01",
            "captured_at": "2024-06-25T14:32:01",
        }
    }
    result = _promotion([partner, query], persons, file_contexts=contexts)
    identity = [c for c in result["candidates"] if c["kind"] == "identity"]

    assert len(identity) == 1
    assert identity[0]["source_entity_id"] == "f_cctv"
    assert identity[0]["candidate_person_name"] == "Suresh"
    assert identity[0]["signals"]["face_similarity"] == pytest.approx(0.53, abs=1e-3)
    # similarity 0.53 → mapped confidence 0.195 (×1.1 overlay ≈ 0.215) — the
    # OVERLAID_TEXT floor of 0.65 carries the claim into the review queue
    assert identity[0]["confidence"] == pytest.approx(0.65, abs=1e-3)

    by_id = {f["id"]: f for f in result["faces"]}
    assert by_id["f_suresh"]["status"] == "MATCHED"
    assert by_id["f_cctv"]["status"] == "MATCHED"
    assert by_id["f_cctv"]["camera"] == "CAM_4"
    assert by_id["f_cctv"]["captured_at"] == "2024-06-25T14:32:01"
    assert by_id["f_cctv"]["match_confidence"] == pytest.approx(0.65, abs=1e-3)
    assert result["stats"]["identity_candidates"] == 1


def test_face_decision_confirm_and_reject_roundtrip(tmp_path, monkeypatch):
    import api.app as app_module
    from api.projection import RunProjection
    from api.schemas import FaceDecision

    (tmp_path / "face_embeddings.json").write_text(json.dumps(_face_payload()), encoding="utf-8")
    monkeypatch.setattr(app_module, "_projection", lambda case_id: RunProjection(tmp_path))

    confirmed = app_module.record_face_decision(
        FaceDecision(faceId="face_unknown_0", decision="confirm", reviewer="Insp. Rao")
    )
    assert confirmed["matchStatus"] == "confirmed"
    assert confirmed["decidedBy"] == "Insp. Rao"
    assert confirmed["decidedAt"]

    saved = json.loads((tmp_path / "face_decisions.json").read_text(encoding="utf-8"))
    assert saved["decisions"]["face_unknown_0"]["decision"] == "confirm"

    rejected = app_module.record_face_decision(
        FaceDecision(faceId="face_low_0", decision="reject", reviewer="Insp. Rao")
    )
    assert rejected["matchStatus"] == "rejected"

    # both decisions survive re-projection (a rerun never clears them)
    rows = {r["id"]: r for r in RunProjection(tmp_path).face_records()}
    assert rows["face_unknown_0"]["matchStatus"] == "confirmed"
    assert rows["face_low_0"]["matchStatus"] == "rejected"

    try:
        app_module.record_face_decision(
            FaceDecision(faceId="face_absent", decision="confirm")
        )
    except Exception as exc:  # fastapi.HTTPException(404)
        assert getattr(exc, "status_code", None) == 404
    else:
        raise AssertionError("expected 404 for an unknown face id")


def test_overlay_parsers_survive_ocr_mangling():
    """Tesseract mangles stylized CCTV overlays ('CAM! 4', '14.03.2024');
    the parsers must still recover camera + stamp."""
    from src.faces.engine import camera_from_text, timestamp_from_text

    assert camera_from_text("REC CAM! 4 ah ELEVATOR) 2") == "CAM_4"
    assert camera_from_text("cam 4: elevator") == "CAM_4"  # sparse-pass lowercase
    assert camera_from_text("Camera") == ""  # negative lookahead guards
    assert camera_from_text("scan 4 says can") == ""  # 'can' is not a camera id
    assert timestamp_from_text("REC 2024-06-25 14:32:01") == "2024-06-25T14:32:01"
    assert timestamp_from_text("Date: 14.03.2024 Time: 09:30:00") == "2024-03-14T09:30:00"
    assert timestamp_from_text("Frame 2024/06/25-14:32:01") == "2024-06-25T14:32:01"
    assert timestamp_from_text("2024-13-45 14:32:01") == ""  # invalid date
    assert timestamp_from_text("captured 14/03/2024") == "2024-03-14"
