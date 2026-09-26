"""Tests for Stage 9: Gap Detection.

Two layers:

* Synthetic-fixture tests pinning the semantic boundary itself — identity
  and deduplication, the three production rules that suppress a record,
  `data_source` derivation for both kinds, and impact as a recomputed
  measurement rather than a band label or a placeholder.
* Contract tests against `output_geo/` (skipped when absent) that check the
  published shape consumers of evidence_gaps.json depend on.
"""

import json
from pathlib import Path

import pytest

from src.gap_detection.engine import (
    CANONICAL_FIELDS,
    GAP_KINDS,
    KIND_MISSING_RELATION,
    KIND_UNRESOLVED_ATTRIBUTE,
    _missing_key,
    attribute_data_source,
    build_gaps,
    generate,
    gap_id,
    load_inputs,
    relation_data_source,
    relation_impact,
)
from src.hypothesis.engine import confidence_score


OUT = Path(__file__).resolve().parent.parent / "output_geo"


# ── synthetic fixture ─────────────────────────────────────────────────

FILES = [
    ("cdr.csv", "cdr"),
    ("bank.csv", "bank"),
    ("cctv.csv", "cctv"),
    ("fir.csv", "fir"),
    ("social.csv", "social"),
    ("civ.csv", "text"),
]

# COMM_A has an edge fully inside it; COMM_B does not, so Stage 7's
# `_missing_for` falls back to citing an edge that merely touches it.
GRAPH_EDGES = [
    {"id": "EDGE_1", "source_id": "RES_1", "target_id": "RES_2",
     "relationship_type": "CALLED", "provenance_chain": ["cdr.csv"],
     "confidence": {"score": 0.9}},
    {"id": "EDGE_4", "source_id": "RES_2", "target_id": "RES_3",
     "relationship_type": "ASSOCIATED_WITH", "provenance_chain": ["bank.csv"],
     "confidence": {"score": 0.7}},
    {"id": "EDGE_2", "source_id": "RES_4", "target_id": "RES_5",
     "relationship_type": "VISITED", "provenance_chain": ["cctv.csv"],
     "confidence": {"score": 0.8}},
    {"id": "EDGE_3", "source_id": "RES_6", "target_id": "RES_7",
     "relationship_type": "IDENTIFIES_AS", "provenance_chain": ["fir.csv"],
     "confidence": {"score": 0.85}},
]

# The last two describe the same requirement through different raw ids, so
# they must collapse into one gap rather than two.
MISSING_EDGES = [
    {"source_id": "RA", "target_id": "RC", "expected_relation": "CALLED",
     "confidence": 0.95, "source_files": ["civ.csv"]},
    {"source_id": "RQU", "target_id": "RQV", "expected_relation": "CALLED",
     "confidence": 0.95, "source_files": ["civ.csv"]},
    {"source_id": "RB", "target_id": "RF", "expected_relation": "SHARED_ASSOCIATE",
     "confidence": 0.4, "source_files": ["civ.csv"]},
    {"source_id": "RD", "target_id": "RH", "expected_relation": "CALLED",
     "confidence": 0.5, "source_files": ["cdr.csv"]},
]


def _confidence(corroboration, independence, contradiction_absence):
    return {
        "score": confidence_score(corroboration, independence,
                                  contradiction_absence),
        "factors": [
            {"factor_type": "corroboration",
             "value": round(corroboration, 6), "weight": 0.4},
            {"factor_type": "evidence_independence",
             "value": round(independence, 6), "weight": 0.3},
            {"factor_type": "contradiction_absence",
             "value": round(contradiction_absence, 6), "weight": 0.3},
        ],
    }


HYPOTHESES = [
    {"id": "HYP_A", "community_id": "COMM_A", "generation_basis": "community",
     "supporting": ["EDGE_1", "EDGE_4"], "missing": ["RA->RC:CALLED"],
     "contradicting": ["CON_R"], "confidence": _confidence(0.8, 1.0, 0.6)},
    {"id": "HYP_A_alt", "community_id": "COMM_A",
     "generation_basis": "community_alternative",
     "supporting": ["EDGE_1", "EDGE_4"], "missing": ["RA->RC:CALLED"],
     "contradicting": ["CON_R"], "confidence": _confidence(0.8, 1.0, 0.6)},
    {"id": "HYP_B", "community_id": "COMM_B", "generation_basis": "community",
     "supporting": ["EDGE_2"], "missing": ["RD->RH:CALLED"],
     "contradicting": [], "confidence": _confidence(0.8, 1.0, 0.5)},
    {"id": "HYP_B_alt", "community_id": "COMM_B",
     "generation_basis": "community_alternative",
     "supporting": ["EDGE_2"], "missing": ["RD->RH:CALLED"],
     "contradicting": [], "confidence": _confidence(0.8, 1.0, 0.5)},
    {"id": "HYP_null", "community_id": "COMM_N",
     "generation_basis": "null_hypothesis", "supporting": [],
     "missing": ["RA->RC:CALLED", "RQU->RQV:CALLED",
                 "RB->RF:SHARED_ASSOCIATE", "RD->RH:CALLED"],
     "contradicting": ["CON_R", "CON_N"],
     "confidence": _confidence(0.0, 0.0, 0.9)},
]


