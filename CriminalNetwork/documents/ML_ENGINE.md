# ML ENGINE — The Learning Layer

> The reasoning layer tells the system what to think. The ML engine tells it how to learn from data.

> **Implementation status (2026-09-26):** This document's roadmap prerequisites are now implemented; its model descriptions below remain a target design. The running pipeline has deterministic Stage 6 analytics, Stage 7 hypothesis factors, Stage 8 contradiction handling, Stage 9 rule-derived evidence gaps, and — in `src/ml/`, run offline via `python -m src.ml` — versioned provenance-carrying contracts, a label inventory, leakage-resistant structural features, a degree/common-neighbour baseline with AUPRC/calibration/coverage/subgroup reporting, and an exact Bayesian inference engine validated against a known distribution. It still does **not** run a GNN, a domain Bayesian Network, an information-gain model, or a temporal ML model. Do not present those capabilities as available.

## Implementation Roadmap

Build these capabilities only after their inputs, evaluation data, and output contracts are ready. Keep current deterministic outputs as explicit baselines. ML predictions remain hypotheses and must never become evidence or silently alter source records.

### Milestone status (2026-09-26)

Implemented in `src/ml/` (offline entry point `python -m src.ml --output <dir> --run-id <id>`; never imported by `run.py`):

| Roadmap step | Status | Where |
|---|---|---|
| 0.2 versioned, provenance-carrying contracts | **done** | `src/ml/contracts.py` — artifacts asserting `as_evidence=True`, `epistemic_status=observation`, missing provenance or an unnormalized posterior cannot be constructed |
| 0.3 / R1.1 label inventory | **done** | `src/ml/labels.py` |
| 0.4 optional ML dependencies | **done** | `src/ml/deps.py` — the layer imports and runs with `torch`, `torch_geometric`, `pgmpy`, `sklearn` and `scipy` all absent |
| R1.2 leakage-resistant feature dataset | **done** | `src/ml/snapshot.py`, `src/ml/features.py` — test edges are withheld *before* the snapshot exists |
| R1.3 baseline + AUPRC/calibration/coverage/subgroups/CI | **done** | `src/ml/baseline.py`, `src/ml/metrics.py` (pure Python; scikit-learn not installed) |
| R1.4 prototype one small GNN | **not started — gate not met** | see below |
| R2.1–2.2 domain hypothesis graph, reviewed priors/CPTs | **not started** | no subject-matter review has occurred |
| R2.3 inference validated on known distributions | **engine done, model pending** | `src/ml/bayes.py`, `src/ml/fixtures.py` |
| R2.4 shadow-mode storage | **done (infrastructure)** | `src/ml/store.py` — writes only inside `<output>/ml/` |
| R2.5 expected information gain | **not started** | correctly requires a validated posterior first |

**R1 gate result — a GNN is not justified yet.** On the demo corpus the inventory finds 121 observed positives, 47 with usable event time, and **3 known-absent negatives**. The time-aware split yields 15 test positives and 3 negatives; against that the common-neighbour baseline scores AUPRC 0.9537 with a bootstrap CI95 of **[0.6417, 1.0000]** against a no-skill reference of 0.8125, and AUC-ROC **0.4615**. The interval contains the no-skill rate, so the ranking cannot be distinguished from random, and each of the three negatives carries a third of the signal. The report therefore records `gate.acceptance = "not_capable"` and `roadmap_conclusion.gnn_justified = false`, and the baseline is retained. This is the roadmap working as written: R1.4 permits a neural model *"only if sufficient independent labels exist and the baseline leaves a material, reproducible gap"*, and neither condition is met. Negative labels are the binding constraint — unobserved pairs are deliberately never labelled negative (R1.1), so the only route to more negatives is more source scans recording absence, not sampling.

### 0. Make the design honest — prerequisite

1. Treat this document's model descriptions as target design; keep implemented behavior and planned behavior visibly separate in stage docs and diagrams.
2. Define versioned, provenance-carrying contracts for features, predictions, hypotheses, and uncertainty. Every prediction must identify its model/version, run, input snapshot, and supporting observed record IDs.
3. Establish a fixed, case-separated evaluation set and simple baselines before selecting libraries or training models. Split by case and time to prevent leakage; measure label coverage and class imbalance.
4. Keep ML dependencies optional until a milestone is approved by its own acceptance gate. The current pipeline must remain runnable without PyTorch Geometric or pgmpy.

**Exit gate:** docs accurately label implemented vs planned behavior; contracts and evaluation protocol are reviewed; no ML result can be mistaken for an observation.

### 1. GNN feasibility, then one narrow task

Do not start with the proposed four-layer, four-domain fusion GNN. The current corpus and verified Stage 6 work do not establish the labeled examples or scale needed to justify it. First select **link prediction** as the only candidate task, and compare it against a simple non-neural graph baseline on held-out cases. Community detection already has conventional graph methods; role classification and anomaly detection need defensible labels and should not be bundled into the first model.

