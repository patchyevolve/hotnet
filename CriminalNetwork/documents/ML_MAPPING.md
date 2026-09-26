# ML MAPPING — How ML Connects to the Existing Architecture

> The ML engine is not a separate system. It is a layer that the existing architecture calls when it needs to learn from data.

---

## Stage → Model Mapping

ML feeds into all five analytical models (see SYSTEM_STRUCTURE.md):

```
Model 1: Evidence Model        → ML: Feature extraction (Stage 1-2)
Model 2: Provenance Model      → ML: Feature source tracking, derivation depth
Model 3: Coverage Model        → ML: Missing data handling, graceful degradation
Model 4: Entity State Model    → ML: GNN identity features, uncertainty propagation
Model 5: Hypothesis & Inv.     → ML: GNN link prediction, BN inference, temporal models
```

---

## The Core Principle

```
REASONING LAYER (existing 7 docs):
├── Defines WHAT questions to ask
├── Defines HOW to interpret answers
├── Defines WHAT to do with predictions
└── Has final authority over all outputs

ML ENGINE (new):
├── ANSWERS pattern-based questions
├── Provides predictions WITH uncertainty
├── Never makes conclusions
└── Always explains its reasoning
```

---

## Document-by-Document Mapping

### 1. INPUT_DATA.md → ML Engine

```
INPUT_DATA.md DEFINES:
├── What data enters the system
├── Source reliability
├── Provenance tracking
└── Verification status

ML ENGINE USES THIS FOR:
├── Feature engineering (what features to extract)
├── Training data preparation (how to label data)
├── Source reliability weighting (how much to trust each source)
└── Verification-aware learning (only learn from verified data)

SPECIFIC CONNECTIONS:

INPUT_DATA.md Section: "Source-Origin Epistemic Contract"
→ ML uses: Source reliability scores to weight training examples
→ ML uses: Verification status to filter training data
→ ML uses: Provenance class to separate observational from derived data

INPUT_DATA.md Section: "Source Reliability Matrix"
→ ML uses: Reliability weights for evidence nodes in BN
→ ML uses: Reliability scores to calibrate GNN confidence
→ ML uses: Reliability to detect unreliable sources

INPUT_DATA.md Section: "Claim-Aware Dependency DAG"
→ ML uses: DAG structure for BN dependency edges
→ ML uses: Independence information for feature selection
→ ML uses: Derivation depth for confidence adjustment

WHAT TO ADD TO INPUT_DATA.md:
├── Section: "ML Feature Extraction Rules"
│   ├── Which features to extract from each data type
│   ├── How to handle missing features
│   ├── How to propagate feature uncertainty
│   └── Feature freshness requirements
│
└── Section: "Training Data Preparation"
    ├── How to create labels from verified data
    ├── How to handle partial labels
    ├── How to balance training data
    └── How to version training datasets
```

### 2. SYSTEM_STRUCTURE.md → ML Engine

```
SYSTEM_STRUCTURE.md DEFINES:
├── The 5 analytical models
├── The 15 failure modes
├── Multiplexity and relationship semantics
└── The one rule (never upgrade inference into observation)

ML ENGINE USES THIS FOR:
├── Model architecture design (5 models → 5 ML layers)
├── Failure mode prevention (adversarial defense)
├── Relationship-aware features (multiplexity → multi-layer GNN)
└── Rule compliance (uncertainty propagation)

SPECIFIC CONNECTIONS:

SYSTEM_STRUCTURE.md Section: "Five Interacting Analytical Models"
→ ML implements: Evidence Model → GNN node/edge features
→ ML implements: Provenance Model → feature source tracking
→ ML implements: Coverage Model → missing data handling
→ ML implements: Entity State → identity uncertainty in GNN
→ ML implements: Hypothesis Model → BN hypothesis nodes

SYSTEM_STRUCTURE.md Section: "15 Failure Modes"
→ ML prevents: #1 (Evidence Independence) → Dependency DAG in BN
→ ML prevents: #3 (Inference Lineage) → Feature provenance tracking
→ ML prevents: #5 (Event Deduplication) → Temporal clustering
→ ML prevents: #6 (Identity Uncertainty) → GNN identity features
→ ML prevents: #10 (Adversarial Poisoning) → Adversarial defense
→ ML prevents: #11 (Feedback Loops) → Training data isolation

SYSTEM_STRUCTURE.md Section: "Multiplexity"
→ ML implements: Multi-layer GNN (one layer per relationship type)
→ ML implements: Cross-layer attention (fusion mechanism)
→ ML implements: Function-aware features (entrepreneurial, associational)

WHAT TO ADD TO SYSTEM_STRUCTURE.md:
├── Section: "Layer 6: ML Engine"
│   ├── Position in architecture diagram
│   ├── Interface with existing 5 models
│   ├── Data flow between reasoning and ML layers
│   └── Rule: ML outputs are hypotheses, not conclusions
│
└── Section: "ML Failure Modes"
    ├── GNN overconfidence (calibration required)
    ├── BN dependency misspecification (validation required)
    ├── Adversarial evasion (continuous monitoring)
    └── Training data bias (fairness evaluation)
```

