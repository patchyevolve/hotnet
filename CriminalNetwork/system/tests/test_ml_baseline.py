"""Tests for snapshots, structural features and the non-neural baseline.

The central property under test is **leakage resistance**: a withheld edge
must be invisible to every feature and every score computed for it. If it were
not, common-neighbour counts would read the answer and any model compared
against them would look better than it is.
"""

import pytest

from src.ml.baseline import (
    BASELINE_SCORERS,
    DEFAULT_BASELINE,
    available_scorers,
    coverage,
    describe,
    score,
    score_many,
)
from src.ml.features import (
    EDGE_STRUCTURAL_FEATURES,
    pair_features,
    structural_features_for,
    vectors_to_matrix,
)
from src.ml.snapshot import build_snapshot, load_snapshot, snapshot_hash

# Triangle a-b-c plus a pendant d hanging off a, and a separate pair e-f.
EDGES = [
    {"id": "E1", "source_id": "a", "target_id": "b", "relationship_type": "X"},
    {"id": "E2", "source_id": "b", "target_id": "c", "relationship_type": "X"},
    {"id": "E3", "source_id": "a", "target_id": "c", "relationship_type": "X"},
    {"id": "E4", "source_id": "a", "target_id": "d", "relationship_type": "Y"},
    {"id": "E5", "source_id": "e", "target_id": "f", "relationship_type": "Y"},
]


def snapshot(**kwargs):
    return build_snapshot(EDGES, run_id="test", **kwargs)


class TestSnapshot:
    def test_hash_is_deterministic_and_content_addressed(self):
        assert snapshot().hash == snapshot().hash
        assert snapshot_hash(EDGES) == snapshot_hash(list(EDGES))

    def test_withholding_changes_the_hash(self):
        assert snapshot().hash != snapshot(withheld_edge_ids=["E1"]).hash

    def test_withheld_edge_is_gone_from_adjacency(self):
        held = snapshot(withheld_edge_ids=["E1"])
        assert not held.are_linked("a", "b")
        assert held.are_linked("b", "c")
        assert held.has_withheld
        assert held.n_edges == len(EDGES) - 1

    def test_withheld_edge_leaves_the_pair_disconnected_in_hops(self):
        # Leakage guard: with E1 present the a-b distance is 1, which would
        # reveal the label directly. After withholding, a-c-b gives 2.
        from src.ml.features import pair_features

        full_path = pair_features(snapshot(), "a", "b").as_dict()[
            "shortest_path_length"
        ]
        held_path = pair_features(
            snapshot(withheld_edge_ids=["E1"]), "a", "b"
        ).as_dict()["shortest_path_length"]
        assert full_path == 1.0
        assert held_path == 2.0

    def test_withholding_does_not_erase_unrelated_structure(self):
        held = snapshot(withheld_edge_ids=["E1"])
        # c remains a common neighbour of a and b: removing the a-b edge does
        # not remove their shared neighbourhood, only the direct link.
        assert held.common_neighbours("a", "b") == {"c"}

    def test_summary_reports_counts(self):
        summary = snapshot().summary()
        assert summary["edges"] == 5
        assert summary["withheld_edges"] == 0
        assert summary["hash"] == snapshot().hash

    def test_blank_endpoint_rejected(self):
        with pytest.raises(ValueError, match="blank endpoint"):
            build_snapshot(
                [{"id": "X", "source_id": "a", "target_id": ""}], run_id="t"
            )

    def test_missing_id_rejected(self):
        with pytest.raises(ValueError, match="non-empty id"):
            build_snapshot([{"source_id": "a", "target_id": "b"}], run_id="t")

    def test_load_snapshot_reads_pipeline_output(self, tmp_path):
        import json

        (tmp_path / "graph_edges.json").write_text(json.dumps(EDGES))
        loaded = load_snapshot(tmp_path, run_id="r")
        assert loaded.n_edges == 5
        assert loaded.hash == build_snapshot(EDGES, run_id="r").hash


