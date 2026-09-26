# AI-Powered Criminal Network Analysis System: An Integrated Architecture for Evidence Reasoning, Uncertainty Propagation, and Investigative Decision Support

## Authors
SIH26189 Team — Ministry of Home Affairs, Cybersecurity Theme

## Abstract

Criminal network analysis has evolved from descriptive accounts of organized crime to computational analysis of relational data. However, existing systems primarily focus on graph construction and pattern detection, leaving a critical gap: how should a system reason about incomplete, dependent, uncertain, contradictory, and investigation-influenced evidence?

This paper presents a complete architecture for an AI-powered criminal network analysis system that addresses this gap through two integrated layers: (1) a reasoning layer that models evidence provenance, source reliability, dependency tracking, uncertainty propagation, competing hypotheses, and investigative decision-making; and (2) a machine learning layer that provides pattern detection through Graph Neural Networks, probabilistic reasoning through Bayesian Networks, temporal evolution tracking, and adversarial defense.

The architecture is grounded in Klaus von Lampe's (2026) framework of functionally distinct criminal networks and addresses 15 identified failure modes that can produce convincing but wrong investigations. The system is designed for local deployment using Neo4j, spaCy, React, and Docker, making it suitable for hackathon demonstration while maintaining academic rigor.

**Keywords:** Criminal Network Analysis, Knowledge Graphs, Graph Neural Networks, Bayesian Networks, Evidence Reasoning, Uncertainty Propagation, Organized Crime

---

## 1. Introduction

### 1.1 Problem Statement

Law enforcement agencies increasingly rely on computational tools to analyze criminal networks. Graph databases store relationships between suspects, events, and locations. Machine learning models detect patterns and anomalies. Network analytics calculate centrality and community structure.

However, these tools share a fundamental limitation: they treat all data as equivalent facts. A CDR record (automated, high reliability for occurrence) receives the same treatment as a news article (derived, secondhand). An FIR narrative (human report, subjective) is weighted equally with a bank transaction (automated, objective). This conflation produces systems that are confident but wrong.

The consequences are severe. Wrong identity merges contaminate entire graphs. Dependent sources inflate confidence. Missing evidence is treated as evidence of absence. Investigation feedback loops create self-reinforcing bias. The system may produce a convincing visualization of a criminal network that bears little resemblance to reality.

### 1.2 Research Question

This paper addresses one central question:

> How should an AI-powered criminal network analysis system reason about incomplete, dependent, uncertain, contradictory, transformed, and investigation-influenced evidence?

### 1.3 Contributions

This paper makes the following contributions:

1. **A formal evidence model** that distinguishes between provenance (where data came from) and verification (how well it is verified), preventing the dangerous conflation of "ground truth" with observation.

2. **A claim-aware dependency DAG** that tracks which evidence items are independent versus derived, preventing inflated confidence from dependent sources.

3. **A multiplexity-aware graph model** that distinguishes between entrepreneurial, associational, and quasi-governmental network structures, grounded in von Lampe's (2026) framework.

4. **A confidence decomposition framework** that breaks down analytical scores into supporting, contradicting, and unknown factors, preventing the collapse of uncertainty into false certainty.

5. **An ML engine** that integrates Graph Neural Networks for pattern detection, Bayesian Networks for probabilistic reasoning, temporal models for evolution tracking, and adversarial defense for robustness.

6. **A Critic module** that validates ML outputs, checks for bias, generates explanations, and prioritizes investigative actions based on information gain.

### 1.4 Document Structure

The remainder of this paper is organized as follows. Section 2 reviews relevant literature. Section 3 presents the system architecture. Section 4 describes the reasoning layer. Section 5 describes the ML engine. Section 6 discusses integration between layers. Section 7 addresses evaluation. Section 8 concludes with limitations and future work.

---

## 2. Literature Review

### 2.1 Criminal Network Analysis

Criminal network analysis emerged in the 1970s as an alternative to the "Mafia paradigm" — the assumption that organized crime consists of hierarchical organizations (von Lampe, 2026). Early studies by Hess (1970), Albini (1971), and Ianni (1974) placed criminals in "webs of relationships" rather than organizational charts.

The field experienced a methodological shift in the 2010s with the adoption of social network analysis methods. Morselli (2009) demonstrated that criminal networks exhibit structural properties — brokerage, centrality, clustering — that traditional organizational analysis misses. Bright et al. (2015, 2017, 2019, 2024) extended this work to drug trafficking networks, showing how network structure evolves under law enforcement pressure.

A critical insight from von Lampe (2026) is the concept of **functionally distinct structures**. Criminals interact through multiple types of networks simultaneously:

- **Entrepreneurial networks**: Business relationships focused on profit (drug trafficking, fraud)
- **Associational networks**: Social relationships providing trust and bonding (family, friendship, club membership)
- **Quasi-governmental structures**: Governance relationships setting rules and adjudicating disputes

These structures overlap but are not identical. A person central in one network may be peripheral in another. This insight has profound implications for system design: a single-layer graph cannot capture the functional diversity of criminal networks.

### 2.2 Knowledge Graphs for Crime Investigation

Knowledge graphs have been applied to crime investigation with increasing sophistication. Shi et al. (2022) constructed a knowledge graph for job-related crimes mapped to Neo4j. Elezaj et al. (2020) proposed a knowledge graph framework for investigating crime on online social networks.

The most recent work, CrimeKGQA (Kuok et al., 2025), combines Large Language Models with Neo4j knowledge graphs using Retrieval-Augmented Generation (RAG). This system converts natural language queries to Cypher queries, retrieves structured data, and generates natural language answers. While demonstrating the viability of LLM + KG integration, CrimeKGQA does not address uncertainty, evidence dependency, or adversarial conditions.

### 2.3 Graph Neural Networks for Criminal Networks

Graph Neural Networks (GNNs) have shown promise for criminal network analysis. CrimeGNN (Yang, 2023) applies Graph Convolutional Networks (GCN) with modularity optimization for community detection. CrimeGraphNet (Yang, 2023) uses GCN for link prediction in criminal networks.

Contreras-Velasco et al. (2025) compared classical similarity indices, node2vec embeddings, and GNN models on Mexican cartel alliance datasets, finding that GNNs achieve near-perfect AUC/F1 for hidden link prediction by learning from broader graph topology rather than local similarity.

The DHS/CINA project (Wang & Honavar, 2024) extends this work to **attributed multilayer graphs**, modeling criminal networks with multiple relationship types (communication, financial, social, co-offending) across multiple layers. This approach captures the multiplexity that von Lampe (2026) identifies as essential to understanding criminal networks.

### 2.4 Uncertainty in Criminal Investigation

Bayesian Networks remain the gold standard for evidence reasoning in criminal investigations. Fenton et al. (2020) demonstrated BN modeling of prosecution versus defense narratives in the Simonshaven Case. Mortera and Thompson (2025) showed how "new" evidence versus "accommodated" evidence has different inferential value.

For uncertainty quantification in crime prediction, STMGNN-ZINB (Wang et al., 2024) uses Zero-Inflated Negative Binomial output for uncertainty-aware crime prediction, addressing sparsity in many zero-crime regions.

Dempster-Shafer Evidence Theory (ACM ICBAR, 2024) handles conflicting evidence from multiple unreliable sources through adaptive conflict resolution that dynamically adjusts weights based on source reliability and conflict degree.

### 2.5 Research Gaps

Despite advances in GNNs, knowledge graphs, and Bayesian Networks, several gaps remain:

1. **No integrated architecture** that combines GNN pattern detection with BN evidence reasoning and adversarial defense
2. **No principled uncertainty propagation** from raw data through ML predictions to investigative conclusions
3. **No multiplexity-aware GNN** that captures functionally distinct network structures
4. **No adversarial robustness** specifically designed for criminal network manipulation
5. **No explainability framework** for legal admissibility of ML predictions in criminal investigation

This paper addresses all five gaps.

---

## 3. System Architecture

### 3.1 Design Philosophy

The system is built on one inviolable rule:

> **The system may increase the confidence of a hypothesis, but it must never upgrade an inference into an observation.**

This rule distinguishes our system from naive graph analytics. An observation is something directly recorded by a sensor or person (a CDR record, a bank transaction, CCTV footage). An inference is something computed from observations (an ML prediction, a centrality score, a community assignment). The system must never treat inferences as if they were observations.

### 3.2 Architecture Overview

The system consists of two integrated layers:

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 6: ML ENGINE                    │
│    (GNN, Bayesian Networks, Temporal, Adversarial)      │
├─────────────────────────────────────────────────────────┤
│                    LAYER 5: CRITIC                       │
│    (Quality check, explanations, action prioritization) │
├─────────────────────────────────────────────────────────┤
│                    LAYER 4: HYPOTHESIS & INVESTIGATION   │
│    (Competing explanations, falsification, gaps)        │
├─────────────────────────────────────────────────────────┤
│                    LAYER 3: ENTITY STATE                 │
│    (Identity uncertainty propagation)                   │
├─────────────────────────────────────────────────────────┤
│                    LAYER 2: PROVENANCE & COVERAGE        │
│    (Where claims came from, what was seen/unseen)       │
├─────────────────────────────────────────────────────────┤
│                    LAYER 1: EVIDENCE GRAPH               │
│    (Entities, events, relationships from raw data)      │
└─────────────────────────────────────────────────────────┘
```

### 3.3 The Five Analytical Models

The reasoning layer is built on five interacting analytical models. Each serves a distinct purpose. Reasoning operates across all five.

```
                    ┌─────────────────────┐
                    │     REAL WORLD      │
                    └──────────┬──────────┘
                               │
                         observations
                               ↓
             ┌────────────────────────────────┐
             │       1. EVIDENCE MODEL        │
             │ entities / events / relations  │
             └───────────────┬────────────────┘
                             │
             ┌───────────────┴────────────────┐
             ↓                                ↓