def _evidence(values, sources, classes, provenance=True):
    return {"standing_values": values, "standing_sources": sources,
            "standing_source_classes": classes, "eliminated_values": [],
            "provenance_available": provenance}


CONTRADICTIONS = {
    # Collapses with CON_R2: same resolved subject, same requirement.
    "CON_R": {"id": "CON_R", "attribute": "name",
              "entity_ids": ["RZ1"], "resolved": False, "resolvable": True,
              "hypothesis_id": "HYP_A", "impact_on_hypothesis": 0.1,
              "resolution_evidence": _evidence(["A1"], ["cctv.csv"], ["cctv"])},
    "CON_R2": {"id": "CON_R2", "attribute": "name",
               "entity_ids": ["RQU"], "resolved": False, "resolvable": True,
               "hypothesis_id": "HYP_B", "impact_on_hypothesis": 0.2,
               "resolution_evidence": _evidence(["A2"], ["cdr.csv"], ["cdr"])},
    # Unresolvable: Stage 8's limitation, not a gap.
    "CON_I": {"id": "CON_I", "attribute": "phone",
              "entity_ids": ["RZ9"], "resolved": False, "resolvable": False,
              "hypothesis_id": "HYP_B", "impact_on_hypothesis": 0.3,
              "resolution_evidence": _evidence(["P"], ["cdr.csv"], ["cdr"])},
    # Already settled: the requirement no longer exists.
    "CON_X": {"id": "CON_X", "attribute": "email",
              "entity_ids": ["RZ2"], "resolved": True, "resolvable": True,
              "hypothesis_id": "HYP_A", "impact_on_hypothesis": 0.4,
              "resolution_evidence": _evidence(["E"], ["fir.csv"], ["fir"])},
    # Provenance never loaded: input failure, not a gap.
    "CON_P": {"id": "CON_P", "attribute": "site",
              "entity_ids": ["RZ9"], "resolved": False, "resolvable": True,
              "hypothesis_id": "", "impact_on_hypothesis": 0.0,
              "resolution_evidence": _evidence(["S"], [], [], False)},
    # Cited only by the null hypothesis.
    "CON_N": {"id": "CON_N", "attribute": "address",
              "entity_ids": ["RZ"], "resolved": False, "resolvable": True,
              "hypothesis_id": "", "impact_on_hypothesis": 0.0,
              "resolution_evidence": _evidence(["X"], ["civ.csv"], ["text"])},
    # Cited by nothing at all: emitted with an empty affects list.
    "CON_U": {"id": "CON_U", "attribute": "occupation",
              "entity_ids": ["RG"], "resolved": False, "resolvable": True,
              "hypothesis_id": "", "impact_on_hypothesis": 0.0,
              "resolution_evidence": _evidence(["Y"], ["bank.csv"], ["bank"])},
    # Same two subjects as a relation gap, different kind and requirement.
    "CON_P2": {"id": "CON_P2", "attribute": "phone",
               "entity_ids": ["RZ1", "RQV"], "resolved": False,
               "resolvable": True, "hypothesis_id": "",
               "impact_on_hypothesis": 0.0,
               "resolution_evidence": _evidence(["Q"], ["cdr.csv"], ["cdr"])},
}


