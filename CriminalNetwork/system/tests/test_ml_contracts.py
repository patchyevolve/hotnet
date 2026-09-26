"""Tests for the ML artifact contracts (ML_ENGINE.md Roadmap 0.2).

These tests exist to prove that a malformed artifact *cannot be constructed*.
Each rejection is a roadmap rule turned into a hard error, so a future change
that quietly drops provenance, emits an unnormalized posterior, or lets an ML
result be marked as evidence fails here rather than in production.
"""

import pytest

from src.ml.contracts import (
    BNPosterior,
    EPISTEMIC_INFERENCE,
    EPISTEMIC_PREDICTION,
    FEATURE_SCHEMA_VERSION,
    FeatureVector,
    LinkPrediction,
    PREDICTION_SCHEMA_VERSION,
    Provenance,
    UNCALIBRATED,
    Uncertainty,
)


def make_provenance(**overrides):
    payload = dict(
        schema_version=PREDICTION_SCHEMA_VERSION,
        model_name="structural_link_baseline",
        model_version="1.0.0",
        run_id="run16",
        input_snapshot="deadbeef00000000",
        supporting_record_ids=("EDGE_1",),
        created_at="2026-09-26T00:00:00+00:00",
    )
    payload.update(overrides)
    return Provenance(**payload)


class TestProvenance:
    @pytest.mark.parametrize(
        "field",
        ["schema_version", "model_name", "model_version", "run_id", "input_snapshot"],
    )
    def test_every_required_field_must_be_non_empty(self, field):
        with pytest.raises(ValueError, match=field):
            make_provenance(**{field: ""})

    def test_supporting_record_ids_are_tuple(self):
        prov = make_provenance(supporting_record_ids=["EDGE_1", "EDGE_2"])
        assert prov.supporting_record_ids == ("EDGE_1", "EDGE_2")

    def test_snapshot_hash_is_the_reproducibility_anchor(self):
        # Roadmap 0.2: a prediction must name the graph it came from.
        with pytest.raises(ValueError, match="input_snapshot"):
            make_provenance(input_snapshot="")


class TestUncertainty:
    def test_unavailable_forces_none_so_missing_never_reads_as_zero(self):
        assert UNCALIBRATED.method == "unavailable"
        assert UNCALIBRATED.value is None
        assert UNCALIBRATED.is_measured is False

    def test_unavailable_cannot_carry_a_number(self):
        with pytest.raises(ValueError, match="value=None"):
            Uncertainty(method="unavailable", value=0.0)

    def test_measured_requires_a_value(self):
        with pytest.raises(ValueError, match="measured value"):
            Uncertainty(method="bootstrap_ci")

    def test_measured_must_be_in_unit_interval(self):
        with pytest.raises(ValueError, match=r"\[0, 1\]"):
            Uncertainty(method="ece", value=1.5)

    def test_measured_is_accepted(self):
        uncertainty = Uncertainty(method="bootstrap_ci", value=0.12)
        assert uncertainty.is_measured


class TestFeatureVector:
    def test_schema_version_is_pinned(self):
        with pytest.raises(ValueError, match="schema_version"):
            FeatureVector(
                schema_version="0.9.0",
                snapshot_hash="abc",
                subject=("a", "b"),
                values=(("degree", 1.0),),
            )

    def test_duplicate_feature_names_rejected(self):
        with pytest.raises(ValueError, match="unique names"):
            FeatureVector(
                schema_version=FEATURE_SCHEMA_VERSION,
                snapshot_hash="abc",
                subject=("a", "b"),
                values=(("degree", 1.0), ("degree", 2.0)),
            )

    def test_non_finite_value_rejected(self):
        with pytest.raises(ValueError, match="finite"):
            FeatureVector(
                schema_version=FEATURE_SCHEMA_VERSION,
                snapshot_hash="abc",
                subject=("a",),
                values=(("degree", float("nan")),),
            )

    def test_as_dict_returns_plain_floats(self):
        vector = FeatureVector(
            schema_version=FEATURE_SCHEMA_VERSION,
            snapshot_hash="abc",
            subject=("a", "b"),
            values=(("degree", 2),),
        )
        assert vector.as_dict() == {"degree": 2.0}