1. Inventory candidate training labels, their provenance, coverage, and permissible use. Do not label an unobserved edge as a negative merely because it is absent. Use time-aware edge holdout and hard negatives only where absence is known.
2. Build a leakage-resistant feature dataset from a fixed graph snapshot. Exclude future data, outcome-derived fields, and features that encode the target edge. Preserve source reliability and derivation depth as metadata, not as truth labels.
3. Establish a degree/common-neighbor or similar baseline; report AUPRC, calibration, coverage, and performance by entity/source subgroup. Use case-level splits and confidence intervals. AUC alone is not an acceptance criterion.
4. Only if sufficient independent labels exist and the baseline leaves a material, reproducible gap, prototype one small GNN (e.g. GraphSAGE) in an offline evaluation path. Compare on the same splits. Evaluate calibration, subgroup error, and robustness to missing/noisy edges.
5. If it beats the baseline at a predeclared operational threshold without subgroup regressions, expose predictions in a separate, reviewable prediction artifact. Do not inject them into evidence edges or Stage 7 factors automatically. Otherwise retain the baseline or defer the model.

**Exit gate:** reproducible held-out improvement over baseline; calibrated uncertainty; documented subgroup and leakage checks; deterministic fallback; prediction artifact contains provenance and model version; no production pipeline behavior changes without a separate reviewed integration step.

### 2. Bayesian reasoning, only after the hypothesis model is stable

Stage 7 currently emits factors, not a calibrated posterior. A Bayesian Network cannot be responsibly added by turning those factors into probabilities or inventing priors/CPTs. Begin with the smallest explicit hypothesis graph and a domain-reviewed dependency model.

1. Define mutually exclusive/exhaustive hypotheses only where the domain supports that framing; otherwise use a model that represents overlapping hypotheses. Include an explicit unknown/other state where appropriate.
2. Specify priors, conditional probability tables, evidence dependence, missingness, source reliability, and contradiction treatment with subject-matter review. Record parameter provenance and uncertainty. Do not learn or tune parameters on evaluation cases.
3. Create synthetic unit cases with known distributions to validate inference and dependency handling, then evaluate calibration and sensitivity on appropriately labeled, held-out cases. Compare against the current factor-only output; do not call factors probabilities.
4. Initially run the BN in shadow mode: store posterior output separately, compare calibration and failure modes, and show its assumptions to reviewers. It cannot override Stage 7, Stage 8, or observed evidence.
5. Implement expected information gain only after the posterior and candidate evidence states are validated. Account for multiple possible outcomes, feasibility, and dependent evidence; keep raw information gain separate from action priority. Stage 9's current structural gap impacts are not information gain.

**Exit gate:** reviewed model structure and parameter sources; inference passes known-distribution tests; held-out calibration and sensitivity results meet predeclared criteria; output includes assumptions, uncertainty, and provenance; shadow review finds no unsupported certainty. Otherwise retain factor-only reasoning.

### 3. Integration order and ownership

Keep the user's stated build order: finish Stage 10 Critic, then Stage 12 Scoped Analytics. After their contracts stabilize, complete Roadmap 0 and data/label audits. Run GNN feasibility and Bayesian feasibility as separate research branches; neither depends on the other. Integrate a model only after its own exit gate, initially in shadow mode. Consider temporal ML or cross-layer fusion only after a demonstrated need and separately evaluated data support.

Stage ownership when implemented: a GNN prediction producer belongs with graph analytics (Stage 6 or a clearly named ML substage); Bayesian posterior inference belongs with hypothesis reasoning (Stage 7); expected information gain belongs downstream of validated posterior and candidate evidence requirements (Stage 9/10 boundary to be resolved in the contract). Until then these are **not implemented** and their stores must not be represented as populated.

### Explicitly deferred

The four-domain attention GNN, community detection by GNN, node-role classifier, graph autoencoder anomaly detector, continuous learning, and temporal GCRN are deferred. They require distinct labels, evaluation protocols, and operational justification. Do not treat the aspirational layer diagrams or sample output schemas below as implementation commitments.

---

## Target Stage → Model Mapping (Planned)

This is a proposed placement, not a description of current runtime behavior. See the implementation status and roadmap above.

```
Model 1: Evidence Model        → ML: Feature extraction (Stage 1-2)
Model 2: Provenance Model      → ML: Feature source tracking, derivation depth
Model 3: Coverage Model        → ML: Missing data handling, graceful degradation
Model 4: Entity State Model    → ML: GNN identity features, uncertainty propagation
Model 5: Hypothesis & Inv.     → ML: GNN link prediction, BN inference, temporal models

Stage 1-2 (Evidence Model):    Feature engineering — planned
Stage 3 (Entity State):        GNN identity support — deferred
Stage 4 (Provenance+Coverage): Temporal feature extraction — planned
Stage 5 (Graph Build):         Graph feature computation — planned
Stage 6 (Analytics):           GNN prediction producer — candidate, not implemented
Stage 7 (Hypothesis):          Bayesian inference — candidate, not implemented
Stage 8 (Contradiction):       Adversarial ML — deferred
Stage 9/10:                    Information gain — candidate after validated posterior
Stage 10 (Critic):             Read-only quality review — implemented subset; no ML conclusions
Stage 12 (Scoped Analytics):   Case-isolated totals/shared-link summary — implemented subset
```