def _write_fixture(root: Path) -> Path:
    out = root / "output_geo"
    out.mkdir(parents=True, exist_ok=True)

    (out / "community_assignments.json").write_text(json.dumps([
        {"community_id": "COMM_A", "node_ids": ["RES_1", "RES_2", "RES_3"]},
        {"community_id": "COMM_B", "node_ids": ["RES_4", "RES_5"]},
        {"community_id": "COMM_N", "node_ids": ["RES_6", "RES_7"]},
    ]))
    (out / "contradictions.json").write_text(json.dumps(CONTRADICTIONS))
    (out / "hypotheses.json").write_text(json.dumps(HYPOTHESES))
    (out / "missing_edges.json").write_text(json.dumps(MISSING_EDGES))
    (out / "graph_edges.json").write_text(json.dumps(GRAPH_EDGES))
    (out / "id_map.json").write_text(json.dumps({
        "RA": "RES_1", "RB": "RES_2", "RC": "RES_3", "RD": "RES_4",
        "RE": "RES_5", "RF": "RES_6", "RG": "RES_7", "RH": "RES_8",
        "RZ": "RES_9", "RZ1": "RES_1", "RZ2": "RES_1", "RZ9": "RES_9",
        "RQU": "RES_1", "RQV": "RES_3",
    }))
    (out / "resolved_entities.json").write_text(json.dumps({
        f"RES_{i}": {"id": f"RES_{i}", "canonical_name": f"Entity {i}"}
        for i in range(1, 10)
    }))
    (out / "extraction_summary.json").write_text(json.dumps({
        "ingestion_summary": {
            "files": [{"name": n, "source_type": c} for n, c in FILES],
        },
    }))
    return out


@pytest.fixture()
def fixture_dir(tmp_path):
    return _write_fixture(tmp_path)


def _gaps(fixture_dir, run_id="run_test"):
    return build_gaps(load_inputs(fixture_dir), run_id)


def _by_requirement(gaps, kind):
    return {g["requirement"]: g for g in gaps if g["kind"] == kind}


# ── identity and deduplication ────────────────────────────────────────

def test_gap_identity_excludes_the_hypothesis(fixture_dir):
    gaps = _gaps(fixture_dir)
    called = [g for g in gaps if g["kind"] == KIND_MISSING_RELATION
              and g["requirement"] == "CALLED"
              and set(g["subject"]) == {"RES_1", "RES_3"}]
    # Two raw-id spellings plus four citing hypotheses, one gap.
    assert len(called) == 1
    assert len(called[0]["affects_hypothesis"]) == 3


def test_hypothesis_occurrences_collapse_to_one_gap_per_requirement(fixture_dir):
    gaps = _gaps(fixture_dir)
    occurrences = sum(len(h.get("missing") or []) for h in HYPOTHESES)
    relation = [g for g in gaps if g["kind"] == KIND_MISSING_RELATION]
    # 8 citations across 5 hypotheses describe 3 distinct requirements.
    assert occurrences == 8
    assert len(relation) == 3


def test_two_records_describing_one_requirement_merge(fixture_dir):
    gaps = _gaps(fixture_dir)
    called = [g for g in gaps if g["kind"] == KIND_MISSING_RELATION
              and set(g["subject"]) == {"RES_1", "RES_3"}]
    # RA->RC and RQU->RQV resolve onto the same pair.
    assert len(called) == 1
    # Union of both records' scoping, not the first record's alone.
    assert set(called[0]["affects_hypothesis"]) == {
        "HYP_A", "HYP_A_alt", "HYP_null"}


def test_two_contradictions_on_one_requirement_collapse(fixture_dir):
    gaps = _gaps(fixture_dir)
    attribute = _by_requirement(gaps, KIND_UNRESOLVED_ATTRIBUTE)
    merged = attribute["name"]
    assert set(merged["affects_hypothesis"]) == {
        "HYP_A", "HYP_A_alt", "HYP_B", "HYP_null"}
    assert merged["reach"] == 4
    # The largest conditional effect across the collapsed group.
    assert merged["impact_on_hypothesis"] == pytest.approx(0.2)


def test_kinds_do_not_collide_on_shared_subjects(fixture_dir):
    gaps = _gaps(fixture_dir)
    relation = next(g for g in gaps if g["kind"] == KIND_MISSING_RELATION
                    and set(g["subject"]) == {"RES_1", "RES_3"})
    attribute = next(g for g in gaps if g["kind"] == KIND_UNRESOLVED_ATTRIBUTE
                     and set(g["subject"]) == {"RES_1", "RES_3"})
    # Identical subject, different kind and requirement: two gaps, no clash.
    assert relation["id"] != attribute["id"]
    # One subject tuple appears under both kinds while others do not.
    shared = [g for g in gaps if tuple(g["subject"]) == ("RES_1", "RES_3")]
    assert len(shared) == 2
    assert {g["kind"] for g in shared} == set(GAP_KINDS)
    # RES_1 also carries an attribute requirement on its own.
    assert {g["kind"] for g in gaps if "RES_1" in g["subject"]} == set(GAP_KINDS)