┌────────────────────────┐       ┌────────────────────────┐
│ 2. PROVENANCE MODEL    │       │ 3. COVERAGE MODEL      │
│ where claims came from │       │ what was/wasn't seen   │
└────────────┬───────────┘       └────────────┬───────────┘
             │                                │
             └───────────────┬────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 4. ENTITY STATE      │
                  │ identity uncertainty │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 5. HYPOTHESIS &      │
                  │ INVESTIGATION MODEL  │
                  │ competing theories   │
                  └──────────────────────┘
```

**Why Five Models:**

A single graph cannot distinguish between:
- What we know versus how we know it
- What we observed versus what we didn't
- What's certain versus what's uncertain
- What's independent versus what's derived

The five models separate these concerns so reasoning can operate correctly across all of them.

### 3.4 The 15 Failure Modes

The system guards against 15 failure modes that can produce convincing but wrong investigations:

| # | Failure Mode | Description | Solution |
|---|-------------|-------------|----------|
| 1 | Evidence Independence | Multiple records from one observation | Dependency DAG tracks derivation |
| 2 | Observation Coverage | "No record" ≠ "record proves no event" | Coverage model with statuses |
| 3 | Inference Lineage | ML inference reused as independent evidence | Inference cannot corroborate inference |
| 4 | Background Rates | Unusual behavior vs population baseline | Three baselines: individual + population + environmental |
| 5 | Event Deduplication | Multiple observations of same event | Event identity model |
| 6 | Identity Uncertainty | Uncertain resolution must remain uncertain | Confidence propagation, not merge |
| 7 | Relationship Semantics | Must not collapse into "association" | Specific relationship types |
| 8 | Temporal Causality | "Before" must not become "caused" | Distinguish precedence from causation |
| 9 | Cross-Case Contamination | Shared entities ≠ shared activity | Case-scoped edge validity |
| 10 | Adversarial Poisoning | Relationships intentionally created to mislead | Anomaly detection for unnatural patterns |
| 11 | Investigation Feedback | System recommendations bias later data | Track data origin (observational vs investigative) |
| 12 | Hypothesis Competition | Must maintain multiple explanations | Always maintain null + alternatives |
| 13 | Information Gain | Prioritize missing evidence | Shannon entropy over hypothesis distribution |
| 14 | Exculpatory Evidence | Contradictory evidence must have equal status | Exculpatory check at every stage |
| 15 | Legal/Evidentiary | Analytical confidence ≠ legal conclusion | "REASONABLE_SUSPICION" not "GUILTY" |

---

## 4. The Reasoning Layer

### 4.1 Evidence Model (INPUT_DATA.md)

Every piece of data entering the system has six properties that must be captured at ingestion:

```
SOURCE: Where did this data come from?
├── carrier (automated, high reliability)
├── bank (automated, high reliability)
├── police officer (manual, medium reliability)
├── news article (derived, low reliability)
└── social media (unverified, low reliability)

OBSERVATION: What did someone directly see/record?
├── CDR: "A called B at 14:32" — automated observation
├── Bank: "₹2,00,000 transferred" — automated observation
├── CCTV: "Person matching description entered building" — automated
└── Surveillance: "Subject met with unknown male" — human observation

CLAIM: What does the source assert is true?
├── FIR: "Accused cheated complainant" — LEGAL CLAIM
├── Surveillance: "Subject appeared nervous" — SUBJECTIVE CLAIM
└── News: "Police say suspect is linked to fraud ring" — SECONDHAND CLAIM

DERIVED INFORMATION: What was computed from other data?
├── ML entity extraction — INFERENCE
├── Anomaly detection — COMPUTATION
└── Hypothesis — REASONING

PROVENANCE CLASS: What epistemic category?
├── OBSERVATIONAL: Directly observed
├── DERIVED: Computed from observational data
├── INVESTIGATIVE: Generated by investigation process
└── MODEL_GENERATED: Produced by ML or reasoning system

