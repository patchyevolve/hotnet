"""Tests for the metric implementations (ML_ENGINE.md R1.3).

Every expected value here is computed by hand from the definition, so these
tests check the arithmetic rather than pinning whatever the code currently
returns. R1.3 requires AUPRC *and* calibration *and* coverage *and* subgroup
breakdowns — each has its own section, because shipping only the headline
number is precisely the failure mode the roadmap warns about.
"""

import pytest

from src.ml.metrics import (
    auc_roc,
    average_precision,
    bootstrap_interval,
    bootstrap_metric,
    calibration_bins,
    coverage_at_k,
    equal_width_bins,
    expected_calibration_error,
    no_skill_reference,
    precision_at_k,
    score_classification_report,
    subgroup_reports,
)


class TestAveragePrecision:
    def test_perfect_ranking_scores_one(self):
        assert average_precision([1, 1, 0, 0], [0.9, 0.8, 0.7, 0.6]) == 1.0

    def test_no_positives_scores_zero_not_one(self):
        # Finding nothing when there is nothing to find is not a success.
        assert average_precision([0, 0], [0.9, 0.1]) == 0.0

    def test_inverted_ranking_matches_hand_computation(self):
        # positives at scores 0.6, 0.7; negatives at 0.8, 0.9
        # ranking desc: 0, 0, 1, 1
        #   at hit 1: precision 1/3, recall 1/2 -> (1/3)(1/2)
        #   at hit 2: precision 2/4, recall 1/1 -> (1/2)(1/2)
        # AP = 1/6 + 1/4 = 5/12
        assert average_precision([1, 1, 0, 0], [0.6, 0.7, 0.8, 0.9]) == pytest.approx(
            5 / 12
        )

    def test_no_skill_reference_is_prevalence_not_half(self):
        labels = [1, 1, 1, 0]
        assert no_skill_reference(labels) == 0.75

    def test_length_mismatch_rejected(self):
        with pytest.raises(ValueError, match="must align"):
            average_precision([1, 0], [0.5])

    def test_empty_rejected(self):
        with pytest.raises(ValueError, match="empty"):
            average_precision([], [])


class TestAucRoc:
    def test_perfect_separation(self):
        assert auc_roc([1, 0], [0.9, 0.1]) == 1.0

    def test_inverted_separation(self):
        assert auc_roc([1, 0], [0.1, 0.9]) == 0.0

    def test_total_ties_score_half(self):
        assert auc_roc([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5]) == 0.5

    def test_single_class_is_undefined_and_reports_zero(self):
        assert auc_roc([1, 1], [0.9, 0.1]) == 0.0


class TestCalibration:
    def test_perfectly_calibrated_scores_give_zero_ece(self):
        # Both members of the 0.5 bin are correct half the time.
        labels = [1, 0]
        scores = [0.5, 0.5]
        assert expected_calibration_error(labels, scores, bins=2) == pytest.approx(
            0.0, abs=1e-12
        )

    def test_confident_and_wrong_is_fully_miscalibrated(self):
        labels = [0, 0]
        scores = [1.0, 1.0]
        assert expected_calibration_error(labels, scores, bins=2) == pytest.approx(1.0)

    def test_empty_bins_are_omitted_not_invented_as_zero(self):
        report = calibration_bins([1], [0.1], bins=5)
        assert len(report) == 1
        assert report[0]["bin"] == 0

    def test_score_outside_unit_interval_rejected(self):
        with pytest.raises(ValueError, match=r"outside \[0, 1\]"):
            equal_width_bins([1.5], bins=5)

    def test_too_few_bins_rejected(self):
        with pytest.raises(ValueError, match="bins must be"):
            equal_width_bins([0.5], bins=1)

    def test_bin_edges_are_declared(self):
        report = calibration_bins([1, 1], [0.0, 0.99], bins=2)
        edges = sorted((entry["lower"], entry["upper"]) for entry in report)
        assert edges == [(0.0, 0.5), (0.5, 1.0)]


class TestRankingUtilities:
    def test_precision_at_k_counts_only_the_top_k(self):
        labels = [1, 0, 1, 0]
        scores = [0.9, 0.8, 0.7, 0.6]
        assert precision_at_k(labels, scores, 2) == pytest.approx(0.5)
        assert precision_at_k(labels, scores, 4) == pytest.approx(0.5)

    def test_precision_at_k_requires_positive_k(self):
        with pytest.raises(ValueError, match="positive"):
            precision_at_k([1], [0.5], 0)

    def test_coverage_at_k_reports_recall_in_the_top_k(self):
        labels = [1, 0, 1, 0]
        scores = [0.9, 0.8, 0.7, 0.6]
        # top-2 contains one of the two positives
        assert coverage_at_k(labels, scores, 2) == pytest.approx(0.5)

    def test_coverage_with_no_positives_is_zero(self):
        assert coverage_at_k([0, 0], [0.9, 0.1], 1) == 0.0


class TestBootstrap:
    def test_interval_is_ordered_and_brackets_the_data(self):
        low, high = bootstrap_interval([0.1, 0.2, 0.3, 0.4, 0.5])
        assert low <= high
        assert 0.1 <= low and high <= 0.5

    def test_interval_is_reproducible(self):
        first = bootstrap_metric([1, 0, 1, 0], [0.9, 0.2, 0.8, 0.1], average_precision)
        second = bootstrap_metric([1, 0, 1, 0], [0.9, 0.2, 0.8, 0.1], average_precision)
        assert first == second

    def test_bootstrap_needs_two_observations(self):
        with pytest.raises(ValueError, match="at least two"):
            bootstrap_metric([1], [0.5], average_precision)

    def test_confidence_must_be_interior(self):
        with pytest.raises(ValueError, match="must lie in"):
            bootstrap_interval([0.1, 0.2], confidence=1.5)


class TestReportAndSubgroups:
    def test_report_contains_every_r1_3_field(self):
        report = score_classification_report([1, 0, 1, 0], [0.9, 0.2, 0.8, 0.1])
        for field in (
            "average_precision",
            "auc_roc",
            "no_skill_ap",
            "expected_calibration_error",
            "precision",
            "recall",
            "calibration",
        ):
            assert field in report
        assert report["positives"] == 2
        assert report["negatives"] == 2
        assert report["prevalence"] == 0.5

    def test_threshold_counts_are_hand_verifiable(self):
        labels = [1, 0, 1, 0]
        scores = [0.9, 0.2, 0.8, 0.1]
        report = score_classification_report(labels, scores, threshold=0.5)
        assert report["true_positives"] == 2
        assert report["false_positives"] == 0
        assert report["false_negatives"] == 0

    def test_subgroups_are_split_by_declared_group(self):
        labels = [1, 1, 0, 0]
        scores = [0.9, 0.1, 0.2, 0.8]
        groups = ["CALL", "CALL", "VISIT", "VISIT"]
        report = subgroup_reports(labels, scores, groups)
        assert set(report) == {"CALL", "VISIT"}
        assert report["CALL"]["n"] == 2
        assert report["CALL"]["positives"] == 2

    def test_small_or_positive_free_groups_are_flagged_unreliable(self):
        labels = [0, 0, 1]
        scores = [0.9, 0.2, 0.5]
        groups = ["A", "A", "B"]
        report = subgroup_reports(labels, scores, groups, minimum_size=2)
        assert report["A"]["reliable"] is False  # no positives
        assert report["B"]["reliable"] is False  # below minimum_size

    def test_group_length_mismatch_rejected(self):
        with pytest.raises(ValueError, match="align"):
            subgroup_reports([1, 0], [0.5, 0.4], ["only-one"])