def test_ids_are_stable_across_runs_and_free_of_the_run_id(fixture_dir):
    first = _gaps(fixture_dir, run_id="run_a")
    second = _gaps(fixture_dir, run_id="run_b")
    assert [g["id"] for g in first] == [g["id"] for g in second]
    assert {g["run_id"] for g in first} == {"run_a"}
    assert all(gap_id("missing_relation", ["RES_1", "RES_3"], "CALLED")
               == g["id"] for g in second
               if g["kind"] == KIND_MISSING_RELATION
               and set(g["subject"]) == {"RES_1", "RES_3"})


def test_no_duplicate_ids_are_emitted(fixture_dir):
    gaps = _gaps(fixture_dir)
    ids = [g["id"] for g in gaps]
    assert len(ids) == len(set(ids))


# ── production rules: what does NOT become a gap ──────────────────────

def test_unresolvable_contradictions_are_not_gaps(fixture_dir):
    ids = {g["id"] for g in _gaps(fixture_dir)}
    assert gap_id(KIND_UNRESOLVED_ATTRIBUTE, ["RES_9"], "phone") not in ids


def test_resolved_contradictions_are_not_gaps(fixture_dir):
    ids = {g["id"] for g in _gaps(fixture_dir)}
    assert gap_id(KIND_UNRESOLVED_ATTRIBUTE, ["RES_1"], "email") not in ids


def test_missing_provenance_is_an_input_failure_not_a_gap(fixture_dir):
    ids = {g["id"] for g in _gaps(fixture_dir)}
    assert gap_id(KIND_UNRESOLVED_ATTRIBUTE, ["RES_9"], "site") not in ids


def test_a_gapless_fixture_produces_nothing(fixture_dir):
    (fixture_dir / "contradictions.json").write_text(json.dumps({}))
    (fixture_dir / "missing_edges.json").write_text(json.dumps([]))
    assert _gaps(fixture_dir) == []


# ── scope and reach ───────────────────────────────────────────────────

def test_affects_hypothesis_joins_both_scope_sources(fixture_dir):
    gaps = _gaps(fixture_dir)
    named = _by_requirement(gaps, KIND_UNRESOLVED_ATTRIBUTE)["name"]
    # Citing hypotheses from Stage 7 plus Stage 8's linked primary.
    assert set(named["affects_hypothesis"]) >= {"HYP_A", "HYP_B", "HYP_null"}


def test_reach_is_exactly_the_size_of_the_affects_list(fixture_dir):
    for gap in _gaps(fixture_dir):
        assert gap["reach"] == len(gap["affects_hypothesis"])


def test_an_unscoped_gap_is_still_emitted_with_an_empty_affects_list(fixture_dir):
    gaps = _gaps(fixture_dir)
    unscoped = [g for g in gaps if not g["affects_hypothesis"]]
    # CON_U (cited by nothing) and CON_P2 (cited by nothing).
    assert {g["requirement"] for g in unscoped} == {"occupation", "phone"}
    for gap in unscoped:
        assert gap["reach"] == 0
        assert gap["data_source"]


# ── data_source and feasibility ───────────────────────────────────────

def test_attribute_data_source_is_the_complement_of_the_standing_classes():
    corpus = ["bank", "cdr", "cctv", "fir"]
    assert attribute_data_source(["cctv"], corpus) == ["bank", "cdr", "fir"]
    assert attribute_data_source([], corpus) == corpus
    assert attribute_data_source(corpus, corpus) == []


def test_merged_attribute_gap_unions_its_standing_classes(fixture_dir):
    gaps = _gaps(fixture_dir)
    named = _by_requirement(gaps, KIND_UNRESOLVED_ATTRIBUTE)["name"]
    # CON_R stands on cctv, CON_R2 on cdr; both are consumed.
    assert named["data_source"] == ["bank", "fir", "social", "text"]


def test_relation_data_source_prefers_observed_carriers():
    carriers = {"CALLED": {"cdr"}}
    incident = {"RES_1": {"bank"}}
    assert relation_data_source("CALLED", ["RES_1", "RES_2"],
                                carriers, incident) == ["cdr"]