VERIFICATION STATUS: How well verified?
├── UNVERIFIED: No independent verification
├── CORROBORATED: Consistent with other data
├── INDEPENDENTLY_VERIFIED: Verified by independent source
└── LEGALLY_ESTABLISHED: Established by court
```

**Critical Rule:** "GROUND_TRUTH" must never appear as a provenance class. Provenance (where it came from) and verification (how well verified) are separate dimensions. Collapsing them causes circular reasoning.

### 4.2 Source Reliability

Source reliability is not a single number per source type. It is contextual:

```
SourceReliabilityMatrix[source_type][claim_type]

Example:
                occurrence  identity  intent  location  timing
CDR record        0.95       0.60     N/A     0.70      0.95
Bank record       0.98       0.80     N/A     0.30      0.98
CCTV footage      0.90       0.70     N/A     0.95      0.85
FIR narrative     0.70       0.80     0.50    0.75      0.60
News article      0.40       0.30     0.20    0.30      0.20
Social media      0.20       0.15     0.10    0.25      0.10
```

CDR is strong for "a call occurred" (occurrence: 0.95) but weak for "person A physically held the phone" (identity: 0.60). This contextual reliability propagates through the entire system.

### 4.3 Claim-Aware Dependency DAG

The dependency DAG tracks which evidence items are independent versus derived:

```
FIR #1234 (root source, independent)
├── News article (derived from FIR, dependent)
│   └── Social media post (derived from news, dependent)
└── Investigator note (derived from FIR + other sources, mixed)

CDR record (root source, independent)
├── ML entity extraction (inferred from CDR, dependent)
└── Anomaly detection (computed from CDR, dependent)

RULE: Evidence from the same root source cannot corroborate other evidence from the same root source.
      They share the same source, so they are dependent.
```

### 4.4 Multiplexity (von Lampe, 2026)

Criminal networks are multiplex — the same people interact through multiple types of relationships:

```
Rakesh ←──called──→ Suresh          (communication)
Rakesh ←──paid──→ Suresh            (financial)
Rakesh ←──family──→ Suresh          (social)
Rakesh ←──co_offended──→ Suresh     (criminal)

These are FOUR DIFFERENT relationships.
They have different:
├── Functions (why they exist)
├── Persistence (how long they last)
├── Visibility (how likely to be observed)
├── Strength (how resilient to disruption)
└── Meaning (what they tell us about criminal activity)
```

The system models four functionally distinct network types:

| Type | Purpose | Persistence | Visibility | Structure |
|------|---------|-------------|------------|-----------|
| Entrepreneurial | Profit | LOW | HIGH | Fragmented, ephemeral |
| Associational | Trust/bonding | HIGH | MEDIUM | Cohesive, persistent |
| Quasi-governmental | Governance | VERY HIGH | LOW | Centralized, hierarchical |
| Upperworld bridges | Protection | MEDIUM | VERY LOW | Hidden, deniable |

---

## 5. The ML Engine

### 5.1 Architecture Overview

The ML engine provides pattern detection, probabilistic reasoning, temporal evolution tracking, and adversarial defense. It is a learning layer that feeds the reasoning layer.

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
```

### 5.2 Feature Engineering

Every feature carries uncertainty metadata:

```
FeatureValue {
  value:          float
  confidence:     float    // 0-1
  source:         enum     // observed, inferred, default
  precision:      enum     // exact, approximate, unknown
  staleness:      enum     // current, recent, old, very_old
}
```

**Node Features:**
- Demographics (age, gender, occupation, criminal history)
- Communication (call frequency, unique contacts, nighttime ratio)
- Financial (transaction count, average amount, cash ratio)
- Geographic (unique locations, travel radius, hotspot proximity)
- Network Position (degree, betweenness, closeness, eigenvector centrality)

**Edge Features:**
- Relationship Type (type, function, semantic specificity)
- Frequency (count, frequency, deviation from baseline)
- Temporal (first seen, last seen, duration, time distribution)
- Strength (multiplexity, reciprocity, persistence, decay rate)
- Anomaly (anomaly score, type, baseline comparison)

### 5.3 Graph Neural Networks

The GNN uses a multilayer architecture to capture functionally distinct networks:

```
LAYER 1: Communication Network
├── Nodes: People, Phones
├── Edges: called, messaged
├── Features: call frequency, duration, timing
└── GNN: GCN

LAYER 2: Financial Network
├── Nodes: People, Accounts
├── Edges: transferred_to, received_from
├── Features: amount, frequency, timing
└── GNN: GCN

LAYER 3: Social Network
├── Nodes: People, Locations, Organizations
├── Edges: family_of, friend_of, member_of
├── Features: relationship strength, duration
└── GNN: GCN

LAYER 4: Co-offending Network
├── Nodes: People, Events
├── Edges: co_offended, witnessed
├── Features: crime type, timing, role
└── GNN: GCN

FUSION LAYER:
├── Input: 4 GCN outputs
├── Method: Cross-layer attention mechanism
└── Output: Unified node/edge representations
```