---

## The One Rule Still Applies

```
THE ML ENGINE MAY:
├── Predict hidden relationships
├── Detect communities
├── Detect anomalies
├── Estimate uncertainty
├── Suggest which evidence to obtain next

THE ML ENGINE MUST NEVER:
├── Upgrade an inference into an observation
├── Treat its own predictions as ground truth
├── Use prediction confidence as evidence quality
├── Ignore uncertainty in its own outputs
└── Make legal conclusions from pattern scores
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 5                              │
│         ADVERSARIAL DEFENSE                             │
│    (outlier detection, source triangulation)            │
├─────────────────────────────────────────────────────────┤
│                    LAYER 4                              │
│         TEMPORAL MODELS                                 │
│    (graph evolution, anomaly detection over time)       │
├─────────────────────────────────────────────────────────┤
│                    LAYER 3                              │
│         BAYESIAN NETWORKS                               │
│    (evidence reasoning, belief propagation)             │
├─────────────────────────────────────────────────────────┤
│                    LAYER 2                              │
│         GRAPH NEURAL NETWORKS                           │
│    (link prediction, community detection)               │
├─────────────────────────────────────────────────────────┤
│                    LAYER 1                              │
│         FEATURE ENGINEERING                             │
│    (node features, edge features, graph features)       │
└─────────────────────────────────────────────────────────┘

READING DIRECTION: Layer 1 feeds up. Layer 5 reads all.
Each layer produces outputs with uncertainty attached.
```

---

## Layer 1: Feature Engineering

### Purpose
Convert raw graph data into features that ML models can consume. Every feature carries its own uncertainty.

### Node Features

```
NODE FEATURE VECTOR:
├── Demographics
│   ├── age (float, nullable)
│   ├── gender (enum, nullable)
│   ├── occupation (string, nullable)
│   └── criminal_history_count (int)
│
├── Communication
│   ├── total_calls_30d (int)
│   ├── unique_contacts_30d (int)
│   ├── call_frequency_deviation (float)  // vs individual baseline
│   ├── nighttime_call_ratio (float)
│   └── burst_detection (boolean)
│
├── Financial
│   ├── total_transactions_30d (int)
│   ├── avg_transaction_amount (float)
│   ├── large_transaction_count (int)
│   ├── cash_withdrawal_ratio (float)
│   └── cross_border_ratio (float)
│
├── Geographic
│   ├── unique_locations_30d (int)
│   ├── travel_radius_km (float)
│   ├── hotspot_proximity (float)
│   └── location_entropy (float)  // how spread out
│
├── Network Position
│   ├── degree_centrality (float)
│   ├── betweenness_centrality (float)
│   ├── closeness_centrality (float)
│   ├── eigenvector_centrality (float)
│   └── structural_role (enum: hub, broker, bridge, peripheral, isolated)
│
└── Uncertainty
    ├── feature_completeness (float)  // % of features available
    ├── feature_reliability (float)   // confidence in feature values
    └── feature_source (enum)         // where this feature came from
```

### Edge Features

```
EDGE FEATURE VECTOR:
├── Relationship Type
│   ├── type (enum: called, met_at, owns, transferred_to, ...)
│   ├── function (enum: entrepreneurial, associational, quasi_gov, upperworld)
│   └── semantic_specificity (float)  // how specific vs generic
│
├── Frequency
│   ├── interaction_count (int)
│   ├── interaction_frequency (float)  // per time unit
│   ├── frequency_deviation (float)   // vs baseline
│   └── burst_pattern (boolean)
│
├── Temporal
│   ├── first_seen (datetime)
│   ├── last_seen (datetime)
│   ├── duration_days (int)
│   ├── time_of_day_distribution (vector)
│   └── day_of_week_distribution (vector)
│
├── Strength
│   ├── multiplexity (int)  // how many relationship types
│   ├── reciprocity (float)  // is it mutual?
│   ├── persistence (float)  // how long has it lasted
│   └── decay_rate (float)   // how fast it's fading
│
├── Anomaly
│   ├── anomaly_score (float)
│   ├── anomaly_type (enum: frequency, timing, location, amount)
│   └── baseline_comparison (float)
│
└── Uncertainty
    ├── edge_confidence (float)
    ├── source_reliability (float)
    ├── derivation_depth (int)  // how many steps from original observation
    └── temporal_precision (enum: exact, approximate, unknown)
```

### Graph-Level Features

```
GRAPH FEATURE VECTOR:
├── Global
│   ├── node_count (int)
│   ├── edge_count (int)
│   ├── density (float)
│   ├── avg_degree (float)
│   ├── avg_clustering_coefficient (float)
│   └── avg_path_length (float)
│
├── Community Structure
│   ├── num_communities (int)
│   ├── modularity (float)
│   ├── community_size_distribution (vector)
│   └── cross_community_edges (int)
│
├── Temporal
│   ├── growth_rate (float)  // nodes added per time unit
│   ├── churn_rate (float)   // edges added/removed per time unit
│   ├── stability_score (float)
│   └── last_major_change (datetime)
│
└── Anomaly
    ├── global_anomaly_score (float)
    ├── sudden_growth (boolean)
    ├── community_fragmentation (boolean)
    └── unusual_density_patterns (boolean)
```

