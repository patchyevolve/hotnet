# STAGE 6: ANALYTICS ENGINE — Architecture & Implementation

## Overview
Stage 6 computes derived analytics over the evidence graph produced by Stage 5. It reads all pipeline output files, builds a NetworkX graph, and computes centrality, communities, anomaly signals, behavioral baselines, correlations, component analyses, and temporal patterns.

**Key properties:**
- Read-only on graph — does NOT modify `graph_nodes.json` or `graph_edges.json`
- All algorithms use `networkx` (3.6.1) and `numpy` (2.4.4) — no scipy/sklearn required
- Honest data quality notes documenting what the sparse data actually supports
- PageRank falls back to degree-based approximation when scipy is unavailable
- Processing time: ~0.05s on current data (179 nodes, 86 edges)

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

**Note:** Analytics are computed on the **local graph scoped to a `case_id`**. All outputs (centrality, communities, anomalies, etc.) are specific to the case being analyzed.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 6: ANALYTICS ENGINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INPUTS (from Stage 5 output):                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐          │
│  │graph_nodes   │ │graph_edges   │ │graph_stats   │ │multiplex │          │
│  │   (179)      │ │   (86)       │ │  (10 fields) │ │  (7)     │          │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────┬─────┘          │
│         └────────────────┼────────────────┼───────────────┘                │
│                          │                │                                 │
│  ┌──────────────┐ ┌──────┴───────┐ ┌──────┴───────┐                       │
│  │temporal_infos│ │spatial_infos │ │coverage_ints │                       │
│  │   (379)      │ │   (24)       │ │   (22)       │                       │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘                       │
│         └────────────────┼────────────────┘                                │
│                          │                                                  │
│                          ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  BUILD NetworkX GRAPH (179 nodes, 86 edges)                         │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│         ┌───────────┬───────────┼───────────┬───────────┬──────────┐       │
│         ▼           ▼           ▼           ▼           ▼          ▼       │
│  ┌────────────┐┌─────────┐┌──────────┐┌──────────┐┌────────┐┌─────────┐  │
│  │Centrality  ││Commun-  ││Anomaly   ││Behavioral││Correl- ││Temporal │  │
│  │Scores      ││ities    ││Signals   ││Baselines ││ations  ││Patterns │  │
│  │(179)       ││(12)     ││(54)      ││(9)       ││(5)     ││(11)     │  │
│  └─────┬──────┘└────┬────┘└────┬─────┘└────┬─────┘└───┬────┘└────┬────┘  │
│        └────────────┼──────────┼───────────┼──────────┼──────────┘        │
│                     ▼          ▼           ▼          ▼                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Component Analysis (135) + Data Quality Notes (3)                  │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  OUTPUTS:                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐          │
│  │analytics_out │ │centrality_s  │ │communities   │ │anomalies │          │
│  │  (1 dict)    │ │  (179)       │ │  (12)        │ │  (54)    │          │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐          │
│  │baselines     │ │correlations  │ │components    │ │temporal  │          │
│  │  (9)         │ │  (5)         │ │  (135)       │ │  (11)    │          │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Directory Structure

```
src/analytics/
├── __init__.py              # Exports AnalyticsEngine
├── models.py                # Output data models (8 types)
├── graph_utils.py           # NetworkX graph builder from JSON
├── centrality.py            # Centrality metrics (5 algorithms)
├── communities.py           # Community detection (greedy modularity)
├── anomalies.py             # Anomaly signal detection (6 types)
├── baselines.py             # Behavioral baseline computation
├── correlation.py           # Correlation computation (3 methods)
├── components.py            # Connected component analysis
├── temporal_patterns.py     # Temporal pattern detection (3 types)
└── engine.py                # Orchestrator
```

### Pipeline Integration

Stage 6 is added as Step 7/7 in `pipeline.py`:

```
Step 1/7: Ingestion (Stage 1)
Step 2/7: Extraction (Stage 2)
Step 3/7: Export results
Step 3.5/7: Resolve dangling references
Step 4/7: Entity resolution (Stage 3)
Step 5/7: Temporal enrichment (Stage 4)
Step 6/7: Graph build (Stage 5)
Step 7/7: Analytics (Stage 6)    ← NEW
```

