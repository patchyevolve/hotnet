"""Tests for Stage 8: Contradiction Adjudication.

Two layers:

* Synthetic-fixture tests pinning the semantic boundary itself — the
  exactly-one-survivor rule, the A1/A2 admissibility whitelist, the
  input-failure guard, circular-exclusion, and impact as recomputation
  rather than a band label.
* Contract tests against `output_geo/` (skipped when absent) that check
  the published shape consumers of contradictions.json depend on.
"""

import json
from pathlib import Path

import pytest

from src.contradiction.engine import (
    RULE_PROVENANCE_ABSENCE,
    RULE_SOURCE_DISQUALIFICATION,
    STAGE8_FIELDS,
    adjudicate_all,
    attribution_available,
    community_baselines,
    generate,
    load_inputs,
    value_sources,
)
from src.hypothesis.engine import W_CONTRADICTION


OUT = Path(__file__).resolve().parent.parent / "output_geo"


# ── synthetic fixture ─────────────────────────────────────────────────

EXTRACTION = [
    ("R_raw_1", "Alpha", "clean_a.csv"),
    ("R_raw_2", "Beta", "adv.csv"),
    ("R_raw_3", "Gamma", "adv.csv"),
    ("R_raw_4", "X", "clean_a.csv"),
    ("R_raw_5", "Y", "clean_b.csv"),
    ("R_raw_6", "P", "cam.csv"),
    ("R_raw_7", "Q", "cam.csv"),
    ("R_raw_8", "M", "clean_a.csv"),
    ("R_raw_9", "N", ""),
    ("R_raw_10", "U", "adv.csv"),
    ("R_raw_11", "V", "clean_b.csv"),
    ("R_raw_13", "U", "clean_a.csv"),
]

CONTRADICTIONS = {
    # A1 fires twice, exactly one survivor remains.
    "CON_resolved_a1": {"id": "CON_resolved_a1", "type": "identity",
                        "attribute": "name",
                        "entity_ids": ["R_raw_1", "R_raw_2", "R_raw_3"],
                        "values": ["Alpha", "Beta", "Gamma"],
                        "sources": ["clean_a.csv", "adv.csv", "adv.csv"],
                        "severity": "medium", "resolved": False,
                        "resolution_note": "", "run_id": "run_test"},
    # Two clean classes disagree: not resolved, cross-class => resolvable.
    "CON_cross_class": {"id": "CON_cross_class", "type": "identity",
                        "attribute": "name",
                        "entity_ids": ["R_raw_4", "R_raw_5"],
                        "values": ["X", "Y"],
                        "sources": ["clean_a.csv", "clean_b.csv"],
                        "severity": "medium", "resolved": False,
                        "resolution_note": "", "run_id": "run_test"},
    # One record class contradicts itself: irreducible inside the corpus.
    "CON_single_class": {"id": "CON_single_class", "type": "identity",
                         "attribute": "name",
                         "entity_ids": ["R_raw_6", "R_raw_7"],
                         "values": ["P", "Q"],
                         "sources": ["cam.csv", "cam.csv"],
                         "severity": "high", "resolved": False,
                         "resolution_note": "", "run_id": "run_test"},
    # A2 fires: one value has no source record at all.
    "CON_resolved_a2": {"id": "CON_resolved_a2", "type": "identity",
                        "attribute": "name",
                        "entity_ids": ["R_raw_8", "R_raw_9"],
                        "values": ["M", "N"],
                        "sources": ["clean_a.csv", ""],
                        "severity": "medium", "resolved": False,
                        "resolution_note": "", "run_id": "run_test"},
    # A value asserted by a clean source alongside a flagged one must stand.
    "CON_partial_flag": {"id": "CON_partial_flag", "type": "identity",
                         "attribute": "name",
                         "entity_ids": ["R_raw_10", "R_raw_11", "R_raw_13"],
                         "values": ["U", "V"],
                         "sources": ["adv.csv", "clean_b.csv", "clean_a.csv"],
                         "severity": "medium", "resolved": False,
                         "resolution_note": "", "run_id": "run_test"},
    # No extraction record: attribution is unavailable, nothing may be dropped.
    "CON_no_provenance": {"id": "CON_no_provenance", "type": "identity",
                          "attribute": "name",
                          "entity_ids": ["R_ghost"],
                          "values": ["Ghost1", "Ghost2"],
                          "sources": ["?", "?"],
                          "severity": "low", "resolved": False,
                          "resolution_note": "", "run_id": "run_test"},
}