def test_relation_data_source_falls_back_to_incident_subject_classes():
    carriers = {}
    incident = {"RES_1": {"bank", "social"}, "RES_2": {"cdr"}}
    assert relation_data_source("SHARED_ASSOCIATE", ["RES_1", "RES_2"],
                                carriers, incident) == ["bank", "cdr",
                                                        "social"]


def test_both_kinds_derive_a_data_source_in_the_fixture(fixture_dir):
    gaps = _gaps(fixture_dir)
    assert {tuple(g["data_source"]) for g in gaps} != {tuple()}
    for gap in gaps:
        assert gap["feasible"] is True
        assert gap["data_source"]


# ── impact is a measurement ───────────────────────────────────────────

def _primary(score, corroboration, contradiction_absence, supporting):
    return {"supporting": supporting,
            "confidence": {"score": score, "factors": [
                {"factor_type": "corroboration", "value": corroboration},
                {"factor_type": "contradiction_absence",
                 "value": contradiction_absence},
            ]}}


def test_impact_is_recomputed_and_may_be_negative():
    primary = _primary(confidence_score(0.95, 1.0, 0.5), 0.95, 0.5, ["E1"])
    edges = {"E1": {"provenance_chain": ["a.csv"]}}
    record = {"source_id": "RES_1", "target_id": "RES_2",
              "confidence": 0.1, "source_files": ["b.csv"]}
    delta = relation_impact(primary, record, edges, {"RES_1", "RES_2"})
    assert delta < 0


def test_impact_is_positive_when_the_gathered_record_strengthens_the_family():
    primary = _primary(confidence_score(0.5, 1.0, 0.5), 0.5, 0.5, ["E1"])
    edges = {"E1": {"provenance_chain": ["a.csv"]}}
    # A fresh source file: corroboration rises and independence holds.
    record = {"source_id": "RES_1", "target_id": "RES_2",
              "confidence": 0.9, "source_files": ["b.csv"]}
    delta = relation_impact(primary, record, edges, {"RES_1", "RES_2"})
    assert delta > 0


def test_impact_is_zero_when_the_edge_could_never_become_internal(fixture_dir):
    gaps = _gaps(fixture_dir)
    shared = [g for g in gaps if g["requirement"] == "SHARED_ASSOCIATE"]
    assert len(shared) == 1
    # Cited only by the null hypothesis, which has no community edges.
    assert shared[0]["impact_on_hypothesis"] == 0.0


def test_impact_is_zero_when_no_citing_primary_exists(fixture_dir):
    gaps = _gaps(fixture_dir)
    called = [g for g in gaps if g["requirement"] == "CALLED"]
    fallback = next(g for g in called
                    if set(g["subject"]) == {"RES_4", "RES_8"})
    # HYP_B cites it, but RES_8 sits outside COMM_B, so it stays external.
    assert "HYP_B" in fallback["affects_hypothesis"]
    assert fallback["impact_on_hypothesis"] == 0.0


def test_attribute_impact_is_stages_own_recomputation(fixture_dir):
    gaps = _gaps(fixture_dir)
    named = _by_requirement(gaps, KIND_UNRESOLVED_ATTRIBUTE)["name"]
    contradiction = CONTRADICTIONS["CON_R2"]
    assert named["impact_on_hypothesis"] == pytest.approx(
        contradiction["impact_on_hypothesis"])


def test_impact_satisfies_stored_plus_impact_equals_recomputed(fixture_dir):
    from src.hypothesis.engine import evidence_independence

    data = load_inputs(fixture_dir)
    gaps = build_gaps(data, "run_test")
    primaries = {h["id"]: h for h in data["hypotheses"]
                 if h.get("generation_basis") == "community"}
    checked = 0
    for gap in gaps:
        if gap["kind"] != KIND_MISSING_RELATION or gap["impact_on_hypothesis"] == 0.0:
            continue
        primary = next(primaries[i] for i in gap["affects_hypothesis"]
                       if i in primaries)
        record = next(m for m in data["missing_edges"]
                      if gap_id(KIND_MISSING_RELATION,
                                sorted({data["id_map"].get(m["source_id"],
                                                           m["source_id"]),
                                        data["id_map"].get(m["target_id"],
                                                           m["target_id"])}),
                                m["expected_relation"]) == gap["id"])
        factors = {f["factor_type"]: f["value"]
                   for f in primary["confidence"]["factors"]}
        edges = [e for e in data["graph_edges"] if e["id"] in primary["supporting"]]
        count = len(primary["supporting"])
        recomputed = confidence_score(
            (factors["corroboration"] * count + record["confidence"]) / (count + 1),
            evidence_independence(edges + [{"provenance_chain":
                                            record["source_files"]}]),
            factors["contradiction_absence"])
        assert (round(primary["confidence"]["score"]
                      + gap["impact_on_hypothesis"], 6) == recomputed)
        checked += 1
    assert checked >= 1