### Feature Uncertainty Propagation

```
RULE: Every feature carries uncertainty metadata.

FeatureValue {
  value:          float
  confidence:     float    // 0-1
  source:         enum     // observed, inferred, default
  precision:      enum     // exact, approximate, unknown
  staleness:      enum     // current, recent, old, very_old
}

RULE: When features are combined, uncertainties multiply.
      When features are averaged, uncertainties are averaged.
      When features are missing, use priors with low confidence.
```

---

## Layer 2: Graph Neural Networks

### Purpose
Learn structural patterns in the criminal network. Predict hidden relationships, detect communities, classify nodes.

### Architecture: Multilayer GNN

```
LAYER 1: Communication Network
├── Nodes: People, Phones
├── Edges: called, messaged, video_call
├── Features: call frequency, duration, timing
└── GNN: GCN (Graph Convolutional Network)

LAYER 2: Financial Network
├── Nodes: People, Accounts, Transactions
├── Edges: transferred_to, received_from, deposited, withdrew
├── Features: amount, frequency, timing, counterparty
└── GNN: GCN

LAYER 3: Social Network
├── Nodes: People, Locations, Organizations
├── Edges: family_of, friend_of, member_of, lives_at, works_at
├── Features: relationship strength, duration, multiplexity
└── GNN: GCN

LAYER 4: Co-offending Network
├── Nodes: People, Events (crimes)
├── Edges: co_offended, witnessed, planned
├── Features: crime type, timing, location, role
└── GNN: GCN

FUSION LAYER:
├── Input: 4 GCN outputs (one per layer)
├── Method: Cross-layer attention mechanism
├── Output: Unified node/edge representations
└── Purpose: Capture cross-domain patterns
```

### GNN Tasks

```
TASK 1: LINK PREDICTION
├── Input: Node pairs (i, j)
├── Output: P(hidden_edge between i and j)
├── Method: Dot product of node embeddings + MLP
├── Use: Find hidden relationships, missing evidence
├── Uncertainty: Monte Carlo dropout for prediction intervals

TASK 2: COMMUNITY DETECTION
├── Input: Graph structure + node features
├── Output: Community assignments + modularity score
├── Method: Graph Attention Networks + modularity optimization
├── Use: Identify functional groups (entrepreneurial, associational)
├── Uncertainty: Soft assignments (probability distribution over communities)

TASK 3: NODE CLASSIFICATION
├── Input: Node features + local graph structure
├── Output: P(role | node) for each role type
├── Method: GCN + softmax classifier
├── Use: Identify hub, broker, bridge, peripheral roles
├── Uncertainty: Class probabilities (not hard assignments)

TASK 4: ANOMALY DETECTION
├── Input: Node/edge/graph features
├── Output: Anomaly score + type
├── Method: Graph Autoencoder + reconstruction error
├── Use: Detect adversarial patterns, unusual structures
├── Uncertainty: Reconstruction confidence interval
```

### GNN Training

```
TRAINING DATA:
├── Positive examples: Known criminal relationships
├── Negative examples: Non-criminal relationships (careful!)
├── Partial labels: Semi-supervised learning
└── Synthetic data: Generated from known patterns

TRAINING STRATEGY:
├── Phase 1: Pre-train on synthetic data
├── Phase 2: Fine-tune on real data (semi-supervised)
├── Phase 3: Active learning (investigator feedback)
└── Phase 4: Continuous learning (new cases)

EVALUATION METRICS:
├── Link prediction: AUC-ROC, AUC-PR, F1
├── Community detection: Modularity, NMI, ARI
├── Node classification: F1 (per class), macro-F1
├── Anomaly detection: Precision@K, recall@K
└── Investigator utility: Actionability, interpretability
```

### GNN Output Format

```
GNNPrediction {
  prediction_type:    string    // link_prediction, community, role, anomaly
  target:             string    // node_id or edge_id
  prediction:         object    // type-specific prediction
  confidence:         float     // 0-1
  uncertainty:        float     // 0-1 (prediction interval width)
  evidence:           string[]  // which features drove this prediction
  graph_context:      object    // relevant subgraph for this prediction
  timestamp:          datetime  // when prediction was made
  model_version:      string    // which model version produced this
}

RULE: GNNPrediction must NEVER be used as evidence.
      It is a HYPOTHESIS GENERATOR, not a conclusion.
      The reasoning layer decides what to do with predictions.
```

### Calibration Output Format

```
CalibrationOutput {
  original_confidence: float       // before calibration
  adjusted_confidence: float       // after calibration
  calibration_method: string      // "platt_scaling" / "isotonic_regression" / "bayesian"
  calibration_confidence: float   // how confident in the calibration
  drift_detected: boolean         // has calibration drifted?
  drift_magnitude: float          // how much has it drifted
  recommended_action: string      // "recalibrate" / "monitor" / "no_action"
  timestamp: datetime             // when calibration was performed
  model_version: string           // which model version
}
```