def _write_fixture(root: Path) -> Path:
    out = root / "output_geo"
    out.mkdir(parents=True, exist_ok=True)

    (out / "community_assignments.json").write_text(json.dumps([
        {"community_id": "COMM_A", "node_ids": ["RES_1", "RES_2", "RES_3"]},
    ]))
    (out / "contradictions.json").write_text(json.dumps(CONTRADICTIONS))
    (out / "id_map.json").write_text(json.dumps({
        "R_raw_1": "RES_1", "R_raw_2": "RES_1", "R_raw_3": "RES_1",
        "R_raw_4": "RES_1", "R_raw_5": "RES_1", "R_raw_6": "RES_2",
        "R_raw_7": "RES_2", "R_raw_8": "RES_3", "R_raw_9": "RES_3",
        "R_raw_10": "RES_1", "R_raw_11": "RES_1", "R_raw_13": "RES_1",
    }))
    (out / "resolved_entities.json").write_text(json.dumps({
        "RES_1": {"id": "RES_1", "canonical_name": "Alice"},
        "RES_2": {"id": "RES_2", "canonical_name": "Bob"},
        "RES_3": {"id": "RES_3", "canonical_name": "Carol"},
    }))
    (out / "extraction_output.json").write_text(json.dumps({
        "entities": [
            {"id": eid, "name": name, "entity_type": "PERSON",
             "attributes": {}, "source_id": source}
            for eid, name, source in EXTRACTION
        ],
    }))
    (out / "extraction_summary.json").write_text(json.dumps({
        "ingestion_summary": {
            "adversarial": {"suspicious_files": ["adv.csv"]},
            "files": [
                {"name": "clean_a.csv", "source_type": "fir"},
                {"name": "clean_b.csv", "source_type": "cdr"},
                {"name": "cam.csv", "source_type": "cctv"},
                {"name": "adv.csv", "source_type": "social"},
            ],
        },
    }))
    (out / "hypotheses.json").write_text(json.dumps([
        {"id": "HYP_run_test:COMM_A:primary", "community_id": "COMM_A",
         "generation_basis": "community",
         "confidence": {"score": 0.75}},
    ]))
    return out


@pytest.fixture()
def fixture_dir(tmp_path):
    return _write_fixture(tmp_path)


def _run(fixture_dir):
    data = load_inputs(fixture_dir)
    return data, adjudicate_all(data, run_id="run_test")


# ── admissibility whitelist ───────────────────────────────────────────