### Key Functions (all take `case_id`)
- `AnalyticsEngine.analyze(case_id)` — Run full analytics pipeline on the local graph for a case
- `compute_centrality(case_id, graph)` — Compute 5 centrality metrics per node
- `detect_communities(case_id, graph)` — Greedy modularity community detection
- `detect_anomalies(case_id, graph, temporal, spatial)` — 6 anomaly signal types
- `compute_baselines(case_id, graph)` — Behavioral baselines per entity type
- `compute_correlations(case_id, graph)` — Statistical relationships between graph properties
- `analyze_components(case_id, graph)` — Connected component analysis
- `detect_temporal_patterns(case_id, temporal_infos)` — 3 temporal pattern types

---

## Input Contract

All inputs are read from `output/` directory (JSON files produced by Stages 1-5):

| File | Format | Source Stage | Count |
|------|--------|-------------|-------|
| `graph_nodes.json` | `List[dict]` | Stage 5 | 179 |
| `graph_edges.json` | `List[dict]` | Stage 5 | 86 |
| `graph_statistics.json` | `dict` | Stage 5 | 10 fields |
| `temporal_infos.json` | `List[dict]` | Stage 4 | 379 |
| `spatial_infos.json` | `List[dict]` | Stage 4 | 24 |
| `coverage_intervals.json` | `List[dict]` | Stage 4 | 22 |
| `contradictions.json` | `dict` | Stage 3 | 15 |
| `temporal_contradictions.json` | `List[dict]` | Stage 4 | 22 |
| `adversarial_scores.json` | `List[dict]` | Stage 5 | 75 |

### Graph Node Schema (from `graph_nodes.json`)

```json
{
  "id": "RES_xxx",
  "node_type": "person|phone|account|...",
  "name": "string",
  "effective_confidence": 0.85,
  "epistemic_status": "observation|inference",
  "derivation_depth": 0,
  "provenance_chain": ["EVD_xxx", ...],
  "resolution_status": "RESOLVED|STANDALONE"
}
```

### Graph Edge Schema (from `graph_edges.json`)

```json
{
  "id": "EDG_xxx",
  "source_id": "RES_xxx",
  "target_id": "RES_yyy",
  "relationship_type": "CALLED|VISITED|...",
  "edge_type": "associational|entrepreneurial|...",
  "confidence": {"score": 0.85, "basis": [...], ...},
  "adversarial_score": 0.0,
  "epistemic_status": "observation"
}
```

---

## Output Contract

### Output Files (written to `output/`)

| File | Format | Count | Description |
|------|--------|-------|-------------|
| `analytics_output.json` | `dict` | 1 | Full AnalyticsOutput serialized |
| `centrality_scores.json` | `List[dict]` | 179 | One per node |
| `community_assignments.json` | `List[dict]` | 12 | Communities of size >= 2 |
| `anomaly_signals.json` | `List[dict]` | 54 | Detected anomalies |
| `behavioral_baselines.json` | `List[dict]` | 9 | One per entity type |
| `correlations.json` | `List[dict]` | 5 | Computed correlations |
| `component_analysis.json` | `List[dict]` | 135 | One per connected component |
| `temporal_patterns.json` | `List[dict]` | 11 | Detected temporal patterns |
| `analytics_summary.json` | `dict` | 1 | Summary with counts + quality notes |

### Output Data Models

#### CentralityScore

```python
@dataclass
class CentralityScore:
    node_id: str
    node_type: str
    name: str
    degree_centrality: float       # normalized degree
    betweenness_centrality: float  # fraction of shortest paths through node
    closeness_centrality: float    # inverse average distance to all nodes
    eigenvector_centrality: float  # importance based on neighbor importance
    pagerank: float                # PageRank score
    degree: int                    # raw degree
    run_id: str
```

#### Community

```python
@dataclass
class Community:
    community_id: str              # "COMM_000"
    node_ids: List[str]
    size: int
    modularity_contribution: float
    internal_edge_count: int
    density: float                 # internal edges / max possible edges
    dominant_node_type: str
    run_id: str
```

#### AnomalySignal