### 3. OUTPUTS.md → ML Engine

```
OUTPUTS.md DEFINES:
├── What the system is allowed to claim
├── Confidence decomposition
├── Epistemic status (observation, evidence, inference)
└── Entity resolution uncertainty

ML ENGINE USES THIS FOR:
├── Output format requirements (what ML must return)
├── Confidence calibration (matching output standards)
├── Uncertainty quantification (matching decomposition)
└── Epistemic tagging (marking ML outputs as inference)

SPECIFIC CONNECTIONS:

OUTPUTS.md Section: "Confidence Decomposition"
→ ML returns: Confidence with decomposition (supporting, contradicting, unknown)
→ ML returns: Confidence intervals (not point estimates)
→ ML returns: Confidence tagged with run_id and model_version

OUTPUTS.md Section: "Epistemic Status"
→ ML marks: All predictions as INFERENCE (never OBSERVATION)
→ ML marks: All predictions with derivation_depth
→ ML marks: All predictions with source_reliability

OUTPUTS.md Section: "Entity Resolution Uncertainty"
→ ML uses: Identity confidence as feature weight
→ ML uses: Resolution uncertainty in GNN predictions
→ ML propagates: Identity uncertainty through all ML outputs

WHAT TO ADD TO OUTPUTS.md:
├── Section: "ML Output Requirements"
│   ├── Every ML prediction must include uncertainty
│   ├── Every ML prediction must include evidence
│   ├── Every ML prediction must include model_version
│   ├── Every ML prediction must include timestamp
│   └── Every ML prediction must be marked as INFERENCE
│
└── Section: "ML Confidence Standards"
    ├── GNN confidence: Must include prediction interval
    ├── BN confidence: Must include posterior distribution
    ├── Temporal confidence: Must include change magnitude
    └── Adversarial confidence: Must include threat level
```

### 4. THE_CRITIC.md → ML Engine

```
THE_CRITIC.md DEFINES:
├── How the system answers investigator questions
├── Falsification reasoning
├── Investigative value optimization
├── "Why this person?" explanations
└── Quality checking for the entire investigation

ML ENGINE USES THIS FOR:
├── Explanation generation (how ML justifies predictions)
├── Falsification targets (what would disprove ML predictions)
├── Quality checking (does ML output make sense?)
└── Integration with investigator queries

SPECIFIC CONNECTIONS:

THE_CRITIC.md Section: "Query System"
→ Critic asks ML: "What hidden relationships exist?"
→ Critic asks ML: "What communities are present?"
→ Critic asks ML: "What roles do these entities play?"
→ Critic asks ML: "Are there adversarial patterns?"
→ Critic asks ML: "Which evidence should we obtain next?"

THE_CRITIC.md Section: "Falsification"
→ Critic asks ML: "What would disprove this ML prediction?"
→ Critic asks ML: "What evidence would contradict the GNN?"
→ Critic asks ML: "What would make the BN update differently?"
→ Critic asks ML: "What would change the temporal analysis?"

THE_CRITIC.md Section: "Investigative Value"
→ Critic asks ML: "Which ML prediction has highest information gain?"
→ Critic asks ML: "Which ML prediction is most actionable?"
→ Critic asks ML: "Which ML prediction is most feasible to verify?"

THE_CRITIC.md Section: "Why This Person?"
→ Critic asks ML: "Why did the GNN flag this person?"
→ Critic asks ML: "What features drove this prediction?"
→ Critic asks ML: "What alternatives exist?"
→ Critic asks ML: "What would change this prediction?"

WHAT TO ADD TO THE_CRITIC.md:
├── Section: "ML Quality Check"
│   ├── Does the ML prediction make sense given the evidence?
│   ├── Is the ML confidence calibrated?
│   ├── Does the ML prediction contradict other ML predictions?
│   ├── Is the ML prediction explainable?
│   └── Would an investigator trust this prediction?
│
└── Section: "ML Explanation Requirements"
    ├── GNN: Which features drove the prediction?
    ├── GNN: What subgraph is relevant?
    ├── BN: Which evidence items matter most?
    ├── BN: What would change the inference?
    ├── Temporal: What changed in the network?
    └── Adversarial: What threat was detected?
```

