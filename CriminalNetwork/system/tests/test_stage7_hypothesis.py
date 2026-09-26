"""Tests for Stage 7: Hypothesis Engine.

Two layers:

* Synthetic-fixture tests. Each one pins a defect found by reading the
  data the pipeline actually produces rather than by asserting on a
  green run — raw-id membership mismatches, id_map blind spots,
  edge-scoped signals, share-based level selection, and the RULE 1-5
  generation guarantees.
* Contract tests against `output_geo/` (skipped when absent) that check
  the published shape consumers of hypotheses.json depend on.
"""

import json
from pathlib import Path

import pytest

from src.hypothesis.engine import (
    CANONICAL_FIELDS,
    FORBIDDEN_SYNONYMS,
    HYPOTHESIS_LEVELS,
    NULL_HYPOTHESIS_ID,
    PRIMARY_CANDIDATE_LEVELS,
    build_hypotheses,
    derive_primary_type,
    generate,
    load_inputs,
)


OUT = Path(__file__).resolve().parent.parent / "output_geo"


# ── synthetic fixture ─────────────────────────────────────────────────

def _edge(eid, src, tgt, score=0.9, prov=("f1.csv",), etype="associational",
          rtype="CALLED"):
    return {
        "id": eid, "source_id": src, "target_id": tgt,
        "confidence": {"score": score},
        "provenance_chain": list(prov),
        "edge_type": etype, "relationship_type": rtype,
    }


def _write_fixture(root: Path) -> Path:
    """Minimal output_geo exercising every id-namespace the stage reads."""
    out = root / "output_geo"
    out.mkdir(parents=True, exist_ok=True)

    (out / "community_assignments.json").write_text(json.dumps([
        {"community_id": "COMM_A", "node_ids": ["RES_1", "RES_2", "RES_3"]},
    ]))

    (out / "graph_edges.json").write_text(json.dumps([
        _edge("EDGE_A", "RES_1", "RES_2", prov=("f1.csv", "f2.csv")),
        _edge("EDGE_B", "RES_2", "RES_3", prov=("f1.csv", "f3.csv")),
        _edge("EDGE_C", "RES_1", "RES_3", prov=("f1.csv", "f4.csv")),
    ]))

    # Contradiction carries RAW extraction ids, exactly as Stage 2 emits.
    (out / "contradictions.json").write_text(json.dumps({
        "CON_1": {"id": "CON_1", "type": "identity", "attribute": "name",
                  "entity_ids": ["LOC_raw_1", "PERSON_raw_1"],
                  "resolved": False},
    }))

    (out / "missing_edges.json").write_text(json.dumps([]))
    (out / "anomaly_signals.json").write_text(json.dumps([
        {"signal_id": "SIG_1", "entity_id": "RES_2", "signal_type": "hub"},
        {"signal_id": "SIG_2", "entity_id": "EDGE_B",
         "signal_type": "adversarial_edge"},
    ]))

    (out / "resolved_entities.json").write_text(json.dumps({
        "RES_1": {"id": "RES_1", "canonical_name": "Alice", "merge_type": "auto",
                  "entity_type": "PERSON"},
        "RES_2": {"id": "RES_2", "canonical_name": "Bob", "merge_type": "single",
                  "entity_type": "PERSON"},
        "RES_3": {"id": "RES_3", "canonical_name": "Carol", "merge_type": "single",
                  "entity_type": "PERSON"},
    }))

    (out / "timeline_events.json").write_text(json.dumps([
        {"id": "TLEVT_1", "entity_id": "DATE_raw_1", "event_type": "incident"},
        {"id": "TLEVT_2", "entity_id": "RES_3", "event_type": "social_post"},
    ]))

    (out / "id_map.json").write_text(json.dumps({
        "LOC_raw_1": "RES_1",
        "PERSON_raw_1": "RES_1",
        "DATE_raw_1": "RES_2",
        "RES_2": "RES_2",
    }))

    (out / "extraction_summary.json").write_text(json.dumps({
        "ingestion_summary": {"adversarial": {"suspicious_files": []}},
    }))
    return out


@pytest.fixture()
def fixture_dir(tmp_path):
    return _write_fixture(tmp_path)