```python
@dataclass
class AnomalySignal:
    signal_id: str
    signal_type: str   # degree_outlier|confidence_gap|contradiction_cluster|
                       # isolated_high_value|coverage_gap|temporal_burst
    severity: str      # low|medium|high
    entity_id: str
    entity_type: str
    description: str
    evidence_count: int
    score: float       # 0.0-1.0, higher = more anomalous
    run_id: str
```

#### BehavioralBaseline

```python
@dataclass
class BehavioralBaseline:
    entity_type: str
    sample_size: int
    avg_degree: float
    median_degree: float
    std_degree: float
    avg_confidence: float
    median_confidence: float
    avg_temporal_count: float
    avg_spatial_count: float
    avg_edge_confidence: float
    avg_provenance_depth: float
    temporal_coverage_fraction: float
    spatial_coverage_fraction: float
    dominant_relationship_type: str
    run_id: str
```

#### Correlation

```python
@dataclass
class Correlation:
    variable_a: str
    variable_b: str
    correlation_type: str   # rank|point_biserial|cramers_v
    coefficient: float
    p_value: float
    is_significant: bool    # p < 0.05
    sample_size: int
    run_id: str
```

#### ComponentAnalysis

```python
@dataclass
class ComponentAnalysis:
    component_id: int
    size: int
    edge_count: int
    density: float
    node_types: Dict[str, int]
    has_person: bool
    has_financial: bool
    has_communication: bool
    has_temporal_data: bool
    has_spatial_data: bool
    is_candidate_for_investigation: bool
    avg_confidence: float
    path_length: Optional[int]   # diameter, None if >50 nodes
    key_entities: List[str]      # top 3 by degree
    run_id: str
```

#### TemporalPattern

```python
@dataclass
class TemporalPattern:
    pattern_id: str
    pattern_type: str   # activity_burst|regularity|temporal_anomaly
    entity_id: str
    entity_type: str
    description: str
    event_count: int
    time_span_seconds: float
    severity: str
    run_id: str
```

---

## Algorithms

### 1. Centrality Computation (`centrality.py`)

**Purpose:** Identify the most important/influential nodes in the graph.

**Metrics computed:**

| Metric | Algorithm | Complexity | Fallback |
|--------|-----------|-----------|----------|
| Degree centrality | `degree / (N-1)` | O(V) | None needed |
| Betweenness centrality | Brandes' algorithm | O(V·E) | None needed |
| Closeness centrality | `1 / mean(shortest paths)` | O(V·E) per component | 0.0 for isolated nodes |
| Eigenvector centrality | Power iteration | O(V·E) per iteration | 0.0 if not converging |
| PageRank | Scipy-based | O(V·E) | Degree-based approx if scipy missing |

**Edge cases:**
- Disconnected graphs: closeness/eigenvector computed per connected component
- Eigenvector convergence failure: fallback to 0.0 for that component
- PageRank without scipy: `pagerank[n] = degree[n] / total_degree`
- Single-node components: all centralities = 0.0

**Output:** 179 CentralityScore records, sorted by degree_centrality descending.

---

### 2. Community Detection (`communities.py`)

**Purpose:** Find clusters of densely connected entities.

**Algorithm:** Greedy modularity optimization (`networkx.community.greedy_modularity_communities`)

**Parameters:**
- Resolution: 1.0 (default)
- Minimum community size: 2 (isolated nodes excluded)

**Fallback:** If modularity optimization fails, fall back to connected-component decomposition (each component with >= 2 nodes becomes a community).

**Complexity:** O(V·E) for greedy modularity. With V=179, E=86, this is sub-millisecond.

**Edge cases:**
- Graph with no edges: returns `[]`
- All nodes isolated: returns `[]`
- Single giant component: may return a single community (valid result)

**Output:** 12 communities (size >= 2), sorted by size descending.

---

### 3. Anomaly Signal Detection (`anomalies.py`)

**Purpose:** Find unusual patterns that may indicate criminal activity, evidence gaps, or data quality issues.

**Six anomaly types:**

#### 3.1 Degree Outlier
- **What:** Person node with degree > mean + 2·std
- **Why:** Hub nodes in criminal networks are key figures
- **Severity:** high if > 3σ, medium if > 2.5σ, low if > 2σ
- **Fallback:** Skip if fewer than 5 person nodes