### 5. STAGE_REASONERS.md → ML Engine

```
STAGE_REASONERS.md DEFINES:
├── What each pipeline stage thinks about
├── Reasoning steps at each stage
├── What happens if reasoning fails
└── Output to next stage

ML ENGINE USES THIS FOR:
├── When to trigger ML inference
├── What ML tasks to run at each stage
├── How to integrate ML outputs into pipeline
└── What to do if ML fails

SPECIFIC CONNECTIONS:

STAGE_REASONERS.md Section: "Stage 1: Ingestion Reasoner"
→ ML adds: Feature extraction during ingestion
→ ML adds: Source reliability weighting for features
→ ML adds: Quality assessment for ML inputs

STAGE_REASONERS.md Section: "Stage 2: Extraction Reasoner"
→ ML adds: GNN-based entity extraction (better than rule-based)
→ ML adds: GNN-based relation extraction
→ ML adds: Confidence scoring for extractions

STAGE_REASONERS.md Section: "Stage 3: Resolution Reasoner"
→ ML adds: GNN-based entity matching
→ ML adds: Identity uncertainty propagation
→ ML adds: Cluster-based resolution

STAGE_REASONERS.md Section: "Stage 6: Analytics Reasoner"
→ ML adds: GNN link prediction
→ ML adds: GNN community detection
→ ML adds: GNN node classification
→ ML adds: Anomaly detection
→ ML adds: Temporal change detection

STAGE_REASONERS.md Section: "Stage 7: Hypothesis Reasoner"
→ ML adds: BN inference for hypothesis evaluation
→ ML adds: Information gain calculation
→ ML adds: Contradiction detection
→ ML adds: Competing hypothesis maintenance

STAGE_REASONERS.md Section: "Stage 9: Gap Detection Reasoner"
→ ML adds: Information gain ranking
→ ML adds: Feasibility assessment
→ ML adds: Action prioritization

WHAT TO ADD TO STAGE_REASONERS.md:
├── At each stage: "ML Calls" subsection
│   ├── Which ML task to call
│   ├── What inputs ML needs
│   ├── What outputs ML returns
│   ├── How to handle ML failure
│   └── How to integrate ML output into stage reasoning
│
└── Section: "ML Failure Handling"
    ├── GNN prediction fails → use rule-based fallback
    ├── BN inference fails → use simple majority vote
    ├── Temporal analysis fails → use static analysis
    ├── Adversarial detection fails → flag for manual review
    └── Always degrade gracefully, never crash
```

### 6. DATA_FLOW.md → ML Engine

```
DATA_FLOW.md DEFINES:
├── How data moves through the 10-stage pipeline
├── Pipeline run versioning
├── Graph snapshots
└── Run comparison

ML ENGINE USES THIS FOR:
├── When ML inference runs in the pipeline
├── How ML outputs are versioned
├── How ML results are compared across runs
└── How ML integrates with existing data flow

SPECIFIC CONNECTIONS:

DATA_FLOW.md Section: "Pipeline Run Versioning"
→ ML adds: Model versioning (gnn_v1.0, bn_v1.2)
→ ML adds: Training data versioning
→ ML adds: Prediction versioning (tied to run_id)
→ ML adds: Model performance tracking

DATA_FLOW.md Section: "Stage 1-5 (Ingestion → Graph)"
→ ML adds: Feature extraction as sub-stage
→ ML adds: Feature storage in FEATURE_STORE
→ ML adds: Feature quality validation

DATA_FLOW.md Section: "Stage 6 (Analytics)"
→ ML adds: GNN inference sub-stage
→ ML adds: GNN prediction storage
→ ML adds: GNN result validation

DATA_FLOW.md Section: "Stage 7 (Hypothesis)"
→ ML adds: BN inference sub-stage
→ ML adds: BN result storage
→ ML adds: BN result validation

DATA_FLOW.md Section: "Stage 9 (Gap Detection)"
→ ML adds: Information gain calculation sub-stage
→ ML adds: Information gain storage
→ ML adds: Action prioritization

WHAT TO ADD TO DATA_FLOW.md:
├── Section: "ML Inference Stage (Stage 6 sub-stage)"
│   ├── Input: FEATURE_STORE, EVIDENCE_GRAPH
│   ├── Processing: GNN inference, BN inference
│   ├── Output: GNN_PREDICTIONS_STORE, BN_INFERENCE_STORE
│   └── Validation: Confidence calibration, sanity checks
│
├── Section: "ML Run Comparison"
│   ├── Compare GNN predictions across runs
│   ├── Compare BN inferences across runs
│   ├── Track model performance over time
│   └── Detect model drift
│
└── Section: "ML Data Flow Diagram"
    ├── Feature extraction flow
    ├── GNN inference flow
    ├── BN inference flow
    ├── Temporal analysis flow
    └── Adversarial detection flow
```