---

## Layer 3: Bayesian Networks

### Purpose
Reason about evidence dependencies, uncertainty propagation, and competing hypotheses. This is where the reasoning layer's confidence decomposition meets probabilistic inference.

### Architecture

```
BAYESIAN NETWORK STRUCTURE:

├── Evidence Nodes (from Evidence Graph)
│   ├── Each evidence item = one BN node
│   ├── States: observed, not_observed, unknown
│   └── CPT: P(evidence | hypothesis, source_reliability)
│
├── Hypothesis Nodes (from Hypothesis Store)
│   ├── Each hypothesis = one BN node
│   ├── States: true, false
│   └── CPT: P(hypothesis | evidence_1, evidence_2, ...)
│
├── Background Nodes (priors)
│   ├── Base rates for crime types
│   ├── Population statistics
│   └── Environmental factors
│
└── Dependency Edges
    ├── Evidence → Hypothesis (supporting)
    ├── Evidence → Evidence (dependency, not independence)
    ├── Hypothesis → Hypothesis (competition)
    └── Background → Hypothesis (prior influence)
```

### BN Inference

```
INFERENCE PROCESS:

1. INITIALIZE
   ├── Set priors from base rates
   ├── Set evidence states from Evidence Graph
   └── Set dependency structure from Dependency DAG

2. BELIEF PROPAGATION
   ├── For each evidence node:
   │   ├── Update P(hypothesis | evidence)
   │   ├── Propagate to connected nodes
   │   └── Repeat until convergence
   └── Handle missing evidence gracefully

3. COMPETING HYPOTHESES
   ├── Maintain P(H1), P(H2), P(H3), ..., P(null)
   ├── Ensure sum = 1.0
   ├── Update all hypotheses simultaneously
   └── Never commit to single hypothesis

4. INFORMATION GAIN
   ├── For each missing evidence E:
   │   ├── Calculate H(P(H)) = current entropy
   │   ├── Calculate H(P(H|E)) = entropy if E obtained
   │   ├── IG(E) = H(P(H)) - H(P(H|E))
   │   └── Rank by IG
   └── Output: ranked list of evidence to obtain

5. CONTRADICTION HANDLING
   ├── When evidence E supports H1 but contradicts H2:
   │   ├── Update P(H1 | E) up
   │   ├── Update P(H2 | E) down
   │   ├── Check if contradiction is due to:
   │   │   ├── Wrong identity resolution
   │   │   ├── Wrong event linkage
   │   │   ├── Temporal misalignment
   │   │   ├── Source error
   │   │   └── Genuine conflict
   │   └── Flag for investigator review
   └── Never silently resolve contradictions
```

### BN Output Format

```
BNInferenceResult {
  hypotheses:         HypothesisDistribution[]
  evidence_states:    EvidenceState[]
  contradictions:     Contradiction[]
  information_gain:   InformationGainRanking[]
  confidence:         float
  uncertainty:        float
  convergence:        boolean
  iterations:         int
  timestamp:          datetime
}

HypothesisDistribution {
  hypothesis_id:      string
  description:        string
  probability:        float     // P(H)
  supporting_evidence: string[]
  contradicting_evidence: string[]
  alternatives:       string[]  // other hypothesis IDs
}

InformationGainRanking {
  evidence_id:        string
  description:        string
  ig_score:           float
  feasibility:        float     // how easy to obtain
  timeliness:         float     // how urgent
  investigative_value: float    // IG * feasibility * timeliness
}
```

### BN Integration with Reasoning Layer

```
REASONING LAYER PROVIDES:
├── Dependency DAG (which evidence items are independent)
├── Source Reliability (contextual reliability per source_type × claim_type)
├── Hypothesis Structure (which hypotheses compete)
├── Event Clustering (which observations describe same event)
└── Identity Resolution (which entities are the same)

BN PROVIDES:
├── Updated probabilities for all hypotheses
├── Information gain rankings
├── Contradiction detection and classification
├── Confidence decomposition (what drives the score)
└── Uncertainty quantification (prediction intervals)

THE TWO LAYERS DO NOT DUPLICATE EACH OTHER.
Reasoning layer = what questions to ask.
BN = how to answer them probabilistically.
```

---

## Layer 4: Temporal Models

### Purpose
Track how the criminal network evolves over time. Detect structural changes, emerging patterns, and adversarial adaptations.

### Architecture

```
TEMPORAL MODEL:
├── Input: Time-windowed graph snapshots
│   ├── Window size: configurable (1 day, 1 week, 1 month)
│   ├── Overlap: configurable (0%, 50%, 100%)
│   └── Minimum window: 1 day
│
├── Model: Graph Convolutional Recurrent Network (GCRN)
│   ├── Spatial: GCN captures graph structure
│   ├── Temporal: GRU/LSTM captures evolution
│   └── Output: Node/edge predictions + anomalies
│
└── Tasks:
    ├── Predict next state of graph
    ├── Detect sudden structural changes
    ├── Identify emerging communities
    └── Model network resilience
```