class TestFeatures:
    def test_pair_features_match_hand_values(self):
        # neighbours(a) = {b, c, d}, neighbours(b) = {a, c}
        # common = {c}; union = {a, b, c, d}
        vector = pair_features(snapshot(), "a", "b")
        values = vector.as_dict()
        assert values["degree_product"] == 3 * 2
        assert values["common_neighbours"] == 1.0
        assert values["jaccard"] == pytest.approx(1.0 / 4.0)
        assert values["adamic_adar"] == pytest.approx(1.0 / __import__("math").log(2))
        assert values["shortest_path_length"] == 1.0

    def test_disconnected_pair_has_no_common_neighbours(self):
        values = pair_features(snapshot(), "d", "e").as_dict()
        assert values["common_neighbours"] == 0.0
        assert values["jaccard"] == 0.0

    def test_unreachable_pair_reports_zero_path_but_stays_finite(self):
        values = pair_features(snapshot(), "d", "e").as_dict()
        assert values["shortest_path_length"] == 0.0

    def test_unknown_node_raises_rather_than_returning_zero(self):
        with pytest.raises(KeyError, match="not in snapshot"):
            pair_features(snapshot(), "a", "zzz")

    def test_vector_carries_snapshot_hash_and_schema(self):
        vector = pair_features(snapshot(), "a", "b")
        assert vector.snapshot_hash == snapshot().hash
        assert vector.schema_version

    def test_column_order_is_declared_not_discovered(self):
        vectors = [pair_features(snapshot(), "a", "b")]
        matrix = vectors_to_matrix(vectors)
        assert len(matrix[0]) == len(EDGE_STRUCTURAL_FEATURES)
        assert matrix[0][EDGE_STRUCTURAL_FEATURES.index("jaccard")] == pytest.approx(
            0.25
        )

    def test_node_features_include_clustering(self):
        # neighbours(c) = {a, b} and a-b are linked, so c's local clustering
        # coefficient is exactly 1.0; node a has an unlinked pair (b, d) and
        # therefore sits below 1.0.
        clustered = structural_features_for(snapshot(), "c")
        assert clustered["degree"] == 2.0
        assert clustered["clustering_coefficient"] == pytest.approx(1.0)

        partially = structural_features_for(snapshot(), "a")
        assert partially["degree"] == 3.0
        assert 0.0 < partially["clustering_coefficient"] < 1.0


class TestBaseline:
    def test_all_scorers_return_unit_interval(self):
        snap = snapshot()
        for name in available_scorers():
            assert 0.0 <= score(snap, "a", "b", scorer=name) <= 1.0

    def test_default_scorer_is_the_r1_3_reference(self):
        assert DEFAULT_BASELINE == "common_neighbours"

    def test_scorer_catalogue_is_documented(self):
        assert set(describe()) == set(available_scorers())
        assert all(text for text in describe().values())

    def test_unknown_scorer_rejected(self):
        with pytest.raises(KeyError, match="unknown scorer"):
            score(snapshot(), "a", "b", scorer="made_up")

    def test_unknown_endpoint_raises_instead_of_scoring_zero(self):
        with pytest.raises(KeyError, match="not in snapshot"):
            score(snapshot(), "a", "zzz")

    def test_linked_pair_outranks_unlinked_pair(self):
        snap = snapshot()
        linked = score(snap, "a", "b")
        unlinked = score(snap, "d", "e")
        assert linked > unlinked

    def test_scores_are_deterministic(self):
        snap = snapshot()
        first = [score(snap, "a", "b"), score(snap, "a", "d")]
        second = [score(snap, "a", "b"), score(snap, "a", "d")]
        assert first == second

    def test_withholding_hides_the_edge_from_path_features(self):
        # The most direct leakage channel: if the held-out edge stays in the
        # graph, its endpoints sit at distance 1 and any consumer could read
        # the label straight off the feature vector.
        from src.ml.features import pair_features

        present = pair_features(snapshot(), "a", "b").as_dict()
        withheld = pair_features(
            snapshot(withheld_edge_ids=["E1"]), "a", "b"
        ).as_dict()
        assert present["shortest_path_length"] == 1.0
        assert withheld["shortest_path_length"] == 2.0
        assert present["degree_product"] > withheld["degree_product"]

    def test_normalisation_ceiling_is_structural(self):
        # The best-scoring pair in the graph scores exactly 1.0.
        snap = snapshot()
        best = max(
            score(snap, "a", "b"),
            score(snap, "a", "c"),
            score(snap, "b", "c"),
        )
        assert best == pytest.approx(1.0)

    def test_degree_product_blind_to_overlap_that_neighbours_see(self):
        # Two stars: p->q,r  and  x->y,z. Pairs (q,r) and (q,y) have the same
        # endpoint degrees, so preferential attachment scores them equally
        # even though only (q,r) has a shared neighbour. This is why R1.3
        # asks for a common-neighbour baseline specifically.
        star_edges = [
            {"id": "S1", "source_id": "p", "target_id": "q"},
            {"id": "S2", "source_id": "p", "target_id": "r"},
            {"id": "S3", "source_id": "x", "target_id": "y"},
            {"id": "S4", "source_id": "x", "target_id": "z"},
        ]
        snap = build_snapshot(star_edges, run_id="t")
        shared = score(snap, "q", "r", scorer="degree_product")
        separate = score(snap, "q", "y", scorer="degree_product")
        assert shared == pytest.approx(separate)

        assert score(snap, "q", "r", scorer="common_neighbours") > score(
            snap, "q", "y", scorer="common_neighbours"
        )

    def test_score_many_skips_unscorable_pairs(self):
        snap = snapshot()
        pairs = [("a", "b"), ("a", "zzz")]
        assert len(score_many(snap, pairs)) == 1

    def test_coverage_reports_the_skipped_fraction(self):
        snap = snapshot()
        report = coverage(snap, [("a", "b"), ("a", "zzz")])
        assert report["candidates"] == 2
        assert report["scorable"] == 1
        assert report["unscorable"] == 1
        assert report["coverage"] == pytest.approx(0.5)

    def test_scorer_set_is_declared(self):
        assert "common_neighbours" in BASELINE_SCORERS
        assert len(available_scorers()) >= 4