### 7. INTERNAL_BINDINGS.md → ML Engine

```
INTERNAL_BINDINGS.md DEFINES:
├── How components connect through stores
├── Store read/write rules
├── Data flow between components
└── Core principle: components communicate only through stores

ML ENGINE USES THIS FOR:
├── ML store definitions
├── ML read/write rules
├── ML data flow
└── ML integration with existing stores

SPECIFIC CONNECTIONS:

INTERNAL_BINDINGS.md Section: "Store Connections"
→ ML adds: FEATURE_STORE (written by ingestion, read by ML)
→ ML adds: GNN_PREDICTIONS_STORE (written by GNN, read by reasoning)
→ ML adds: BN_INFERENCE_STORE (written by BN, read by reasoning)
→ ML adds: TEMPORAL_ANALYSIS_STORE (written by temporal, read by reasoning)
→ ML adds: ADVERSARIAL_ASSESSMENT_STORE (written by adversarial, read by reasoning)
→ ML adds: INFORMATION_GAIN_STORE (written by BN, read by gap detection)
→ ML adds: EXPLANATION_STORE (written by ML, read by Critic)

WHAT TO ADD TO INTERNAL_BINDINGS.md:
├── Section: "ML Store Connections"
│   ├── FEATURE_STORE
│   │   ├── Written by: IngestionEngine (Stage 1)
│   │   ├── Read by: GNNEngine (Stage 6 sub-stage)
│   │   ├── Read by: BNEngine (Stage 7)
│   │   └── Purpose: ML features with uncertainty metadata
│   │
│   ├── GNN_PREDICTIONS_STORE
│   │   ├── Written by: GNNEngine (Stage 6 sub-stage)
│   │   ├── Read by: HypothesisEngine (Stage 7)
│   │   ├── Read by: CriticEngine (Stage 10)
│   │   └── Purpose: GNN predictions with uncertainty
│   │
│   ├── BN_INFERENCE_STORE
│   │   ├── Written by: BNEngine (Stage 7)
│   │   ├── Read by: GapDetectionEngine (Stage 9)
│   │   ├── Read by: CriticEngine (Stage 10)
│   │   └── Purpose: BN inference results with posterior distributions
│   │
│   ├── TEMPORAL_ANALYSIS_STORE
│   │   ├── Written by: TemporalEngine (Stage 6 sub-stage)
│   │   ├── Read by: HypothesisEngine (Stage 7)
│   │   ├── Read by: CriticEngine (Stage 10)
│   │   └── Purpose: Temporal analysis with change metrics
│   │
│   ├── ADVERSARIAL_ASSESSMENT_STORE
│   │   ├── Written by: AdversarialEngine (Stage 8)
│   │   ├── Read by: CriticEngine (Stage 10)
│   │   └── Purpose: Threat assessments with confidence
│   │
│   ├── INFORMATION_GAIN_STORE
│   │   ├── Written by: BNEngine (Stage 7)
│   │   ├── Read by: GapDetectionEngine (Stage 9)
│   │   └── Purpose: Ranked evidence to obtain
│   │
│   └── EXPLANATION_STORE
│       ├── Written by: GNNEngine, BNEngine, TemporalEngine
│       ├── Read by: CriticEngine (Stage 10)
│       └── Purpose: Human-readable explanations for ML predictions
│
└── Section: "ML Store Rules"
    ├── ML stores follow same rules as existing stores
    ├── ML predictions are tagged with model_version
    ├── ML predictions are tagged with run_id
    ├── ML predictions are never modified after write
    └── ML predictions are compared across runs
```

---

## Data Flow Summary

