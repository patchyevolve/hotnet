"""Tests for Bayesian inference (ML_ENGINE.md Roadmap 2).

Two independent checks of correctness:

* **Analytic** — posteriors asserted against closed-form arithmetic from
  :func:`src.ml.fixtures.analytic_sprinkler_posteriors`, so a bug in variable
  elimination cannot agree with itself and pass.
* **Monte Carlo** — exact inference cross-checked against ancestral sampling,
  two algorithms that share no code path.

Plus the admission rules: a CPT without provenance, an unnormalized row, a
cyclic structure or an unmodelled node must all be refused at construction.
"""

import pytest

from src.ml.bayes import (
    SENSITIVITY_EPSILON,
    BayesianNetwork,
    CPT,
    parameter_sensitivity,
    validate_against_sampling,
)
from src.ml.fixtures import (
    analytic_sprinkler_posteriors,
    sprinkler_network,
)

TOL = 1e-12


class TestAnalyticAgreement:
    def test_prior_rain_matches_arithmetic(self):
        network = sprinkler_network()
        expected = analytic_sprinkler_posteriors()["prior_rain_true"]
        assert network.prior("Rain")["True"] == pytest.approx(expected, abs=TOL)

    def test_posterior_given_evidence_matches_arithmetic(self):
        network = sprinkler_network()
        expected = analytic_sprinkler_posteriors()[
            "posterior_rain_true_given_wet"
        ]
        posterior = network.posterior("Rain", {"Wet": "True"})
        assert posterior["True"] == pytest.approx(expected, abs=TOL)

    def test_evidence_actually_moves_the_posterior(self):
        # Regression guard for a bug where evidence was ignored and the
        # posterior silently returned the prior.
        network = sprinkler_network()
        prior = network.prior("Rain")["True"]
        posterior = network.posterior("Rain", {"Wet": "True"})["True"]
        assert posterior != pytest.approx(prior, abs=1e-9)
        assert posterior > prior

    def test_evidence_upstream_of_query_also_propagates(self):
        network = sprinkler_network()
        # Cloudy is a parent of Rain; conditioning on it must move Rain.
        with_cloudy = network.posterior("Rain", {"Cloudy": "True"})["True"]
        without = network.prior("Rain")["True"]
        assert with_cloudy != pytest.approx(without, abs=1e-9)

    def test_all_posteriors_sum_to_one(self):
        network = sprinkler_network()
        for query in network.variables:
            for evidence in ({}, {"Wet": "True"}, {"Cloudy": "False"}):
                if query in evidence:
                    continue
                posterior = network.posterior(query, evidence)
                assert sum(posterior.values()) == pytest.approx(1.0, abs=TOL)
                assert all(p >= 0.0 for p in posterior.values())

    def test_d_separation_blocks_the_path_through_the_common_node(self):
        # Cloudy -> Rain -> Sprinkler: given Rain (a non-collider on that
        # path) Cloudy and Sprinkler are d-separated, so adding Sprinkler to
        # the evidence must not move P(Cloudy).
        network = sprinkler_network()
        given_rain = network.posterior("Cloudy", {"Rain": "True"})
        given_rain_and_sprinkler = network.posterior(
            "Cloudy", {"Rain": "True", "Sprinkler": "True"}
        )
        for state in given_rain:
            assert given_rain_and_sprinkler[state] == pytest.approx(
                given_rain[state], abs=1e-9
            )
        # ...and observing Rain itself must move Cloudy, which proves the
        # equality above is a real conditional independence, not a bug that
        # ignores evidence entirely.
        prior = network.prior("Cloudy")["True"]
        assert given_rain["True"] != pytest.approx(prior, abs=1e-9)


class TestSamplingCrossCheck:
    def test_exact_and_monte_carlo_agree(self):
        network = sprinkler_network()
        report = validate_against_sampling(
            network, "Rain", evidence={"Wet": "True"}, draws=40000, seed=7
        )
        assert report["total_variation_distance"] <= report["tolerance"]
        assert report["passed"] is True
        assert report["acceptance_rate"] == pytest.approx(0.60, abs=0.05)

    def test_sampled_distribution_normalizes(self):
        network = sprinkler_network()
        sampled, accepted, rate = network.sample_posterior(
            "Rain", evidence={"Wet": "True"}, draws=5000, seed=3
        )
        assert accepted > 0
        assert sum(sampled.values()) == pytest.approx(1.0, abs=1e-9)
        assert 0.0 <= rate <= 1.0

    def test_report_carries_provenance_and_assumptions(self):
        report = validate_against_sampling(sprinkler_network(), "Rain", draws=1000)
        assert report["parameter_provenance"]
        assert report["assumptions"]
        assert report["model_version"]


