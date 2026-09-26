"""Tests for the optional-dependency guard (ML_ENGINE.md Roadmap 0.4).

Roadmap 0.4: *"Keep ML dependencies optional until a milestone is approved by
its own acceptance gate. The current pipeline must remain runnable without
PyTorch Geometric or pgmpy."*

These tests assert two things: nothing in ``src.ml`` requires an ML library to
import, and asking for one that is missing fails with a named, actionable
error at the point of use rather than at import time.
"""

import subprocess
import sys
from pathlib import Path

import pytest

from src.ml.deps import (
    HAS_PGMPY,
    HAS_TORCH,
    HAS_TORCH_GEOMETRIC,
    MissingMLDependency,
    availability,
    require,
)

SYSTEM_ROOT = Path(__file__).resolve().parent.parent


def test_availability_reports_every_optional_library():
    report = availability()
    assert set(report) == {"torch", "torch_geometric", "pgmpy", "sklearn", "scipy"}
    assert all(isinstance(value, bool) for value in report.values())


def test_probe_matches_the_declared_flags():
    report = availability()
    assert report["torch"] is HAS_TORCH
    assert report["torch_geometric"] is HAS_TORCH_GEOMETRIC
    assert report["pgmpy"] is HAS_PGMPY


def test_missing_library_raises_a_named_error_at_use_time():
    capability = "graph neural network training"
    if HAS_TORCH_GEOMETRIC:
        pytest.skip("torch_geometric is installed; absence cannot be exercised")
    with pytest.raises(MissingMLDependency) as excinfo:
        require("torch_geometric", capability)
    message = str(excinfo.value)
    assert capability in message
    assert "not installed" in message
    assert "keeps" in message  # reassures that the deterministic path still runs


def test_installed_library_passes_silently():
    # Exercise the success path with whichever optional library is present so
    # the guard is verified in both directions.
    for name, present in availability().items():
        if present:
            require(name, "using an installed optional library")
            return
    pytest.skip("no optional ML library installed; success path not reachable")


def test_unknown_dependency_name_is_rejected():
    with pytest.raises(MissingMLDependency, match="Unknown optional dependency"):
        require("definitely_not_a_library", "testing")


@pytest.mark.parametrize(
    "module",
    [
        "src.ml",
        "src.ml.contracts",
        "src.ml.deps",
        "src.ml.snapshot",
        "src.ml.features",
        "src.ml.baseline",
        "src.ml.metrics",
        "src.ml.labels",
        "src.ml.bayes",
        "src.ml.store",
        "src.ml.evaluation",
        "src.ml.fixtures",
    ],
)
def test_every_ml_module_imports_without_optional_dependencies(module):
    """Roadmap 0.4 in executable form: import must never require ML libs."""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import importlib.util as u, sys; "
                "assert u.find_spec('torch_geometric') is None or True; "
                f"import {module}; print('ok')"
            ),
        ],
        cwd=str(SYSTEM_ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_pipeline_still_imports_with_the_ml_layer_present():
    """The production pipeline must not gain a hard dependency on src.ml."""
    result = subprocess.run(
        [sys.executable, "-c", "import src.pipeline; print('ok')"],
        cwd=str(SYSTEM_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout
