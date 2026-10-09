"""Tests for the label inventory and baseline evaluation (Roadmap 0.3, R1.1, R1.3).

The rules these protect are the ones most likely to be broken by a future
"just make the metric work" change:

* a pair is a negative **only** when a source scan recorded its absence;
* a predicted edge is never a label;
* the split is temporal and ignores run-clock fields like ``created_at``;
* when labels are insufficient the run **reports blockers instead of
  inventing negatives**.
"""

import json
from pathlib import Path

import pytest

from src.ml.evaluation import evaluate_baseline
from src.ml.labels import (
    MIN_POSITIVES_FOR_TIME_SPLIT,
    TRAIN_FRACTION,
    candidate_pairs,
    inventory_labels,
    parse_timestamp,
)


def edge(edge_id, source, target, *, relation="CALLED", status="observation",
         timestamp=None, created_at="2026-09-25T22:50:36"):
    temporal = {"timestamp": timestamp} if timestamp else {}
    return {
        "id": edge_id,
        "source_id": source,
        "target_id": target,
        "relationship_type": relation,
        "epistemic_status": status,
        "temporal_info": temporal,
        "created_at": created_at,
    }


def write_output(root: Path, edges, missing=(), contradictions=None):
    root.mkdir(parents=True, exist_ok=True)
    (root / "graph_edges.json").write_text(json.dumps(list(edges)))
    (root / "missing_edges.json").write_text(json.dumps(list(missing)))
    (root / "contradictions.json").write_text(json.dumps(contradictions or {}))
    return root


def default_edges():
    return [
        edge("E1", "RES_a", "RES_b", timestamp="2024-03-10"),
        edge("E2", "RES_b", "RES_c", timestamp="2024-03-12"),
        edge("E3", "RES_c", "RES_d", timestamp="2024-03-14"),
        edge("E4", "RES_d", "RES_e", timestamp="2024-03-16"),
        edge("E5", "RES_e", "RES_f", timestamp="2024-03-18"),
        edge("E6", "RES_f", "RES_g"),
        # Untimestamped edge that only exists so the negative's endpoints are
        # real nodes: a pair whose endpoints are not in the graph cannot be
        # scored, and that would confound these tests with a coverage issue.
        edge("E7", "RES_h", "RES_j"),
    ]


def default_missing():
    return [
        {"source_id": "RES_g", "target_id": "RES_h",
         "expected_relation": "CALLED", "confidence": 0.5},
    ]


class TestTimestampParsing:
    def test_date_only_and_datetime_both_parse(self):
        assert parse_timestamp("2024-03-14").day == 14
        assert parse_timestamp("2024-03-12T09:15:22").hour == 9

    def test_blank_and_unknown_return_none(self):
        assert parse_timestamp(None) is None
        assert parse_timestamp("") is None
        assert parse_timestamp("not a date") is None

    def test_unknown_precision_is_not_coerced(self):
        # A guessed time would silently corrupt the time-aware split.
        assert parse_timestamp({"precision": "unknown"}) is None