### Temporal Analysis

```
EVOLUTION TRACKING:

For each time window t:
├── Compute graph features (density, modularity, centrality)
├── Compare to previous window t-1
├── Compute change metrics:
│   ├── Δ density = (density_t - density_{t-1}) / density_{t-1}
│   ├── Δ modularity = modularity_t - modularity_{t-1}
│   ├── Δ centrality = max(Δ centrality_i) for all nodes i
│   └── Δ community_structure = NMI(communities_t, communities_{t-1})
└── Flag if any Δ exceeds threshold

CHANGE TYPES:
├── GRADUAL: Slow, natural evolution
├── SUDDEN: Rapid change (arrest, new member, defection)
├── ADVERSARIAL: Deliberate manipulation (decoy connections, framing)
├── FRAGMENTATION: Network splits into disconnected components
└── CONSOLIDATION: Separate groups merge
```

### Hysteresis Modeling

```
CRIMINAL NETWORKS EXHIBIT HYSTERESIS:
├── Disruption does not simply reverse growth
├── Networks recover differently than they were disrupted
├── Removing leaders may cause fragmentation (unintended consequence)
└── New structures emerge that differ from pre-disruption state

MODEL:
├── Track network state before disruption event
├── Track network state after disruption event
├── Compute recovery trajectory
├── Compare to pre-disruption baseline
└── Output: recovery_score, new_structure_description
```

### Temporal Output Format

```
TemporalAnalysisResult {
  time_window:        TimeRange
  graph_state:        GraphSnapshot
  change_metrics:     ChangeMetrics
  anomalies:          TemporalAnomaly[]
  evolution_trajectory: EvolutionTrajectory
  resilience_score:   float
  timestamp:          datetime
}

TemporalAnomaly {
  anomaly_type:       string    // sudden_change, adversarial, fragmentation
  affected_nodes:     string[]
  affected_edges:     string[]
  severity:           float     // 0-1
  confidence:         float
  explanation:        string
  recommended_action: string
}

GraphSnapshot: See DATA_FLOW.md for full definition.
```

---

## Layer 5: Adversarial Defense

### Purpose
Protect against deliberate manipulation of network structure. Criminals actively hide, plant, and distort information.

### Threat Model

```
THREAT 1: GRAPH POISONING
├── Criminal creates fake edges to mislead
├── Criminal creates fake nodes to dilute attention
├── Criminal plants false evidence
└── Detection: Anomaly detection for unnatural patterns

THREAT 2: IDENTITY MANIPULATION
├── Criminal uses multiple identities
├── Criminal impersonates others
├── Criminal creates false alibis through identity confusion
└── Detection: Identity resolution uncertainty propagation

THREAT 3: TEMPORAL MANIPULATION
├── Criminal creates false timeline
├── Criminal backdates evidence
├── Criminal destroys evidence strategically
└── Detection: Temporal consistency checks

THREAT 4: INFORMATION WARFARE
├── Criminal plants misleading information
├── Criminal creates decoy communication patterns
├── Criminal uses innocent people as shields
└── Detection: Source triangulation, behavioral consistency
```

### Defense Mechanisms

```
MECHANISM 1: OUTLIER DETECTION
├── Method: Graph Autoencoder reconstruction error
├── Input: Node/edge features + structure
├── Output: Anomaly score per node/edge
├── Threshold: Configurable (default: 3σ from mean)
└── Action: Flag for manual review, not automatic removal

MECHANISM 2: SOURCE TRIANGULATION
├── Rule: Never rely on single-source intelligence
├── Method: For each claim, check number of independent sources
├── Threshold: Minimum 2 independent sources for high-impact claims
└── Action: Flag single-source claims as low confidence

MECHANISM 3: BEHAVIORAL CONSISTENCY
├── Method: Compare claimed behavior to observed patterns
├── Input: Person's historical behavior + new observations
├── Output: Consistency score
└── Action: Flag inconsistencies for investigator review

MECHANISM 4: GRACEFUL DEGRADATION
├── Method: Reduce confidence proportionally to missing data
├── Input: Feature completeness, data coverage
├── Output: Adjusted confidence scores
└── Rule: Never produce high-confidence predictions from sparse data

MECHANISM 5: ADVERSARIAL TRAINING
├── Method: Train GNN on perturbed graphs
├── Input: Original graph + adversarial perturbations
├── Output: Robust GNN model
└── Purpose: Improve resilience to graph poisoning
```

### Adversarial Output Format

```
AdversarialAssessment {
  threat_level:       enum      // low, medium, high, critical
  detected_threats:   Threat[]
  confidence:         float
  recommended_actions: string[]
  affected_nodes:     string[]
  affected_edges:     string[]
}

Threat {
  threat_type:        string    // poisoning, impersonation, temporal, info_war
  severity:           float     // 0-1
  confidence:         float
  evidence:           string[]
  explanation:        string
  recommended_action: string
}
```

---

## Training Pipeline

### Synthetic Data Generation