class TestAdmissionRules:
    def test_cpt_requires_provenance(self):
        with pytest.raises(ValueError, match="provenance is required"):
            CPT("A", (), ("T", "F"), (((), (0.5, 0.5)),), provenance="   ")

    def test_rows_must_sum_to_one(self):
        with pytest.raises(ValueError, match="sums to"):
            CPT(
                "A", (), ("T", "F"), (((), (0.5, 0.6)),), provenance="fixture"
            )

    def test_probability_out_of_range_rejected(self):
        with pytest.raises(ValueError, match=r"\[0, 1\]"):
            CPT("A", (), ("T", "F"), (((), (1.5, -0.5)),), provenance="fixture")

    def test_root_needs_exactly_one_row(self):
        with pytest.raises(ValueError, match="exactly one row"):
            CPT(
                "A",
                (),
                ("T", "F"),
                (((), (0.5, 0.5)), ((), (0.5, 0.5))),
                provenance="fixture",
            )

    def test_incomplete_parent_rows_rejected_at_bind(self):
        partial = CPT(
            "B",
            ("A",),
            ("T", "F"),
            ((("T",), (0.5, 0.5)),),
            provenance="fixture",
        )
        with pytest.raises(ValueError, match="cover every parent assignment"):
            partial.bind({"A": ("T", "F"), "B": ("T", "F")})

    def test_cycle_rejected(self):
        nodes = {"A": ("T",), "B": ("T",)}
        cpts = [
            CPT("A", ("B",), ("T",), ((("T",), (1.0,)),), provenance="fixture"),
            CPT("B", ("A",), ("T",), ((("T",), (1.0,)),), provenance="fixture"),
        ]
        with pytest.raises(ValueError, match="cyclic"):
            BayesianNetwork(
                nodes, cpts, name="cyclic", model_version="1",
                assumptions=["fixture"],
            )

    def test_node_without_cpt_rejected(self):
        with pytest.raises(ValueError, match="without a CPT"):
            BayesianNetwork(
                {"A": ("T",), "B": ("T",)},
                [CPT("A", (), ("T",), (((), (1.0,)),), provenance="fixture")],
                name="missing", model_version="1", assumptions=["fixture"],
            )

    def test_unknown_evidence_state_rejected(self):
        with pytest.raises(ValueError, match="legal state"):
            sprinkler_network().posterior("Rain", {"Wet": "Maybe"})

    def test_query_also_in_evidence_rejected(self):
        with pytest.raises(ValueError, match="also appears in evidence"):
            sprinkler_network().posterior("Rain", {"Rain": "True"})

    def test_unknown_query_rejected(self):
        with pytest.raises(ValueError, match="not a node"):
            sprinkler_network().posterior("Fog")

    def test_assumptions_mandatory(self):
        with pytest.raises(ValueError, match="assumptions"):
            BayesianNetwork(
                {"A": ("T",)},
                [CPT("A", (), ("T",), (((), (1.0,)),), provenance="fixture")],
                name="x", model_version="1", assumptions=[],
            )

    def test_model_version_mandatory(self):
        with pytest.raises(ValueError, match="model_version"):
            BayesianNetwork(
                {"A": ("T",)},
                [CPT("A", (), ("T",), (((), (1.0,)),), provenance="fixture")],
                name="x", model_version="", assumptions=["a"],
            )


class TestSensitivity:
    def test_reported_per_parameter_and_sorted_descending(self):
        results = parameter_sensitivity(
            sprinkler_network(), "Rain", evidence={"Wet": "True"}
        )
        variables = [entry["variable"] for entry in results]
        assert set(variables) == {"Cloudy", "Rain", "Sprinkler", "Wet"}
        values = [entry["max_total_variation"] for entry in results]
        assert values == sorted(values, reverse=True)

    def test_distances_are_non_negative_and_bounded(self):
        for entry in parameter_sensitivity(
            sprinkler_network(), "Rain", evidence={"Wet": "True"}
        ):
            assert 0.0 <= entry["max_total_variation"] <= 1.0
            assert entry["epsilon"] == SENSITIVITY_EPSILON
            assert entry["provenance"]

    def test_sensitivity_is_a_measurement_not_a_band(self):
        results = parameter_sensitivity(
            sprinkler_network(), "Rain", evidence={"Wet": "True"}
        )
        assert all(isinstance(entry["max_total_variation"], float) for entry in results)