def _run(fixture_dir):
    data = load_inputs(fixture_dir)
    return build_hypotheses(data, run_id="run_test")


# ── id-namespace regressions ──────────────────────────────────────────

def test_raw_contradiction_ids_resolve_to_members(fixture_dir):
    """Stage 2 emits LOC_/PERSON_ ids; communities are built from RES_.

    Comparing them directly matches nothing, which silently zeroed the
    contradiction factor on every hypothesis in the run.
    """
    hyps = _run(fixture_dir)
    primary = next(h for h in hyps
                   if h["generation_basis"] == "community")
    assert primary["contradicting"] == ["CON_1"], (
        "a contradiction naming LOC_raw_1/PERSON_raw_1 (both mapping to "
        "RES_1) must attach to the community containing RES_1"
    )
    contradiction_factor = next(
        f for f in primary["confidence"]["factors"]
        if f["factor_type"] == "contradiction_absence"
    )
    assert contradiction_factor["value"] < 1.0, (
        "an unresolved contradiction among members must lower "
        "contradiction_absence below 1.0"
    )


def test_events_matched_through_id_map(fixture_dir):
    """Timeline events attach to raw DATE_/POST_ ids, not RES_ ids."""
    hyps = _run(fixture_dir)
    event_alt = next(h for h in hyps
                     if h["generation_basis"] == "community_alternative"
                     and h["type"] == "event")
    # TLEVT_1 carries a raw DATE_ id and is only visible through id_map;
    # TLEVT_2 already carries a RES_ id and must still match.
    assert event_alt["supporting"] == ["TLEVT_1", "TLEVT_2"]


def test_edge_scoped_signals_are_not_dropped(fixture_dir):
    """Anomaly signals can name an EDGE_ instead of an entity."""
    hyps = _run(fixture_dir)
    primary = next(h for h in hyps
                   if h["generation_basis"] == "community")
    assert set(primary["pattern_matches"]) == {"SIG_1", "SIG_2"}


# ── primary level selection ───────────────────────────────────────────

def test_level_shares_share_one_denominator():
    edges = [_edge(f"E{i}", "RES_1", "RES_2") for i in range(4)]
    level, shares = derive_primary_type(
        internal_edges=edges,
        disputed_members={"RES_1"},
        event_anchored_members=set(),
    )
    assert level == "entity"
    assert sum(shares.values()) == len(edges), (
        "the three candidates must partition the same denominator"
    )
    assert shares["entity"] == 4 and shares["relationship"] == 0


def test_event_level_wins_only_over_unclaimed_links():
    edges = [_edge(f"E{i}", "RES_1", "RES_2") for i in range(4)]
    level, shares = derive_primary_type(
        internal_edges=edges,
        disputed_members=set(),
        event_anchored_members={"RES_1"},
    )
    assert level == "event" and shares == {"entity": 0, "event": 4,
                                           "relationship": 0}


def test_relationship_is_the_remainder():
    edges = [_edge(f"E{i}", "RES_1", "RES_2") for i in range(3)]
    level, shares = derive_primary_type(
        internal_edges=edges, disputed_members=set(),
        event_anchored_members=set(),
    )
    assert level == "relationship" and shares["relationship"] == 3


def test_disputed_outranks_event_anchor():
    """Precedence: identity is upstream of temporality."""
    edges = [_edge(f"E{i}", "RES_1", "RES_2") for i in range(2)]
    level, shares = derive_primary_type(
        internal_edges=edges, disputed_members={"RES_1"},
        event_anchored_members={"RES_1", "RES_2"},
    )
    assert level == "entity" and shares["event"] == 0


def test_challenge_levels_are_never_primary():
    assert "source_error" not in PRIMARY_CANDIDATE_LEVELS
    assert "causal" not in PRIMARY_CANDIDATE_LEVELS


# ── RULE 1-5 generation guarantees ────────────────────────────────────

def test_every_family_covers_all_five_levels(fixture_dir):
    hyps = _run(fixture_dir)
    by_id = {h["id"]: h for h in hyps}
    primary = next(h for h in hyps if h["generation_basis"] == "community")
    levels = [by_id[a]["type"] for a in primary["alternatives"]]
    assert sorted(levels) == sorted(HYPOTHESIS_LEVELS), (
        "RULE 1: alternatives must exist at all five levels"
    )