class TestLinkPrediction:
    def make(self, **overrides):
        payload = dict(
            provenance=make_provenance(),
            source_id="RES_A",
            target_id="RES_B",
            score=0.4,
        )
        payload.update(overrides)
        return LinkPrediction(**payload)

    def test_score_out_of_range_rejected(self):
        with pytest.raises(ValueError, match=r"\[0, 1\]"):
            self.make(score=1.7)

    def test_self_loop_rejected(self):
        with pytest.raises(ValueError, match="self-loops"):
            self.make(target_id="RES_A")

    def test_cannot_be_marked_as_evidence(self):
        with pytest.raises(ValueError, match="as_evidence"):
            self.make(as_evidence=True)

    @pytest.mark.parametrize("status", ["observation", "inferred", ""])
    def test_cannot_masquerade_as_an_observation(self, status):
        with pytest.raises(ValueError, match="epistemic_status"):
            self.make(epistemic_status=status)

    def test_default_status_is_prediction(self):
        assert self.make().epistemic_status == EPISTEMIC_PREDICTION
        assert self.make().as_evidence is False

    def test_claiming_calibration_without_measurement_rejected(self):
        with pytest.raises(ValueError, match="measured"):
            self.make(calibration_status="measured", uncertainty=UNCALIBRATED)

    def test_key_is_order_independent(self):
        assert self.make().key == ("RES_A", "RES_B")
        assert self.make(source_id="RES_B", target_id="RES_A").key == ("RES_A", "RES_B")

    def test_to_dict_exposes_key_for_joins(self):
        assert self.make().to_dict()["key"] == ["RES_A", "RES_B"]


class TestBNPosterior:
    def make(self, **overrides):
        payload = dict(
            provenance=make_provenance(),
            query_variable="Rain",
            distribution=(("True", 0.7), ("False", 0.3)),
            assumptions=("synthetic fixture",),
            parameter_provenance=("hand-set CPT",),
        )
        payload.update(overrides)
        return BNPosterior(**payload)

    def test_distribution_must_normalize(self):
        with pytest.raises(ValueError, match="sum to 1.0"):
            self.make(distribution=(("True", 0.7), ("False", 0.2)))

    def test_negative_probability_rejected(self):
        with pytest.raises(ValueError, match=r"\[0, 1\]"):
            self.make(distribution=(("True", 1.4), ("False", -0.4)))

    def test_duplicate_state_rejected(self):
        with pytest.raises(ValueError, match="duplicate state"):
            self.make(distribution=(("True", 0.5), ("True", 0.5)))

    def test_assumptions_are_mandatory(self):
        with pytest.raises(ValueError, match="assumptions"):
            self.make(assumptions=())

    def test_parameter_provenance_is_mandatory(self):
        # Roadmap 2.2: an unattributed parameter is an invented one.
        with pytest.raises(ValueError, match="parameter_provenance"):
            self.make(parameter_provenance=())

    def test_cannot_be_evidence(self):
        with pytest.raises(ValueError, match="as_evidence"):
            self.make(as_evidence=True)

    def test_cannot_claim_observation_status(self):
        with pytest.raises(ValueError, match="epistemic_status"):
            self.make(epistemic_status="observation")

    def test_entropy_and_map_are_measured(self):
        posterior = self.make(distribution=(("True", 0.5), ("False", 0.5)))
        assert posterior.entropy == pytest.approx(1.0)
        assert self.make().most_probable == "True"
        assert self.make().entropy < 1.0

    def test_default_epistemic_status_is_inference(self):
        assert self.make().epistemic_status == EPISTEMIC_INFERENCE

    def test_to_dict_carries_derived_fields(self):
        payload = self.make().to_dict()
        assert payload["most_probable"] == "True"
        assert "entropy_bits" in payload