**GNN Tasks:**

| Task | Input | Output | Use |
|------|-------|--------|-----|
| Link Prediction | Node pairs | P(hidden edge) | Find hidden relationships |
| Community Detection | Graph structure | Community assignments | Identify functional groups |
| Node Classification | Node features + structure | Role classification | Identify hub, broker, bridge roles |
| Anomaly Detection | Node/edge/graph features | Anomaly score | Detect unnatural patterns |

### 5.4 Bayesian Networks

The BN provides probabilistic reasoning about evidence and hypotheses:

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
    ├── Evidence → Evidence (dependency)
    ├── Hypothesis → Hypothesis (competition)
    └── Background → Hypothesis (prior influence)
```

**BN Inference Process:**

1. **Initialize**: Set priors from base rates, set evidence states from Evidence Graph
2. **Belief Propagation**: Update P(hypothesis | evidence) for each evidence node
3. **Competing Hypotheses**: Maintain P(H1), P(H2), ..., P(null) ensuring sum = 1.0
4. **Information Gain**: Calculate IG(E) = H(P(H)) - P(H|E) for each missing evidence E
5. **Contradiction Handling**: Classify contradictions by type (identity, temporal, location, source)

### 5.5 Temporal Models

The temporal layer tracks network evolution:

```
TEMPORAL MODEL:
├── Input: Time-windowed graph snapshots
├── Model: Graph Convolutional Recurrent Network (GCRN)
│   ├── Spatial: GCN captures graph structure
│   ├── Temporal: GRU/LSTM captures evolution
│   └── Output: Node/edge predictions + anomalies
└── Tasks:
    ├── Predict next state of graph
    ├── Detect sudden structural changes
    ├── Identify emerging communities
    └── Model network resilience (hysteresis)
```

**Change Types Detected:**
- GRADUAL: Slow, natural evolution
- SUDDEN: Rapid change (arrest, new member, defection)
- ADVERSARIAL: Deliberate manipulation (decoy connections, framing)
- FRAGMENTATION: Network splits into disconnected components
- CONSOLIDATION: Separate groups merge

### 5.6 Adversarial Defense

The system defends against deliberate manipulation:

```
THREAT 1: GRAPH POISONING
├── Criminal creates fake edges to mislead
├── Detection: Graph autoencoder reconstruction error
└── Action: Flag for manual review, not automatic removal

THREAT 2: IDENTITY MANIPULATION
├── Criminal uses multiple identities or impersonates others
├── Detection: Identity resolution uncertainty propagation
└── Action: Propagate uncertainty through all downstream

THREAT 3: TEMPORAL MANIPULATION
├── Criminal creates false timeline or backdates evidence
├── Detection: Temporal consistency checks
└── Action: Flag inconsistencies for review

THREAT 4: INFORMATION WARFARE
├── Criminal plants misleading information
├── Detection: Source triangulation, behavioral consistency
└── Action: Never rely on single-source intelligence
```

---

## 6. Integration Between Layers

### 6.1 Data Flow

```
FIVE-MODEL PIPELINE (see SYSTEM_STRUCTURE.md):

MODEL 1: EVIDENCE (Stages 1-2)
  Ingestion:     + provenance, integrity, reliability policy
  NLP:           + epistemic tagging, dependency DAG

MODEL 2: PROVENANCE (Stages 3-4)
  Resolution:    + derivation depth, source independence tracking
  Temporal:      + timestamp lineage, provenance chain

MODEL 3: COVERAGE (Stages 3-4)
  Resolution:    + unknown entity preservation, search completeness
  Temporal:      + spatial gaps, NOT_SEARCHED vs NOT_OBSERVED

MODEL 4: ENTITY STATE (Stages 3+5)
  Resolution:    + identity uncertainty propagation, event clustering
  Graph:         + claim-aware edges, temporal relations

MODEL 5: HYPOTHESIS & INVESTIGATION (Stages 5-9)
  Analytics:     + contradiction classification, negative evidence
  Hypothesis:    multi-level alternatives, falsification tracking
  Gap Detection: evidence gaps, information gain, action prioritization

ML LAYER (cross-cutting):
  Stage 1-2:     Feature extraction → FEATURE_STORE
  Stage 6:       GNN inference → GNN_PREDICTIONS_STORE
  Stage 7:       BN inference → BN_INFERENCE_STORE
  Stage 4:       Temporal analysis → TEMPORAL_ANALYSIS_STORE
  Stage 8:       Adversarial defense → ADVERSARIAL_ASSESSMENT_STORE
  Stage 9:       Information gain → INFORMATION_GAIN_STORE
  Stage 10:      Explanations → EXPLANATION_STORE