def test_a1_resolves_to_a_single_survivor(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_resolved_a1"]
    assert record["resolved"] is True
    assert record["resolution_evidence"]["standing_values"] == ["Alpha"]
    assert record["resolved_by"] == RULE_SOURCE_DISQUALIFICATION


def test_a1_needs_every_asserting_source_flagged(fixture_dir):
    data, updated = _run(fixture_dir)
    record = updated["CON_partial_flag"]
    assert record["resolved"] is False
    assert set(record["resolution_evidence"]["standing_values"]) == {"U", "V"}
    sources = value_sources(CONTRADICTIONS["CON_partial_flag"],
                            data["entities_by_id"])
    assert sources["U"] == ["adv.csv", "clean_a.csv"]


def test_a2_resolves_when_only_the_unbacked_value_is_removed(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_resolved_a2"]
    assert record["resolved"] is True
    assert record["resolution_evidence"]["standing_values"] == ["M"]
    assert record["resolved_by"] == RULE_PROVENANCE_ABSENCE


def test_elimination_without_a_single_survivor_is_not_resolution(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_partial_flag"]
    evidence = record["resolution_evidence"]
    assert evidence["eliminated_values"] == []
    assert record["resolved"] is False


def test_missing_extraction_never_erases_the_record(fixture_dir):
    data = load_inputs(fixture_dir)
    record = CONTRADICTIONS["CON_no_provenance"]
    assert attribution_available(record, data["entities_by_id"]) is False

    _, updated = _run(fixture_dir)
    verdict = updated["CON_no_provenance"]
    assert verdict["resolved"] is False
    assert verdict["resolution_evidence"]["provenance_available"] is False
    assert verdict["resolution_evidence"]["eliminated_values"] == []
    assert set(verdict["resolution_evidence"]["standing_values"]) == {
        "Ghost1", "Ghost2"}
    assert verdict["resolution_suggestion"]


# ── resolvability ─────────────────────────────────────────────────────

def test_cross_record_class_is_resolvable(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_cross_class"]
    assert record["resolved"] is False
    assert record["resolvable"] is True
    assert record["resolution_suggestion"]


def test_single_record_class_is_irreducible(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_single_class"]
    assert record["resolved"] is False
    assert record["resolvable"] is False
    assert record["resolution_evidence"]["standing_source_classes"] == ["cctv"]
    assert "outside this corpus" in record["resolution_suggestion"]


def test_a_resolved_record_carries_no_pending_suggestion(fixture_dir):
    _, updated = _run(fixture_dir)
    record = updated["CON_resolved_a1"]
    assert record["resolvable"] is False
    assert record["resolution_suggestion"] == ""
    assert record["resolution_note"]


# ── circularity and field ownership ───────────────────────────────────

def test_severity_and_stage3_fields_are_never_rewritten(fixture_dir):
    _, updated = _run(fixture_dir)
    for key, original in CONTRADICTIONS.items():
        record = updated[key]
        assert record["severity"] == original["severity"]
        assert record["type"] == original["type"]
        assert record["values"] == original["values"]
        assert record["entity_ids"] == original["entity_ids"]
        assert record["sources"] == original["sources"]
        assert record["run_id"] == original["run_id"]


def test_stage8_writes_exactly_its_own_field_set(fixture_dir):
    _, updated = _run(fixture_dir)
    for record in updated.values():
        for field in STAGE8_FIELDS:
            assert field in record


def test_no_forbidden_synonyms_are_introduced(fixture_dir):
    _, updated = _run(fixture_dir)
    for record in updated.values():
        assert "supporting_evidence" not in record
        assert "hypothesis_type" not in record


def test_impact_is_recomputed_not_labelled(fixture_dir):
    data, updated = _run(fixture_dir)
    baselines = community_baselines(data)
    # CON_no_provenance names an entity outside every community.
    assert baselines["COMM_A"][0] == len(CONTRADICTIONS) - 1
    members = baselines["COMM_A"][1]

    expected = round(W_CONTRADICTION / members, 6)
    linked = [r for r in updated.values() if r["hypothesis_id"]]
    assert len(linked) == len(CONTRADICTIONS) - 1
    for record in linked:
        assert record["hypothesis_id"] == "HYP_run_test:COMM_A:primary"
        assert record["impact_on_hypothesis"] == pytest.approx(expected)
        assert isinstance(record["impact_on_hypothesis"], float)


def test_impact_is_zero_when_no_community_contains_the_entities(fixture_dir):
    data = load_inputs(fixture_dir)
    data["communities"] = [{"community_id": "COMM_B",
                            "node_ids": ["RES_99"]}]
    updated = adjudicate_all(data, run_id="run_test")
    for record in updated.values():
        assert record["hypothesis_id"] == ""
        assert record["impact_on_hypothesis"] == 0.0


def test_description_names_the_entity_and_the_rules(fixture_dir):
    _, updated = _run(fixture_dir)
    assert "Alice" in updated["CON_resolved_a1"]["description"]
    assert RULE_SOURCE_DISQUALIFICATION in updated["CON_resolved_a1"]["description"]
    assert "Bob" in updated["CON_single_class"]["description"]


# ── determinism and IO ────────────────────────────────────────────────

def test_adjudication_is_deterministic(fixture_dir):
    _, first = _run(fixture_dir)
    _, second = _run(fixture_dir)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_generate_preserves_every_input_key(fixture_dir):
    generate(fixture_dir, run_id="run_test")
    written = json.loads((fixture_dir / "contradictions.json").read_text())
    assert set(written) == set(CONTRADICTIONS)
    owned = {"resolved", "resolution_note"}
    for key, original in CONTRADICTIONS.items():
        for field in original:
            if field in owned:
                continue
            assert written[key][field] == original[field]


def test_generate_returns_a_stage_summary(fixture_dir):
    summary = generate(fixture_dir, run_id="run_test")
    assert summary["contradictions"] == len(CONTRADICTIONS)
    assert summary["resolved"] == 2
    assert summary["unresolved"] == len(CONTRADICTIONS) - 2
    assert summary["eliminated_values"] == 3
    assert summary["linked_hypotheses"] == len(CONTRADICTIONS) - 1
    assert summary["output"] == "contradictions.json"
    assert summary["rules_fired"][RULE_SOURCE_DISQUALIFICATION] == 1
    assert summary["rules_fired"][RULE_PROVENANCE_ABSENCE] == 1
    assert summary["resolvable"] == 2
    assert summary["irreducible"] == 2
    assert summary["resolvable"] == summary["unresolved"] - summary["irreducible"]


def test_load_inputs_tolerates_a_list_shaped_store(fixture_dir):
    (fixture_dir / "contradictions.json").write_text(
        json.dumps(list(CONTRADICTIONS.values())))
    data = load_inputs(fixture_dir)
    assert set(data["contradictions"]) == set(CONTRADICTIONS)


# ── published output ──────────────────────────────────────────────────

@pytest.mark.skipif(not (OUT / "contradictions.json").exists(),
                    reason="pipeline output not present")
class TestPublishedOutput:
    def _load(self):
        return json.loads((OUT / "contradictions.json").read_text())

    def test_every_record_carries_the_stage8_field_set(self):
        for record in self._load().values():
            for field in STAGE8_FIELDS:
                assert field in record

    def test_nothing_is_claimed_resolved_without_a_single_survivor(self):
        for record in self._load().values():
            if record["resolved"]:
                assert len(record["resolution_evidence"]["standing_values"]) == 1
                assert record["resolved_by"]
                assert record["resolution_note"]

    def test_unresolved_records_route_to_stage9(self):
        for record in self._load().values():
            if not record["resolved"]:
                assert record["resolution_suggestion"]
                assert isinstance(record["resolvable"], bool)

    def test_resolution_evidence_names_its_sources(self):
        for record in self._load().values():
            evidence = record["resolution_evidence"]
            assert isinstance(evidence["standing_source_classes"], list)
            assert isinstance(evidence["eliminated_values"], list)
            assert evidence["provenance_available"] is True

    def test_impact_is_a_number_for_linked_records(self):
        for record in self._load().values():
            assert isinstance(record["impact_on_hypothesis"], float)
            assert record["impact_on_hypothesis"] >= 0.0

    def test_severity_is_inherited_not_regraded(self):
        raw = json.loads((OUT / "contradictions.json").read_text())
        assert {r["severity"] for r in raw.values()} <= {"low", "medium",
                                                         "high", "critical"}