#### 3.2 Confidence Gap
- **What:** Node with high confidence (> 0.8) but low degree (≤ 1)
- **Why:** Confident entity with few connections may have missing evidence
- **Severity:** medium
- **Fallback:** Always computable

#### 3.3 Contradiction Cluster
- **What:** Entity involved in ≥ 3 identity contradictions
- **Why:** High data conflict indicates unreliable or manipulated data
- **Severity:** high if ≥ 5, medium otherwise
- **Fallback:** Skip if no entity has ≥ 2 contradictions

#### 3.4 Isolated High-Value
- **What:** Isolated node (degree=0) with confidence > 0.7 and ≥ 2 sources
- **Why:** Strong evidence but no connections — key figure whose network hasn't been uncovered
- **Severity:** medium
- **Fallback:** Always computable

#### 3.5 Coverage Gap
- **What:** Coverage interval with ratio < 0.5 or status="sparse"
- **Why:** Sparse temporal data means we're missing activity
- **Severity:** high if ratio < 0.2, medium if < 0.5
- **Fallback:** Skip if all intervals have ratio >= 1.0

#### 3.6 Temporal Burst
- **What:** Entity with many events but few unique timestamps
- **Why:** Clustered activity may indicate planned operation
- **Severity:** medium
- **Fallback:** Skip if entity has < 3 temporal_infos

**Output:** 54 anomaly signals, sorted by score descending.

---

### 4. Behavioral Baselines (`baselines.py`)

**Purpose:** Establish "normal" behavior per entity type for Stage 7 to identify deviations.

**Algorithm:**
1. Group nodes by `node_type`
2. For each group, compute:
   - Degree statistics (mean, median, std)
   - Confidence statistics (mean, median)
   - Temporal/spatial event counts
   - Edge confidence for edges involving this type
   - Provenance depth
   - Temporal/spatial coverage fractions
   - Dominant relationship type

**Complexity:** O(V + E) — single pass through nodes and edges.

**Edge cases:**
- Entity types with 1 node: std = 0.0, median = that value
- Entity types with 0 edges: avg_edge_confidence = 0.0

**Output:** 9 behavioral baselines (one per entity type: person, location, date, device, organization, phone, amount, account, event).

---

### 5. Correlation Computation (`correlation.py`)

**Purpose:** Find statistical relationships between graph properties.

**Methods (no scipy required):**

| Method | Use Case | Implementation |
|--------|----------|---------------|
| Spearman rank | Ordinal vs ordinal | `rho = 1 - 6·Σd² / (n·(n²-1))` |
| Point-biserial | Binary vs continuous | `r = (M₁-M₀)/s · √(n₁·n₀/n²)` |
| Cramer's V | Categorical vs categorical | `V = √(χ² / (n·min(k-1,r-1)))` |

