"""Regression tests for Stage 6 output integrity.

Covers two root-caused defects:
1. adversarial_scores.json exported entries for edges removed by
   dedup/thresholding after scoring (dangling edge_id references).
2. coverage_gap anomaly signals hardcoding entity_type="unknown"
   instead of the node's real type.
"""

import json
from pathlib import Path

import networkx as nx
import pytest

from src.analytics.anomalies import compute_anomaly_signals


# ── Fix 2: coverage_gap must report the node's real type ──────────────

def _graph_with_event(node_id="RES_evt1"):
    G = nx.Graph()
    G.add_node(node_id, node_type="event", effective_confidence=0.9,
               provenance_chain=["f1", "f2"])
    return G


def test_coverage_gap_signal_uses_node_type():
    G = _graph_with_event()
    signals = compute_anomaly_signals(
        G=G,
        centrality_scores=[],
        temporal_infos=[],
        contradictions={},
        temporal_contradictions=[],
        coverage_intervals=[
            {"entity_id": "RES_evt1", "coverage_ratio": 0.0, "status": "sparse"},
        ],
        adversarial_scores=[],
        run_id="test",
    )
    gaps = [s for s in signals if s.signal_type == "coverage_gap"]
    assert gaps, "expected a coverage_gap signal"
    assert all(s.entity_type == "event" for s in gaps), (
        f"coverage_gap must carry the node's real type, got "
        f"{[s.entity_type for s in gaps]}"
    )


def test_coverage_gap_unknown_only_for_missing_nodes():
    G = _graph_with_event()
    signals = compute_anomaly_signals(
        G=G, centrality_scores=[], temporal_infos=[], contradictions={},
        temporal_contradictions=[],
        coverage_intervals=[
            {"entity_id": "RES_missing", "coverage_ratio": 0.1, "status": "sparse"},
        ],
        adversarial_scores=[], run_id="test",
    )
    gaps = [s for s in signals if s.signal_type == "coverage_gap"]
    assert gaps and all(s.entity_type == "unknown" for s in gaps)


# ── Fix 1: adversarial scores must reference only live edges ──────────

def test_adversarial_scores_reference_live_edges():
    """Integration invariant against pipeline output (skipped if absent)."""
    out = Path(__file__).resolve().parent.parent / "output_geo"
    scores_f = out / "adversarial_scores.json"
    edges_f = out / "graph_edges.json"
    if not scores_f.exists() or not edges_f.exists():
        pytest.skip("output_geo not present — run pipeline first")

    scores = json.loads(scores_f.read_text(encoding="utf-8"))
    edges = json.loads(edges_f.read_text(encoding="utf-8"))
    edge_ids = {e["id"] for e in edges}
    dangling = sorted(
        {s["edge_id"] for s in scores
         if isinstance(s, dict) and s.get("edge_id") not in edge_ids}
    )
    assert not dangling, (
        f"adversarial_scores.json references edges missing from "
        f"graph_edges.json: {dangling}"
    )


def test_flagged_adversarial_edges_exist():
    """The flagged (suspicious) subset must be joinable to the graph —
    anomaly detection and analytics consume it by edge_id."""
    out = Path(__file__).resolve().parent.parent / "output_geo"
    scores_f = out / "adversarial_scores.json"
    edges_f = out / "graph_edges.json"
    if not scores_f.exists() or not edges_f.exists():
        pytest.skip("output_geo not present — run pipeline first")

    scores = json.loads(scores_f.read_text(encoding="utf-8"))
    edge_ids = {e["id"] for e in json.loads(edges_f.read_text(encoding="utf-8"))}
    flagged = [s for s in scores if isinstance(s, dict) and s.get("is_suspicious")]
    dangling = [s["edge_id"] for s in flagged if s["edge_id"] not in edge_ids]
    assert not dangling, f"flagged adversarial edges missing from graph: {dangling}"