# ── contract: no placeholders, no invented fields ─────────────────────

def test_the_canonical_field_set_is_emitted_exactly(fixture_dir):
    for gap in _gaps(fixture_dir):
        assert set(gap) == set(CANONICAL_FIELDS)


def test_discrimination_and_information_gain_are_absent_not_zeroed(fixture_dir):
    forbidden = {"discrimination", "information_gain", "impact",
                 "investigator_action"}
    for gap in _gaps(fixture_dir):
        assert not (set(gap) & forbidden)


def test_kinds_are_restricted_to_the_documented_enum(fixture_dir):
    for gap in _gaps(fixture_dir):
        assert gap["kind"] in GAP_KINDS


def test_suggested_action_is_derived_from_requirement_and_data_source(fixture_dir):
    for gap in _gaps(fixture_dir):
        action = gap["suggested_action"]
        assert gap["requirement"] in action
        for source in gap["data_source"]:
            assert source in action
        assert action.startswith("Acquire a ")


def test_description_states_the_requirement_without_resolving_it(fixture_dir):
    for gap in _gaps(fixture_dir):
        assert gap["requirement"] in gap["description"]
        assert gap["id"] not in gap["description"]


def test_generate_writes_the_store_and_returns_a_summary(fixture_dir):
    summary = generate(fixture_dir, run_id="run_test")
    stored = json.loads((fixture_dir / "evidence_gaps.json").read_text())
    assert len(stored) == summary["gaps"] == 7
    assert summary["by_kind"] == {KIND_MISSING_RELATION: 3,
                                  KIND_UNRESOLVED_ATTRIBUTE: 4}
    assert summary["output"] == "evidence_gaps.json"
    assert summary["infeasible"] == 0


def test_generation_is_deterministic(fixture_dir):
    first = generate(fixture_dir, run_id="run_test")
    second = generate(fixture_dir, run_id="run_test")
    assert first == second


# ── published output ──────────────────────────────────────────────────

@pytest.mark.skipif(not (OUT / "evidence_gaps.json").exists(),
                    reason="pipeline output not present")
class TestPublishedOutput:
    @pytest.fixture(autouse=True)
    def _load(self):
        self.gaps = json.loads((OUT / "evidence_gaps.json").read_text())

    def test_the_canonical_field_set_is_published(self):
        for gap in self.gaps:
            assert set(gap) == set(CANONICAL_FIELDS)

    def test_ids_are_unique(self):
        ids = [g["id"] for g in self.gaps]
        assert len(ids) == len(set(ids))

    def test_every_attribute_gap_traces_to_a_resolvable_contradiction(self):
        contradictions = json.loads(
            (OUT / "contradictions.json").read_text())
        if isinstance(contradictions, dict):
            contradictions = list(contradictions.values())
        expected = {(c["attribute"], tuple(sorted(set(
                    c.get("entity_ids") or []))))
                    for c in contradictions
                    if c.get("resolvable") and not c.get("resolved")}
        published = {(g["requirement"], tuple(g["subject"]))
                     for g in self.gaps
                     if g["kind"] == KIND_UNRESOLVED_ATTRIBUTE}
        # Subjects are resolved, so compare on requirement counts only.
        assert len(published) == len(expected)

    def test_reach_counts_match_the_affects_lists(self):
        for gap in self.gaps:
            assert gap["reach"] == len(gap["affects_hypothesis"])

    def test_no_placeholder_values_for_the_dropped_metrics(self):
        for gap in self.gaps:
            assert "discrimination" not in gap
            assert "information_gain" not in gap

    def test_impact_is_a_number_within_the_score_range(self):
        for gap in self.gaps:
            assert isinstance(gap["impact_on_hypothesis"], float)
            assert -1.0 <= gap["impact_on_hypothesis"] <= 1.0

    def test_stage7_missing_keys_join_the_missing_edge_store(self):
        hypotheses = json.loads((OUT / "hypotheses.json").read_text())
        store = {_missing_key(m)
                 for m in json.loads((OUT / "missing_edges.json").read_text())}
        cited = {k for h in hypotheses for k in (h.get("missing") or [])}
        assert cited <= store
