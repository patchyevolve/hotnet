"""Tests for the shadow-mode artifact store (R1.5, R2.4).

R1.5: *"Do not inject them into evidence edges or Stage 7 factors
automatically."* R2.4: *"store posterior output separately... It cannot
override Stage 7, Stage 8, or observed evidence."*

The guard is tested adversarially — including path-traversal attempts —
because "we only ever write to our own directory" is exactly the kind of
invariant that quietly stops holding after a refactor.
"""

import json

import pytest

from src.ml.store import (
    ARTIFACTS,
    assert_is_ml_artifact,
    ml_directory,
    read_artifact,
    write_artifact,
)


class TestPathGuard:
    def test_inside_ml_directory_is_allowed(self, tmp_path):
        target = tmp_path / "ml" / "label_inventory.json"
        assert assert_is_ml_artifact(target) == target.resolve()

    def test_outside_ml_directory_is_refused(self, tmp_path):
        with pytest.raises(PermissionError, match="outside the ML artifact"):
            assert_is_ml_artifact(tmp_path / "hypotheses.json")

    def test_path_traversal_cannot_escape_the_ml_directory(self, tmp_path):
        # Normalisation happens before the check, so string-level tricks do
        # not get past it.
        with pytest.raises(PermissionError):
            assert_is_ml_artifact(tmp_path / "ml" / ".." / "hypotheses.json")

    def test_stage_owned_stores_are_refused_even_inside_ml(self, tmp_path):
        with pytest.raises(PermissionError, match="stage-owned store"):
            assert_is_ml_artifact(tmp_path / "ml" / "hypotheses.json")

    @pytest.mark.parametrize("name", ["contradictions.json", "evidence_gaps.json",
                                      "audit_trail.json", "critic_review.json"])
    def test_every_known_stage_store_is_refused(self, tmp_path, name):
        with pytest.raises(PermissionError):
            assert_is_ml_artifact(tmp_path / "ml" / name)


class TestArtifacts:
    def test_only_declared_artifacts_can_be_written(self, tmp_path):
        with pytest.raises(ValueError, match="unknown ML artifact"):
            write_artifact(tmp_path, "invented.json", {})

    def test_write_and_read_round_trip(self, tmp_path):
        payload = {"a": 1, "b": [1, 2, 3]}
        path = write_artifact(tmp_path, "label_inventory.json", payload)
        assert path.parent == ml_directory(tmp_path)
        assert path.name in ARTIFACTS
        assert read_artifact(tmp_path, "label_inventory.json") == payload

    def test_written_files_sit_under_the_ml_directory(self, tmp_path):
        write_artifact(tmp_path, "ml_predictions.json", [])
        assert ml_directory(tmp_path).exists()
        assert set(p.name for p in ml_directory(tmp_path).iterdir()) <= set(ARTIFACTS)

    def test_bn_posteriors_is_declared_but_written_only_on_demand(self, tmp_path):
        # Declaring the artifact is not the same as producing it. No domain
        # BN exists, so a test that force-wrote one would be manufacturing
        # the very artifact Roadmap 2 forbids.
        assert "bn_posteriors.json" in ARTIFACTS
        assert not (ml_directory(tmp_path) / "bn_posteriors.json").exists()

    def test_read_rejects_unknown_artifact(self, tmp_path):
        with pytest.raises(ValueError, match="unknown ML artifact"):
            read_artifact(tmp_path, "invented.json")

    def test_written_json_is_valid_and_indented(self, tmp_path):
        path = write_artifact(tmp_path, "baseline_evaluation.json", {"x": 1})
        text = path.read_text()
        assert json.loads(text) == {"x": 1}
        assert "\n  " in text