def test_null_hypothesis_always_present_and_referenced(fixture_dir):
    hyps = _run(fixture_dir)
    nulls = [h for h in hyps if h["id"] == NULL_HYPOTHESIS_ID]
    assert len(nulls) == 1, "RULE 4: exactly one null hypothesis"
    assert nulls[0]["alternatives"], "the null competes with the primaries"
    for h in hyps:
        assert h["null_hypothesis"] == NULL_HYPOTHESIS_ID


def test_every_hypothesis_has_falsifiers_and_sensitivity(fixture_dir):
    """RULE 3 — including for levels with no supporting evidence at all."""
    for h in _run(fixture_dir):
        assert h["falsifiers"], f"{h['id']} has no falsifier"
        assert h["confidence"], f"{h['id']} has no confidence"
        assert h["reasoning"] and h["description"]
        assert h["sensitivity"]["key_assumptions"], (
            f"{h['id']} reports no key assumption"
        )
        for f in h["falsifiers"]:
            assert f["status"] == "not_searched", (
                "this pipeline performs no falsification search"
            )
            assert f["impact"] in {"reject_hypothesis", "weaken_hypothesis",
                                   "require_revision"}


def test_entity_alternative_excludes_the_top_member(fixture_dir):
    """RULE 5: an alternative must survive without the leading actor."""
    hyps = _run(fixture_dir)
    by_id = {h["id"]: h for h in hyps}
    primary = next(h for h in hyps if h["generation_basis"] == "community")
    entity_alt = next(by_id[a] for a in primary["alternatives"]
                      if by_id[a]["type"] == "entity")

    edges = json.loads((fixture_dir / "graph_edges.json").read_text())
    degree = {}
    for e in edges:
        for node in (e["source_id"], e["target_id"]):
            degree[node] = degree.get(node, 0) + 1
    ranked = sorted(degree, key=lambda n: -degree[n])
    top, focus = ranked[0], ranked[1]

    expected = sorted(e["id"] for e in edges
                      if focus in (e["source_id"], e["target_id"]))
    assert entity_alt["supporting"] == expected, (
        "the entity alternative must be built from the second-ranked "
        "member's links, not the group as a whole"
    )
    entities = json.loads((fixture_dir / "resolved_entities.json").read_text())
    focus_name = entities[focus]["canonical_name"]
    assert focus_name in entity_alt["description"]
    assert "rather than the most-connected member" in entity_alt["description"]
    assert entity_alt["description"].count("rather than the most-connected") == 1
    assert top != focus


def test_alternatives_are_mutually_linked(fixture_dir):
    hyps = _run(fixture_dir)
    by_id = {h["id"]: h for h in hyps}
    primary = next(h for h in hyps if h["generation_basis"] == "community")
    assert len(primary["alternatives"]) == 5
    for alt_id in primary["alternatives"]:
        alt = by_id[alt_id]
        assert primary["id"] in alt["alternatives"]
        assert alt_id in primary["alternatives"]
        siblings = set(alt["alternatives"]) - {primary["id"]}
        assert siblings == set(primary["alternatives"]) - {alt_id}


def test_ids_are_deterministic(fixture_dir):
    """Ids derive from run + community + level keys, never from a clock."""
    first = _run(fixture_dir)
    second = _run(fixture_dir)
    assert [h["id"] for h in first] == [h["id"] for h in second]
    assert [f["id"] for h in first for f in h["falsifiers"]] == \
           [f["id"] for h in second for f in h["falsifiers"]]


# ── canonical contract ────────────────────────────────────────────────

def test_exact_canonical_field_set(fixture_dir):
    for h in _run(fixture_dir):
        assert set(h) == set(CANONICAL_FIELDS), (
            f"{h['id']} field delta: {set(h) ^ set(CANONICAL_FIELDS)}"
        )
        assert not (set(h) & set(FORBIDDEN_SYNONYMS))


def test_confidence_decomposes_exactly(fixture_dir):
    for h in _run(fixture_dir):
        conf = h["confidence"]
        assert conf["semantic_type"] == "hypothesis"
        assert conf["basis"] and conf["factors"]
        total = round(sum(f["value"] * f["weight"] for f in conf["factors"]), 6)
        assert total == conf["score"], (
            f"{h['id']}: score {conf['score']} != sum of factors {total}"
        )
        assert 0.0 <= conf["score"] <= 1.0
        assert 0.0 <= h["evidence_independence"] <= 1.0