**Correlations computed:**
1. degree vs effective_confidence (rank)
2. degree vs temporal_count (rank)
3. degree vs provenance_depth (rank)
4. has_temporal_data vs effective_confidence (point-biserial)
5. entity_type vs has_temporal_data (cramer's v)

**Significance:** p < 0.05 (approximate using t-distribution approximation for rank, threshold for biserial/V).

**Fallback:** If fewer than 5 data points, return coefficient=0.0, p=1.0.

**Output:** 5 correlations.

---

### 6. Component Analysis (`components.py`)

**Purpose:** Analyze each connected component to identify investigation-relevant clusters.

**For each component, compute:**
- Size (node count), edge count, density
- Node type breakdown
- Investigation candidacy heuristic: `has_person AND (has_financial OR has_communication)`
- Average confidence
- Diameter (only for components with 2-50 nodes)
- Key entities (top 3 by degree)

**Complexity:** O(V + E) total. Diameter is O(V·(V+E)) per component but bounded to small components.

**Output:** 135 component analyses, sorted by size descending.

---

### 7. Temporal Pattern Detection (`temporal_patterns.py`)

**Purpose:** Find time-based patterns that may indicate coordinated activity.

**Three pattern types:**

#### 7.1 Activity Burst
- **What:** ≥ 3 events with inter-event time < 1 hour
- **Why:** Intense activity in short window may indicate planning/execution
- **Severity:** medium if ≥ 2 burst gaps, low otherwise

#### 7.2 Regularity
- **What:** ≥ 4 events with consistent inter-event spacing (CV < 0.3)
- **Why:** Regular patterns may indicate automated/scheduled activity
- **Severity:** low

#### 7.3 Temporal Anomaly
- **What:** Event timestamp > 2σ from entity's mean timestamp
- **Why:** Out-of-pattern events may indicate unusual activity
- **Severity:** medium if > 2.5σ, low otherwise

**Complexity:** O(N·log(N)) per entity for sorting. Total: O(T·log(T)) where T = total temporal_infos.

**Output:** 11 temporal patterns, sorted by event_count descending.

---

### 8. Data Quality Notes (`engine.py`)

**Purpose:** Honest documentation of what the data supports and what it doesn't.

**Notes generated:**

1. **Sparsity warning** (if density < 0.01): "Graph is very sparse. Many algorithms produce trivial results for isolated nodes."
2. **Component fragmentation** (if components > 50% of nodes): "Most nodes are isolated. Graph algorithms limited to N components of size >= 2."
3. **Spatial data gap** (if spatial records exist but all null lat/lng): "Geospatial analysis is not possible."
4. **Temporal coverage** (if temporal_infos < num_nodes): "Temporal coverage is uneven."
5. **No communities** (if communities list empty): "No multi-node communities detected."

---

## Processing Time

Measured on current data (179 nodes, 86 edges, 379 temporal_infos):

| Operation | Time |
|-----------|------|
| Build NetworkX graph | ~0.01s |
| Centrality (all 5 metrics) | ~0.02s |
| Community detection | ~0.005s |
| Anomaly signals (6 types) | ~0.005s |
| Behavioral baselines | ~0.003s |
| Correlations | ~0.005s |
| Component analysis | ~0.005s |
| Temporal patterns | ~0.005s |
| Write output files | ~0.002s |
| **Total** | **~0.05s** |

---

## Dependencies

| Package | Version | Purpose | Required? |
|---------|---------|---------|-----------|
| `networkx` | 3.6.1 | Graph algorithms | Yes |
| `numpy` | 2.4.4 | Statistical computations | Yes |
| `json` | stdlib | File I/O | Yes |
| `dataclasses` | stdlib | Output models | Yes |
| `scipy` | — | NOT installed, NOT needed | No |
| `sklearn` | — | NOT installed, NOT needed | No |
| `pandas` | 3.0.5 | Available but not used | No |

**No new packages needed for `requirements.txt`.**

---

## What Stage 6 Does NOT Do

1. **Does not modify the graph.** Reads graph, computes derived properties, writes to separate files.
2. **Does not do spatial analysis.** No coordinates exist in the data (all null lat/lng).
3. **Does not do link prediction.** With 135 components and 86 edges, predicting missing links is speculation. Leave to Stage 9.
4. **Does not do temporal sequence mining.** With 26 timeline_events, not enough data for sequential pattern mining.
5. **Does not use LLM/AI.** Stage 6 is purely algorithmic. No AI calls.
6. **Does not do ML clustering.** No sklearn, no k-means, no DBSCAN. Community detection uses graph modularity, not feature-based clustering.

---

## Downstream Contract (What Stages 7-10 Need)

### Stage 7 (Hypothesis) needs:
- `AnomalySignal[]` — **provided.** 54 signals.
- `BehavioralBaseline[]` — **provided.** 9 baselines.
- `Community[]` — **provided.** 12 communities.
- `CentralityScore[]` — **provided.** 179 scores.
- `Correlation[]` — **provided.** 5 correlations.

### Stage 8 (Contradiction) needs:
- Reads from Stage 7 output. Stage 7 uses Stage 6's anomaly signals and temporal patterns to propose contradiction hypotheses.

### Stage 9 (Gap Detection) needs:
- `ComponentAnalysis[]` — **provided.** 135 analyses. Identifies under-investigated components.
- `AnomalySignal[]` — **provided.** Coverage gap signals.

### Stage 10 (Critic) needs:
- All outputs. Uses behavioral baselines to challenge investigator bias, correlations to question spurious links, component analyses to identify blind spots.