class TestLabelInventory:
    def test_positives_come_from_observed_edges_only(self, tmp_path):
        write_output(
            tmp_path,
            default_edges()
            + [edge("E9", "RES_x", "RES_y", status="prediction")],
        )
        inventory = inventory_labels(tmp_path)
        assert inventory.n_positives == 7
        assert all(item.label == 1 for item in inventory.positives)
        assert any("epistemic_status" in w for w in inventory.warnings)

    def test_unobserved_pair_is_never_labelled_negative(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=[])
        inventory = inventory_labels(tmp_path)
        assert inventory.n_negatives == 0
        # ...and that absence of negatives blocks evaluation rather than
        # being papered over by sampling random non-edges.
        assert any("known-absent negatives" in b for b in inventory.blockers)
        assert not inventory.gate_ready

    def test_absence_recorded_by_a_source_scan_becomes_a_negative(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        inventory = inventory_labels(tmp_path)
        assert inventory.n_negatives == 1
        negative = inventory.negatives[0]
        assert negative.label == 0
        assert "missing_edges.json" in negative.provenance

    def test_observed_pair_wins_over_a_missing_edge(self, tmp_path):
        write_output(
            tmp_path,
            default_edges(),
            missing=[{"source_id": "RES_a", "target_id": "RES_b",
                      "expected_relation": "CALLED"}],
        )
        inventory = inventory_labels(tmp_path)
        assert inventory.n_negatives == 0
        assert any("appear both observed" in w for w in inventory.warnings)

    def test_duplicate_missing_edges_collapse(self, tmp_path):
        write_output(
            tmp_path,
            default_edges(),
            missing=default_missing() + default_missing(),
        )
        assert inventory_labels(tmp_path).n_negatives == 1

    def test_split_uses_event_time_not_run_clock(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        inventory = inventory_labels(tmp_path)
        # Five edges carry timestamps; the sixth (E6) has only created_at.
        assert inventory.n_timestamped_positives == 5
        train, test = inventory.train_edge_ids, inventory.test_edge_ids
        assert set(train).isdisjoint(test)
        assert set(train) | set(test) == {
            "E1", "E2", "E3", "E4", "E5"
        }

    def test_split_is_strictly_temporal(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        inventory = inventory_labels(tmp_path)
        train_times = [
            item.timestamp for item in inventory.positives
            if item.record_id in inventory.train_edge_ids
        ]
        test_times = [
            item.timestamp for item in inventory.positives
            if item.record_id in inventory.test_edge_ids
        ]
        assert max(train_times) < min(test_times)

    def test_split_is_reproducible(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        first = inventory_labels(tmp_path)
        second = inventory_labels(tmp_path)
        assert first.split == second.split

    def test_no_timestamps_means_no_time_aware_split(self, tmp_path):
        write_output(
            tmp_path,
            [edge(f"E{i}", f"RES_{i}", f"RES_{i + 1}") for i in range(5)],
            missing=default_missing(),
        )
        inventory = inventory_labels(tmp_path)
        assert inventory.train_edge_ids == ()
        assert any(
            "time-aware split" in blocker for blocker in inventory.blockers
        )
        assert not inventory.gate_ready

    def test_predeclared_parameters_are_reported_verbatim(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        parameters = inventory_labels(tmp_path).parameters
        assert parameters["train_fraction"] == TRAIN_FRACTION
        assert parameters["min_positives_for_time_split"] == (
            MIN_POSITIVES_FOR_TIME_SPLIT
        )

    def test_missing_edge_also_on_a_positive_is_not_double_counted(self, tmp_path):
        write_output(
            tmp_path,
            default_edges() + [edge("E9", "RES_g", "RES_h")],
            missing=default_missing(),
        )
        inventory = inventory_labels(tmp_path)
        assert inventory.n_negatives == 0

    def test_empty_directory_blocks_cleanly(self, tmp_path):
        tmp_path.mkdir(parents=True, exist_ok=True)
        inventory = inventory_labels(tmp_path)
        assert inventory.n_positives == 0
        assert inventory.blockers
        assert not inventory.gate_ready

    def test_report_shape_carries_sources_with_permissible_use(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        payload = inventory_labels(tmp_path).to_dict()
        assert payload["verdict"]
        assert {s["kind"] for s in payload["sources"]} >= {"positive", "negative"}
        for source in payload["sources"]:
            assert source["provenance"]
            assert source["permissible_use"]


class TestCandidatePairs:
    def test_labelled_pairs_only_when_requested(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        inventory = inventory_labels(tmp_path)
        labelled = candidate_pairs(inventory, ["RES_a", "RES_b"], include_unknown_pairs=False)
        assert ("RES_a", "RES_b") in labelled

    def test_unknown_pairs_are_enumerated_for_coverage(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        inventory = inventory_labels(tmp_path)
        all_pairs = candidate_pairs(inventory, ["RES_a", "RES_b", "RES_z"])
        assert ("RES_a", "RES_z") in all_pairs


class TestBaselineEvaluation:
    def test_insufficient_labels_are_reported_not_computed(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=[])
        report = evaluate_baseline(tmp_path, run_id="t")
        assert report["status"] == "not_evaluated"
        assert report["metrics"] is None
        assert report["gate"]["computable"] is False
        assert report["gate"]["blockers"]

    def test_sufficient_labels_produce_metrics(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        report = evaluate_baseline(tmp_path, run_id="t")
        assert report["status"] == "evaluated"
        metrics = report["metrics"]["common_neighbours"]
        for field in (
            "average_precision",
            "auc_roc",
            "expected_calibration_error",
            "no_skill_ap",
            "subgroups",
            "average_precision_ci95",
        ):
            assert field in metrics

    def test_test_edges_are_withheld_from_the_snapshot(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        report = evaluate_baseline(tmp_path, run_id="t")
        assert report["leakage_controls"]["test_edges_withheld_before_snapshot"]
        assert report["withheld_edge_ids"]
        assert report["snapshot"]["withheld_edges"] == len(
            report["withheld_edge_ids"]
        )

    def test_outcome_fields_are_declared_excluded(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        report = evaluate_baseline(tmp_path, run_id="t")
        excluded = report["leakage_controls"]["outcome_fields_excluded"]
        assert "confidence" in excluded
        assert "hypothesis factors" in excluded

    def test_predictions_carry_full_provenance_and_cannot_be_evidence(
        self, tmp_path
    ):
        write_output(tmp_path, default_edges(), missing=default_missing())
        report = evaluate_baseline(tmp_path, run_id="t")
        predictions = report["predictions"]
        assert predictions
        for prediction in predictions:
            assert prediction["as_evidence"] is False
            assert prediction["epistemic_status"] == "prediction"
            provenance = prediction["provenance"]
            assert provenance["model_name"]
            assert provenance["model_version"]
            assert provenance["run_id"] == "t"
            assert provenance["input_snapshot"]
            assert provenance["supporting_record_ids"]

    def test_gate_reports_decisive_findings_with_codes(self, tmp_path):
        write_output(tmp_path, default_edges(), missing=default_missing())
        report = evaluate_baseline(tmp_path, run_id="t")
        findings = report["gate"]["decisive_findings"]
        assert findings
        assert all("code" in f and "detail" in f for f in findings)
        assert report["gate"]["acceptance"] in {"capable", "not_capable"}
        assert report["roadmap_conclusion"]["baseline_retained"] is True


class TestPublishedOutput:
    """Contract checks against the real pipeline output, skipped when absent."""

    OUTPUT = Path(__file__).resolve().parent.parent / "output_geo"

    @pytest.mark.skipif(
        not (Path(__file__).resolve().parent.parent / "output_geo" / "graph_edges.json").exists(),
        reason="pipeline output not present",
    )
    def test_real_corpus_never_justifies_a_gnn_yet(self):
        report = evaluate_baseline(self.OUTPUT, run_id="published")
        # This assertion is the point of the whole milestone: with known-absent
        # negatives sparse (<= 20), the baseline cannot beat a random ranking,
        # so R1.4's precondition for a neural model is not met.
        assert report["label_inventory"]["counts"]["negatives"] <= 20
        assert report["gate"]["acceptance"] == "not_capable"
        assert report["roadmap_conclusion"]["gnn_justified"] is False
        assert report["status"] == "evaluated"

    @pytest.mark.skipif(
        not (Path(__file__).resolve().parent.parent / "output_geo" / "graph_edges.json").exists(),
        reason="pipeline output not present",
    )
    def test_real_corpus_has_no_predicted_labels(self):
        inventory = inventory_labels(self.OUTPUT)
        assert all(item.label == 1 for item in inventory.positives)
        assert all(item.label == 0 for item in inventory.negatives)