def test_reference_lists_are_flat_and_typed(fixture_dir):
    for h in _run(fixture_dir):
        for key in ("supporting", "alternatives", "contradicting",
                    "pattern_matches", "missing"):
            assert isinstance(h[key], list)
            assert all(isinstance(x, str) for x in h[key]), (
                f"{h['id']}[{key}] must be a flat list of ids"
            )
            assert len(set(h[key])) == len(h[key]), (
                f"{h['id']}[{key}] contains duplicates"
            )


def test_primary_types_stay_inside_the_level_enum(fixture_dir):
    for h in _run(fixture_dir):
        assert h["type"] in HYPOTHESIS_LEVELS


def test_unsupported_levels_say_so(fixture_dir):
    """An empty basis must never be dressed up as an established claim."""
    hyps = _run(fixture_dir)
    for h in hyps:
        if h["generation_basis"] != "community_alternative":
            continue
        if h["supporting"]:
            continue
        assert "Nothing in this community's evidence supports" in h["description"], (
            f"{h['id']} has no support but does not disclose it"
        )


# ── published output ──────────────────────────────────────────────────

def test_generate_writes_hypotheses_json(tmp_path):
    _write_fixture(tmp_path)
    summary = generate(tmp_path / "output_geo", run_id="run_gen")
    path = tmp_path / "output_geo" / "hypotheses.json"
    assert path.exists()
    hyps = json.loads(path.read_text())
    assert summary["hypotheses"] == len(hyps)
    assert summary["primary_hypotheses"] == 1
    assert summary["alternative_hypotheses"] == 5
    assert summary["null_hypothesis"] == 1
    assert summary["output"] == "hypotheses.json"


@pytest.mark.skipif(not (OUT / "hypotheses.json").exists(),
                    reason="pipeline output not present")
class TestPublishedOutput:
    """Invariants over the real run, not a synthetic fixture."""

    @pytest.fixture(autouse=True)
    def _load(self):
        self.hyps = json.loads((OUT / "hypotheses.json").read_text())
        self.by_id = {h["id"]: h for h in self.hyps}
        self.communities = json.loads(
            (OUT / "community_assignments.json").read_text())

    def test_cardinality_matches_communities(self):
        primaries = [h for h in self.hyps
                     if h["generation_basis"] == "community"]
        assert len(primaries) == len(self.communities)
        assert len(self.hyps) == len(self.communities) * 6 + 1

    def test_every_community_is_covered(self):
        covered = {h["community_id"] for h in self.hyps
                   if h["generation_basis"] == "community"}
        assert covered == {c["community_id"] for c in self.communities}

    def test_all_reference_ids_resolve(self):
        edge_ids = {e["id"] for e in json.loads(
            (OUT / "graph_edges.json").read_text())}
        signal_ids = {s["signal_id"] for s in json.loads(
            (OUT / "anomaly_signals.json").read_text())}
        event_ids = {e["id"] for e in json.loads(
            (OUT / "timeline_events.json").read_text())}
        resolvable = edge_ids | set(self.by_id)
        for h in self.hyps:
            for ref in h["supporting"]:
                assert ref in resolvable or ref in event_ids, (
                    f"{h['id']} references unknown object {ref}"
                )
            for ref in h["pattern_matches"]:
                assert ref in signal_ids, (
                    f"{h['id']} references unknown signal {ref}"
                )
            for ref in h["alternatives"]:
                assert ref in self.by_id, (
                    f"{h['id']} references unknown hypothesis {ref}"
                )

    def test_no_thresholded_word_list_types(self):
        """type is the five-level enum, never a crime taxonomy."""
        assert {h["type"] for h in self.hyps} <= set(HYPOTHESIS_LEVELS)

    def test_contradictions_reach_the_hypotheses(self):
        """Regression: raw-id comparison made contradicting always empty."""
        assert any(h["contradicting"] for h in self.hyps), (
            "no hypothesis cites a contradiction — the id namespace is "
            "mismatched again"
        )