STAGE 10: CRITIC (reads ALL models, writes audit)
  Stage 10:      ML quality check, Explanation generation
```

### 6.2 ML ↔ Reasoning Layer Interface

```
REASONING LAYER ASKS ML:
├── "What hidden relationships might exist?" → GNN: link_prediction
├── "What communities are present?" → GNN: community_detection
├── "What roles do these entities play?" → GNN: node_classification
├── "Are there anomalous patterns?" → GNN + Temporal: anomaly_detection
├── "What's the probability of each hypothesis?" → BN: inference
├── "Which evidence should we obtain next?" → BN: information_gain
├── "Is this network resilient?" → Temporal: resilience_analysis
└── "Are there adversarial manipulations?" → Adversarial: threat_detection

ML ENGINE RETURNS:
├── Predictions with uncertainty
├── Evidence for each prediction
├── Confidence intervals
├── Alternative explanations
└── Limitations and caveats

RULE: ML predictions are INPUTS to reasoning, not CONCLUSIONS.
      The reasoning layer has final authority over all outputs.
```

### 6.3 ML Stores

```
NEW STORES:
├── FEATURE_STORE              (features with uncertainty metadata)
├── GNN_PREDICTIONS_STORE      (GNN predictions with confidence)
├── BN_INFERENCE_STORE         (BN results with posteriors)
├── TEMPORAL_ANALYSIS_STORE    (temporal analysis with change metrics)
├── ADVERSARIAL_ASSESSMENT_STORE (threat assessments)
├── INFORMATION_GAIN_STORE     (ranked evidence to obtain)
└── EXPLANATION_STORE          (human-readable explanations)
```

### 6.4 Critic Integration

The Critic validates ML outputs before presenting to the investigator:

```
ML QUALITY CHECKS:

1. CONFIDENCE CALIBRATION
   └── Does ML prediction confidence match reality?

2. CONTRADICTION CHECK
   └── Do ML outputs contradict each other?

3. EXPLAINABILITY CHECK
   └── Can we justify why ML made this prediction?

4. UNCERTAINTY CHECK
   └── Is uncertainty properly quantified?

5. SANITY CHECK
   └── Does prediction make sense given evidence?

6. BIAS CHECK
   └── Is prediction biased toward certain entities/patterns?
```

---

## 7. Evaluation

### 7.1 Evaluation Framework

The system is evaluated on multiple dimensions:

**For GNN:**
- Link prediction: AUC-ROC, AUC-PR, F1@K
- Community detection: Modularity, NMI, ARI
- Node classification: F1 (per class), Macro-F1
- Anomaly detection: Precision@K, Recall@K

**For BN:**
- Calibration: Do predicted probabilities match actual frequencies?
- Brier Score: Mean squared error of probability predictions
- Information Gain accuracy: Do IG rankings match actual utility?

**For Investigator Utility:**
- Actionability: Does the system suggest specific next steps?
- Interpretability: Can investigator understand WHY a prediction was made?
- Trust: Does the system acknowledge uncertainty?

### 7.2 Failure Mode Testing

Each of the 15 failure modes is tested with synthetic adversarial scenarios:

| Failure Mode | Test Scenario | Expected Behavior |
|-------------|---------------|-------------------|
| Evidence Independence | News article summarizing FIR | Count as 1 source, not 2 |
| Observation Coverage | Missing CDR data | NOT_SEARCHED, not NOT_OBSERVED |
| Inference Lineage | GNN prediction used as evidence | Reject, mark as inference |
| Background Rates | High-traffic location flagged | Check population baseline |
| Event Deduplication | Same event from 2 sources | Deduplicate, not double-count |
| Identity Uncertainty | Low-confidence entity match | Propagate uncertainty, don't merge |
| Relationship Semantics | Owner vs user vs driver | Preserve specific types |
| Temporal Causality | Money transfer before crime | TEMPORAL_PRECEDENCE, not CAUSAL |
| Cross-Case Contamination | Shared entity in 2 cases | Note, don't connect cases |
| Adversarial Poisoning | Fake edges planted | Detect with anomaly scoring |
| Investigation Feedback | System recommends → finds evidence | Tag as INVESTIGATIVE, not OBSERVATIONAL |
| Hypothesis Competition | Single explanation committed | Maintain null + alternatives |
| Information Gain | "More evidence required" | Specify WHICH evidence |
| Exculpatory Evidence | Evidence of innocence missing | Check if searched for |
| Legal/Evidentiary | Confidence displayed as guilt | "REASONABLE_SUSPICION" only |

### 7.3 Technology Stack

```
GNN FRAMEWORK: PyTorch Geometric (PyG)
BN FRAMEWORK: pgmpy (Python)
TEMPORAL: PyTorch Geometric Temporal
VISUALIZATION: NetworkX + Plotly
DEPLOYMENT: Docker Compose