```
PURPOSE: Generate realistic training data when real data is scarce or sensitive.

METHOD:
├── Start with known criminal network patterns
├── Add realistic noise (missing edges, false edges)
├── Add temporal evolution
├── Add adversarial perturbations
├── Label with ground truth (for evaluation only)
└── Use for pre-training GNN and BN models

DATA SOURCES:
├── Academic datasets (Enron, Lantia, terrorism)
├── Public crime data (FBI UCR, NIBRS)
├── Synthetic generation from known patterns
└── Investigator-created scenarios
```

### Label Creation

```
FROM INVESTIGATIONS:
├── Confirmed relationships (from court records)
├── Confirmed identities (from biometric verification)
├── Confirmed events (from verified sources)
├── Investigator feedback on predictions
└── Contradiction resolutions

LABEL PROVENANCE (from INPUT_DATA.md):
├── Every label carries provenance_class
├── Every label carries verification_status
├── Labels from investigations are INVESTIGATIVE
├── Labels from courts are LEGALLY_ESTABLISHED
└── Never treat investigator hypotheses as labels
```

### Model Versioning

```
ModelVersion {
  version_id:         string    // "gnn_v1.0", "bn_v1.2"
  model_type:         string    // gnn, bn, temporal, adversarial
  training_data:      string[]  // dataset IDs
  training_date:      datetime
  performance_metrics: object   // task-specific metrics
  hyperparameters:    object
  dependencies:       string[]  // other model versions used
  status:             enum      // active, deprecated, experimental
}

RULE: Every prediction is tagged with model_version.
      When model is updated, old predictions are NOT automatically updated.
      Re-running pipeline with new model creates new PipelineRun.

RULE: Policy versioning is separate from model versioning.
      model_version tracks which ML model produced this prediction.
      policy_version tracks which configuration/calibration policy was used.
      Different cases may use different policies.
```

---

## Evaluation Metrics

### For GNN

```
LINK PREDICTION:
├── AUC-ROC: Area under ROC curve
├── AUC-PR: Area under Precision-Recall curve (better for imbalanced)
├── F1@K: F1 score for top-K predictions
├── Precision@K: Precision for top-K predictions
└── Recall@K: Recall for top-K predictions

COMMUNITY DETECTION:
├── Modularity: Quality of community structure
├── NMI: Normalized Mutual Information (vs ground truth)
├── ARI: Adjusted Rand Index (vs ground truth)
└── Modularity with function labels: Do communities match functional types?

NODE CLASSIFICATION:
├── F1 (per class): Performance on each role type
├── Macro-F1: Average across classes (handles imbalance)
├── Precision (per class): False positive rate per role
└── Recall (per class): False negative rate per role

ANOMALY DETECTION:
├── Precision@K: How many top-K anomalies are real
├── Recall@K: How many real anomalies are in top-K
├── F1@K: Balance of precision and recall
└── False Positive Rate: Critical for investigator trust
```

### For BN

```
INFERENCE ACCURACY:
├── Calibration: Do predicted probabilities match actual frequencies?
├── Brier Score: Mean squared error of probability predictions
├── Log-Loss: Information-theoretic measure of prediction quality
└── Coverage: What % of predictions fall within stated intervals?

DECISION QUALITY:
├── Information Gain accuracy: Do IG rankings match actual utility?
├── Actionability: Do recommended actions lead to useful evidence?
├── Contradiction detection rate: % of real contradictions caught
└── False contradiction rate: % of flagged contradictions that are real
```

### For Investigator Utility

```
THE MOST IMPORTANT METRICS:

ACTIONABILITY:
├── Does the system suggest specific next steps?
├── Are suggested actions feasible?
├── Do actions actually reduce uncertainty?
└── Would investigator follow the suggestions?

INTERPRETABILITY:
├── Can investigator understand WHY a prediction was made?
├── Can investigator see what evidence drove the prediction?
├── Can investigator challenge the prediction?
└── Can investigator trace the reasoning chain?

TRUST:
├── Does the system ever produce confident but wrong predictions?
├── Does the system acknowledge uncertainty?
├── Does the system degrade gracefully with missing data?
└── Does the system explain its limitations?
```

---

## ML ↔ Reasoning Layer Interface

### Direction: Reasoning Layer → ML Engine

```
REASONING LAYER ASKS:
├── "What hidden relationships might exist between these entities?"
│   → GNN: link_prediction task
│
├── "What communities exist in this network?"
│   → GNN: community_detection task
│
├── "What roles do these entities play?"
│   → GNN: node_classification task
│
├── "Are there anomalous patterns?"
│   → GNN: anomaly_detection task
│   → Temporal: change detection
│
├── "What's the probability of each hypothesis?"
│   → BN: inference task
│
├── "Which evidence should we obtain next?"
│   → BN: information_gain task
│
├── "Is this network resilient to disruption?"
│   → Temporal: resilience_analysis task
│
└── "Are there adversarial manipulations?"
    → Adversarial: threat_detection task
```

### Direction: ML Engine → Reasoning Layer