```
Five-Model Pipeline (see SYSTEM_STRUCTURE.md):

Model 1: EVIDENCE MODEL
  Raw Data → Ingestion (Stage 1) → Extraction (Stage 2)
  └── ML: Feature extraction → FEATURE_STORE

Model 2: PROVENANCE MODEL
  Resolution (Stage 3) → Temporal (Stage 4)
  └── ML: Feature source tracking, derivation depth

Model 3: COVERAGE MODEL
  Resolution (Stage 3) → Temporal (Stage 4)
  └── ML: Missing data handling, graceful degradation

Model 4: ENTITY STATE MODEL
  Resolution (Stage 3) → Graph Build (Stage 5)
  └── ML: GNN identity features, uncertainty propagation

Model 5: HYPOTHESIS & INVESTIGATION
  Graph Build (Stage 5) → Analytics (Stage 6) → Hypothesis (Stage 7)
  → Contradiction (Stage 8) → Gap Detection (Stage 9)
  └── ML: GNN predictions, BN inference, temporal models, adversarial

CRITIC (Stage 10): Reads ALL models, writes audit

ML Stores (cross-cutting):
  FEATURE_STORE ← IngestionEngine (Stage 1)
  GNN_PREDICTIONS_STORE ← GNNEngine (Stage 6)
  BN_INFERENCE_STORE ← BNEngine (Stage 7)
  TEMPORAL_ANALYSIS_STORE ← TemporalEngine (Stage 4)
  ADVERSARIAL_ASSESSMENT_STORE ← AdversarialEngine (Stage 8)
  INFORMATION_GAIN_STORE ← BNEngine (Stage 9)
  EXPLANATION_STORE ← All ML components
```

---

## Store Map

```
EXISTING STORES:
├── RAW_EVIDENCE_STORE
├── EXTRACTED_ENTITIES_STORE
├── EXTRACTED_RELATIONS_STORE
├── RESOLVED_ENTITIES_STORE
├── UNKNOWN_ENTITIES_STORE
├── CONTRADICTIONS_STORE
├── TEMPORAL_SPATIAL_STORE
├── EVIDENCE_EDGES_STORE
├── PROVENANCE_STORE
├── ANALYTICS_RESULTS_STORE
├── BEHAVIORAL_BASELINES_STORE
├── HYPOTHESIS_STORE
├── EVIDENCE_GAPS_STORE
├── INVESTIGATOR_ACTIONS_STORE
├── DEDUPLICATED_EVENTS_STORE
└── INVESTIGATION_FEEDBACK_STORE

NEW ML STORES:
├── FEATURE_STORE
├── GNN_PREDICTIONS_STORE
├── BN_INFERENCE_STORE
├── TEMPORAL_ANALYSIS_STORE
├── ADVERSARIAL_ASSESSMENT_STORE
├── INFORMATION_GAIN_STORE
└── EXPLANATION_STORE

STORE INTERACTIONS:
IngestionEngine → writes to → FEATURE_STORE
GNNEngine → reads from → FEATURE_STORE, EVIDENCE_EDGES_STORE, RESOLVED_ENTITIES_STORE
GNNEngine → writes to → GNN_PREDICTIONS_STORE, EXPLANATION_STORE
BNEngine → reads from → FEATURE_STORE, EVIDENCE_EDGES_STORE, HYPOTHESIS_STORE, PROVENANCE_STORE
BNEngine → writes to → BN_INFERENCE_STORE, INFORMATION_GAIN_STORE, EXPLANATION_STORE
TemporalEngine → reads from → FEATURE_STORE, EVIDENCE_EDGES_STORE, TEMPORAL_SPATIAL_STORE
TemporalEngine → writes to → TEMPORAL_ANALYSIS_STORE, EXPLANATION_STORE
AdversarialEngine → reads from → FEATURE_STORE, EVIDENCE_EDGES_STORE, PROVENANCE_STORE
AdversarialEngine → writes to → ADVERSARIAL_ASSESSMENT_STORE, EXPLANATION_STORE
HypothesisEngine → reads from → GNN_PREDICTIONS_STORE, BN_INFERENCE_STORE, TEMPORAL_ANALYSIS_STORE
GapDetectionEngine → reads from → INFORMATION_GAIN_STORE, EVIDENCE_GAPS_STORE
CriticEngine → reads from → ALL STORES (including all ML stores)
```

---

## Implementation Priority

```
PHASE 1 (Hackathon MVP):
├── Create FEATURE_STORE
├── Create GNN_PREDICTIONS_STORE
├── Create BN_INFERENCE_STORE
├── Create EXPLANATION_STORE
├── Update INTERNAL_BINDINGS.md with new stores
├── Update DATA_FLOW.md with ML inference stage
└── Update STAGE_REASONERS.md with ML calls

PHASE 2 (Enhanced):
├── Create TEMPORAL_ANALYSIS_STORE
├── Create ADVERSARIAL_ASSESSMENT_STORE
├── Create INFORMATION_GAIN_STORE
├── Update SYSTEM_STRUCTURE.md with Layer 6
├── Update THE_CRITIC.md with ML quality check
└── Update OUTPUTS.md with ML output requirements

PHASE 3 (Full):
├── Complete all store integrations
├── Complete all document updates
├── Full evaluation framework
└── Continuous learning pipeline
```