DATABASE: Neo4j (self-hosted Community Edition)
NLP: spaCy + IndicBERT
API: NestJS
FRONTEND: React + vis.js
LOCAL LLM: Ollama (llama3.1:8b) or OpenAI-compatible API
```

---

## 8. Conclusion

### 8.1 Summary

This paper presents a complete architecture for an AI-powered criminal network analysis system. The architecture addresses the fundamental question of how a system should reason about incomplete, dependent, uncertain, contradictory, and investigation-influenced evidence.

The key contributions are:

1. **A formal evidence model** with provenance tracking, source reliability, and dependency management
2. **A multiplexity-aware graph model** that captures functionally distinct network structures
3. **A confidence decomposition framework** that prevents false certainty
4. **An integrated ML engine** combining GNNs, Bayesian Networks, temporal models, and adversarial defense
5. **A Critic module** that validates ML outputs and prioritizes investigative actions
6. **15 failure mode guards** that prevent common investigation errors

### 8.2 Limitations

The architecture has several limitations:

1. **Data dependency**: The system requires sufficient data quality and quantity to function effectively
2. **Computational cost**: Multilayer GNNs and Bayesian Networks are computationally expensive
3. **Model interpretability**: GNN predictions may be difficult to explain to investigators
4. **Training data**: The system requires labeled training data that may not be available
5. **Adversarial robustness**: While designed for adversarial conditions, the system is not immune to sophisticated attacks

### 8.3 Future Work

Future work should address:

1. **Active learning**: Allow the system to learn from investigator feedback
2. **Transfer learning**: Apply knowledge from one criminal network to another
3. **Federated learning**: Train models across jurisdictions without sharing data
4. **Explainability**: Develop criminal-network-specific explainability methods
5. **Legal compliance**: Ensure outputs meet evidentiary standards (EU AI Act, Daubert/Frye)

### 8.4 Ethical Considerations

The system is designed with ethical considerations:

- **No autonomous decisions**: The system recommends, never decides
- **Transparency**: All reasoning is explainable and auditable
- **Uncertainty acknowledgment**: The system never claims certainty it doesn't have
- **Bias detection**: The system actively checks for and reports bias
- **Human oversight**: All high-impact conclusions require human review

---

## References

Albini, J. L. (1971). The American mafia: Genesis of a legend. Appleton-Century-Crofts.

Anderson, A. (1979). The business of organized crime: A Cosa Nostra family. Hoover Institution.

Bright, D., Brewer, R., & Morselli, C. (2021). Using social network analysis to study crime: Navigating the challenges of criminal justice records. Social Networks, 66, 50-64.

Bright, D., & Delaney, J. J. (2013). Evolution of a drug trafficking network: Mapping changes in network structure and function across time. Global Crime, 14(2-3), 238-260.

Bright, D., Greenhill, C., Britz, T., Ritter, A., & Morselli, C. (2017). Criminal network vulnerabilities and adaptations. Global Crime, 18(4), 424-441.

Bright, D., Greenhill, C., Reynolds, M., Ritter, A., & Morselli, C. (2015). The use of actor-level attributes and centrality measures to identify key actors: A case study of an Australian drug trafficking network. Journal of Contemporary Criminal Justice, 31(3), 262-278.

Bright, D., Sadewo, G. R. P., Lerner, J., Cubitt, T., Dowling, C., & Morgan, A. (2024). Investigating the dynamics of outlaw motorcycle gang co-offending networks: The utility of relational hyper event models. Journal of Quantitative Criminology, 40(3), 445-487.

Calderoni, F. (2012). The structure of drug trafficking mafias: The 'Ndrangheta and cocaine. Crime, Law and Social Change, 58(3), 321-349.

Contreras-Velasco, L., et al. (2025). GNN comparison for hidden alliance detection in criminal networks. Journal of Computational Social Science, 8.

Cressey, D. R. (1969). Theft of the nation: The structure and operations of organized crime in America. Harper & Row.

Fenton, N. E., et al. (2020). The narrative story evidence model for criminal case analysis. In proceedings.

Gambetta, D. (1993). The Sicilian mafia: The business of private protection. Harvard University Press.

Haller, M. H. (1992). Bureaucracy and the mafia: An alternative view. Journal of Contemporary Criminal Justice, 8(1), 1-10.

Hess, H. (1970). Mafia: Zentrale Herrschaft und lokale Gegenmacht. Mohr.

Ianni, F. (1974). Black mafia: Ethnic succession in organized crime. Simon & Schuster.

Kuok, K. L., Liu, H. H., & Lo, W. W. (2025). CrimeKGQA: A Crime Investigation System Based on Knowledge Graph RAG. Springer.

Morselli, C. (2009). Inside criminal networks. Springer.

Morselli, C. (2009b). Hells Angels in springtime. Trends in Organized Crime, 12(2), 145-158.

Morselli, C., & Petit, K. (2007). Law-enforcement disruption of a drug importation network. Global Crime, 8(2), 109-130.

Morselli, C., & Roy, J. (2008). Brokerage qualifications in ringing operations. Criminology, 46(1), 71-98.

Mortera, J., & Thompson, W. C. (2025). Novel evidence evaluation in Bayesian networks. In proceedings.

Rostami, A., & Mondani, H. (2019). Organizing on two wheels: Uncovering the organizational patterns of Hells Angels MC in Sweden. Trends in Organized Crime, 22(1), 34-50.

Schelling, T. C. (1971). What is the business of organized crime? Journal of Public Law, 20, 71-84.

Shi, Y., et al. (2022). A knowledge graph constructed for job-related crimes. Procedia Computer Science, 199, 540-548.

Smith, C. M. (2020). Exogenous shocks, the criminal elite, and increasing gender inequality in Chicago organized crime. American Sociological Review, 85(5), 895-923.

Smith, C. M., & Papachristos, A. V. (2016). Trust thy crooked neighbor: Multiplexity in Chicago organized crime networks. American Sociological Review, 81(4), 644-667.

Varese, F. (2011). Mafias on the move: How organized crime conquers new territories. Princeton University Press.

von Lampe, K. (2016). Organized crime: Analyzing illegal activities, criminal structures, and extra-legal governance. Sage.

von Lampe, K. (2026). Criminal network analysis and the study of organized crime. Global Crime. DOI: 10.1080/17440572.2026.2617567.

Wang, Y., & Honavar, V. (2024). Exploring Graph Neural Networks for Attributed Multilayer Criminal Network Analysis. DHS/CINA Project.

Wang, Y., et al. (2024). STMGNN-ZINB: Spatial-temporal multivariate GNN with Zero-Inflated Negative Binomial for uncertainty-aware crime prediction. arXiv:2408.04193.

Yang, Y. (2023). CrimeGNN: GCN-based modularity optimization for criminal network community detection. arXiv:2311.17479.

Yang, Y. (2023). CrimeGraphNet: GCN-based link prediction for criminal networks. arXiv:2311.18543.

---

## Appendix A: Document Map

| Document | Lines | Purpose |
|----------|-------|---------|
| SYSTEM_STRUCTURE.md | 1,685 | Five analytical models, 15 failure modes, multiplexity |
| INPUT_DATA.md | 1,804 | Epistemic contract, provenance, reliability, dependencies |
| OUTPUTS.md | 1,413 | Confidence decomposition, entity resolution, event clustering |
| THE_CRITIC.md | 1,522 | Falsification, information gain, explanations, ML quality |
| STAGE_REASONERS.md | 1,473 | Reasoning at each pipeline stage, ML calls |
| DATA_FLOW.md | 1,214 | 10-stage pipeline, ML inference stage, run versioning |
| INTERNAL_BINDINGS.md | 934 | Store connections, ML stores, data flow |
| ML_ENGINE.md | 973 | GNN, BN, Temporal, Adversarial architecture |
| ML_MAPPING.md | 525 | How ML connects to all 7 existing docs |
| ARCHITECTURE_PROPOSAL.md | 439 | Team proposal document |
| INTEGRATED_ARCHITECTURE.md | 750 | Combined playbook + reasoning architecture |

**Total: 12,732 lines across 11 documents**

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| CDR | Call Detail Record — automated phone call metadata |
| FIR | First Information Report — police report of a crime |
| GNN | Graph Neural Network — ML model for graph-structured data |
| GCN | Graph Convolutional Network — specific GNN architecture |
| BN | Bayesian Network — probabilistic graphical model |
| GCRN | Graph Convolutional Recurrent Network — temporal GNN |
| Provenance | Where data came from (source, chain of custody) |
| Verification | How well data is verified (unverified to legally established) |
| Multiplexity | Overlap of different relationship types between same entities |
| Dependency DAG | Directed Acyclic Graph tracking evidence derivation |
| Information Gain | Expected reduction in uncertainty from obtaining evidence |
| Falsification | Evidence that would disprove a hypothesis |
| Epistemic Status | Whether something is observation, evidence, inference, or hypothesis |