```
ML ENGINE RETURNS:
├── Predictions with uncertainty
├── Evidence for each prediction
├── Confidence intervals
├── Alternative explanations
└── Limitations and caveats

REASONING LAYER DECIDES:
├── Whether to act on ML predictions
├── How much weight to give ML outputs
├── Whether to seek human review
├── Whether to update hypotheses
└── Whether to recommend actions

RULE: ML predictions are INPUTS to reasoning, not CONCLUSIONS.
      The reasoning layer has final authority over all outputs.
```

### Data Flow

```
Five-Model Data Flow (see SYSTEM_STRUCTURE.md):

Model 1: EVIDENCE MODEL
  Stage 1-5:
  ├── Reasoning layer extracts features
  ├── Features stored in FEATURE_STORE
  └── ML engine reads from FEATURE_STORE

Model 2+3: PROVENANCE + COVERAGE
  Stage 3-4:
  ├── ML tracks feature provenance (which source, derivation depth)
  ├── ML handles missing data (coverage gaps)
  └── Temporal features stored in FEATURE_STORE

Model 4: ENTITY STATE
  Stage 3+5:
  ├── GNN supports identity resolution
  ├── Identity uncertainty propagated through features
  └── Resolution confidence stored in FEATURE_STORE

Model 5: HYPOTHESIS & INVESTIGATION
  Stage 6-10:
  ├── Stage 6: ML engine runs GNN predictions → GNN_PREDICTIONS_STORE
  ├── Stage 7: ML engine runs BN inference → BN_INFERENCE_STORE
  ├── Stage 8: ML engine checks adversarial → ADVERSARIAL_ASSESSMENT_STORE
  ├── Stage 9: ML engine computes info gain → INFORMATION_GAIN_STORE
  └── Stage 10: ML provides explanations → EXPLANATION_STORE

CRITIC (reads ALL models):
  ├── Reads from ALL stores (including all ML stores)
  ├── Validates ML predictions
  └── Writes ONLY to AUDIT_STORE
```

---

## Implementation Phases

### Phase 1: Hackathon MVP (Days 1-3)

```
PRIORITY: Core GNN + basic BN

├── Feature engineering (simplified)
│   ├── Node features: degree, centrality, basic attributes
│   ├── Edge features: type, frequency, duration
│   └── Graph features: density, modularity
│
├── GNN (simplified)
│   ├── Single-layer GCN (not multilayer yet)
│   ├── Link prediction task only
│   ├── Basic community detection
│   └── No temporal or adversarial yet
│
├── BN (simplified)
│   ├── Simple evidence → hypothesis structure
│   ├── Basic belief propagation
│   ├── Information gain calculation
│   └── No contradictions yet
│
└── Integration
    ├── GNN results feed into graph visualization
    ├── BN results feed into confidence display
    └── Basic "why this person?" explanation
```

### Phase 2: Enhanced (Days 4-5)

```
PRIORITY: Multilayer GNN + temporal

├── Multilayer GNN
│   ├── 2 layers: communication + financial
│   ├── Cross-layer attention
│   └── Improved link prediction
│
├── Temporal models
│   ├── Basic time windowing
│   ├── Change detection
│   └── Simple evolution tracking
│
└── Enhanced BN
    ├── Contradiction handling
    ├── Source reliability integration
    └── Better information gain
```

### Phase 3: Full (Post-hackathon)

```
PRIORITY: Complete architecture

├── Full multilayer GNN (4 layers)
├── Full temporal models (GCRN)
├── Full adversarial defense
├── Full BN with all dependency types
├── Active learning from investigator feedback
├── Model versioning and continuous learning
└── Full evaluation framework
```

---

## Technology Stack (Hackathon)

```
GNN FRAMEWORK:
├── Primary: PyTorch Geometric (PyG)
├── Alternative: DGL (Deep Graph Library)
└── Why: Both support multilayer graphs, active community

BN FRAMEWORK:
├── Primary: pgmpy (Python)
├── Alternative: bnlearn (R wrapper)
└── Why: Both support belief propagation, information gain

TEMPORAL:
├── Primary: PyTorch Geometric Temporal
├── Alternative: Custom GRU + GCN
└── Why: PyG Temporal integrates with PyG

VISUALIZATION:
├── Primary: NetworkX + Plotly
├── Alternative: vis.js (frontend)
└── Why: NetworkX for analysis, vis.js for interactive

DEPLOYMENT:
├── Primary: Docker container
├── Alternative: Local Python server
└── Why: Docker matches existing playbook
```

---

## Summary

```
THE ML ENGINE IS:
├── A learning layer that feeds the reasoning layer
├── A pattern detector that generates hypotheses
├── A probabilistic reasoner that quantifies uncertainty
├── A temporal tracker that models evolution
└── A defense system against adversarial manipulation

THE ML ENGINE IS NOT:
├── A replacement for human judgment
├── A source of conclusions
├── A black box that operates without explanation
├── A system that operates without uncertainty
└── A magic solution that works without data

THE ONE RULE STILL APPLIES:
The ML engine may increase the confidence of a hypothesis,
but it must never upgrade an inference into an observation.
```
