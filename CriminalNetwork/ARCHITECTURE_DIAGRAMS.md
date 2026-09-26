# SYSTEM ARCHITECTURE — Complete Visual Reference

> Every structure, every sub-structure, every data flow, every relation — shown visually.

---

## 1. MAIN ARCHITECTURE — Five Models + Ten Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INVESTIGATOR INTERFACE                               │
│                     (React + vis.js Dashboard)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     STAGE 10: CRITIC                                  │ │
│  │  QueryParser · EvidenceAssembler · ConfidenceCalibrator               │ │
│  │  FalsificationChecker · MLQualityCheck · ReportGenerator             │ │
│  │  ActionRecommender                                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                     ↑ reads all stores ↓ writes AUDIT      │
│ ═══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│           ┌───────────────────────────────────────────────┐                │
│           │     5. HYPOTHESIS & INVESTIGATION MODEL       │                │
│           │         competing theories + gaps             │                │
│           └───────────────────┬───────────────────────────┘                │
│                               │                                            │
│  ┌────────────────────────────┼──────────────────────────────────────────┐ │
│  │  STAGE 9: GAP DETECTION    │   STAGE 8: CONTRADICTION                │ │
│  │  GapIdentifier             │   [designed, not implemented]           │ │
│  │  InformationGain           │   SeverityAssessment                     │ │
│  │  ActionPrioritizer         │   SourceCompare                          │ │
│  │                            │   ResolutionSuggester                    │ │
│  ├────────────────────────────┼──────────────────────────────────────────┤ │
│  │  STAGE 7: HYPOTHESIS       │   STAGE 6: ANALYTICS + ML INFERENCE     │ │
│  │  [designed, not implemented]│   Structural·Temporal·Behavioral         │ │
│  │  PatternMatcher            │   AnomalyDetection·CrossSource           │ │
│  │  HypothesisGenerator       │   EventDedup·BackgroundRate              │ │
│  │  EvidenceEvaluator         │   TemporalCausality                      │ │
│  │  GapIdentifier             │                                          │ │
│  ├────────────────────────────┼──────────────────────────────────────────┤ │
│  │  STAGE 5: GRAPH BUILDING   │   GNN · TemporalModels · Adversarial    │ │
│  │  EdgeCreation              │   (ML Inference Sub-Stage)               │ │
│  │  RelationshipSemantics     │                                          │ │
│  │  ProvenanceChain           │                                          │ │
│  └────────────────────────────┴──────────────────────────────────────────┘ │
│                               │                                            │
│           ┌───────────────────┴───────────────────────────┐                │
│           │         4. ENTITY STATE MODEL                 │                │
│           │       identity uncertainty propagation        │                │
│           └───────────────────┬───────────────────────────┘                │
│                               │                                            │
│         ┌─────────────────────┴──────────────────────┐                    │
│         ↓                                            ↓                    │
│ ┌─────────────────────────┐            ┌─────────────────────────┐        │
│ │  2. PROVENANCE MODEL    │            │  3. COVERAGE MODEL      │        │
│ │  where claims came from │            │  what was/wasn't seen   │        │
│ │                         │            │                         │        │
│ │  STAGE 3: Resolution    │            │  STAGE 3: Resolution    │        │
│ │  ├ ContradictDetector   │            │  ├ UnknownEntityHandler │        │
│ │  └ derivation tracking  │            │  └ coverage gaps        │        │
│ │                         │            │                         │        │
│ │  STAGE 4: Temporal      │            │  STAGE 4: Temporal      │        │
│ │  └ timestamp lineage    │            │  └ spatial gaps         │        │
│ └────────────┬────────────┘            └────────────┬────────────┘        │
│              │                                      │                      │
│              └──────────────┬───────────────────────┘                      │
│                             ↓                                              │
│           ┌───────────────────────────────────────────────┐                │
│           │         1. EVIDENCE MODEL                     │                │
│           │    entities / events / relations              │                │
│           └───────────────────┬───────────────────────────┘                │
│                               │                                            │
│  ┌────────────────────────────┼──────────────────────────────────────────┐ │
│  │  STAGE 2: EXTRACTION       │   STAGE 1: INGESTION                    │ │
│  │  EntityExtractor           │   FileParser                             │ │
│  │  RelationExtractor         │   SourceAssessor                         │ │
│  │  RoleAssigner              │   DataQualityChecker                     │ │
│  │  ConfidenceScorer          │   MLFeatureExtract                       │ │
│  └────────────────────────────┴──────────────────────────────────────────┘ │
│                             │                                              │
│  ┌──────────────────────────┴───────────────────────────────────────────┐ │
│  │                       RAW DATA INPUT                                  │ │
│  │   FIR.pdf · CDR.csv · Bank.xlsx · CCTV · Social Media                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ═══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  STAGE → MODEL MAPPING:                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Stage 1 (Ingestion)     → Model 1: Evidence Model                  │  │
│  │  Stage 2 (Extraction)    → Model 1: Evidence Model                  │  │
│  │  Stage 3 (Resolution)    → Model 2: Provenance + Model 3: Coverage  │  │
│  │                            + Model 4: Entity State                   │  │
│  │  Stage 4 (Temporal)      → Model 2: Provenance + Model 3: Coverage  │  │
│  │  Stage 5 (Graph Build)   → Model 4: Entity State + Model 5: Hypo.   │  │
│  │  Stage 6 (Analytics)     → Model 5: Hypothesis & Investigation      │  │
│  │  Stage 7 (Hypothesis)    → Model 5: Hypothesis & Investigation      │  │
│  │                           [designed, not implemented]               │  │
│  │  Stage 8 (Contradiction) → Model 5: Hypothesis & Investigation      │  │
│  │                           [designed, not implemented]               │  │
│  │  Stage 9 (Gap Detection) → Model 5: Hypothesis & Investigation      │  │
│  │  Stage 10 (Critic)       → Reads ALL models, writes audit           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  KEY RULE: Each model stores its own data independently.                    │
│  Models communicate through shared entity IDs, not by merging stores.      │
│  The 5-model split is ANALYTICAL — implementation may use one Neo4j       │
│  database with labeled partitions, or separate stores per model.           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DATA FLOW — Complete Pipeline

```
RAW DATA
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: INGESTION                                              │
│                                                                 │
│ Input:  Raw files (FIR, CDR, Bank, CCTV, Social Media)          │
│                                                                 │
│ Process:                                                        │
│ ├── File Parser → Extract text/structured data                  │
│ ├── Source Assessor → Reliability score per source              │
│ ├── Data Quality → Completeness, format validation              │
│ └── ML Feature Extract → Node/edge features with uncertainty    │
│                                                                 │
│ Output:                                                         │
│ ├── RAW_EVIDENCE_STORE (original data, never modified)          │
│ └── FEATURE_STORE (ML features with uncertainty metadata)       │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: EXTRACTION                                             │
│                                                                 │
│ Input:  RAW_EVIDENCE_STORE                                       │
│                                                                 │
│ Process:                                                        │
│ ├── Entity Extractor → Names, phones, vehicles, locations       │
│ ├── Relation Extractor → Called, met, transferred, etc.          │
│ ├── Role Assigner → Accused, victim, witness                    │
│ └── Confidence Scorer → Extraction confidence per item          │
│                                                                 │
│ Output:                                                         │
│ ├── EXTRACTED_ENTITIES_STORE (before deduplication)             │
│ └── EXTRACTED_RELATIONS_STORE (before deduplication)            │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: RESOLUTION                                             │
│                                                                 │
│ Input:  EXTRACTED_ENTITIES_STORE, EXTRACTED_RELATIONS_STORE     │
│                                                                 │
│ Process:                                                        │
│ ├── Identity Resolution → Match entities across sources         │
│ ├── Merge Decision → Auto-merge (>0.9), flag (0.7-0.9)          │
│ ├── Contradiction Detector → Find conflicts                     │
│ └── Unknown Entity Handler → Preserve unresolved                │
│                                                                 │
│ Output:                                                         │
│ ├── RESOLVED_ENTITIES_STORE (deduplicated entities)             │
│ ├── UNKNOWN_ENTITIES_STORE (unresolved entities)                │
│ └── CONTRADICTIONS_STORE (append-only, versioned)               │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: TEMPORAL                                               │
│                                                                 │
│ Input:  EXTRACTED_RELATIONS_STORE, RESOLVED_ENTITIES_STORE      │
│                                                                 │
│ Process:                                                        │
│ ├── Timestamp Standardize → Normalize formats, timezones        │
│ ├── Temporal Interval → Point vs range modeling                 │
│ └── Spatial Normalize → Geocode, standardize locations          │
│                                                                 │
│ Output:                                                         │
│ └── TEMPORAL_SPATIAL_STORE (normalized time/location)           │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: GRAPH BUILDING                                         │
│                                                                 │
│ Input:  RESOLVED_ENTITIES_STORE, EXTRACTED_RELATIONS_STORE,     │
│         TEMPORAL_SPATIAL_STORE                                   │
│                                                                 │
│ Process:                                                        │
│ ├── Edge Creation → Threshold check (>0.5 confidence)           │
│ ├── Relationship Semantics → Entrepreneurial/Associational/etc  │
│ └── Provenance Chain → Track derivation depth                   │
│                                                                 │
│ Output:                                                         │
│ ├── EVIDENCE_EDGES_STORE (the graph itself)                     │
│ └── PROVENANCE_STORE (derivation chains)                        │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: ANALYTICS + ML INFERENCE                               │
│                                                                 │
│ Input:  EVIDENCE_EDGES_STORE, RESOLVED_ENTITIES_STORE,          │
│         FEATURE_STORE, PROVENANCE_STORE                         │
│                                                                 │
│ Process (Rule-Based):                                           │
│ ├── Structural Analysis → Centrality, community, cliques        │
│ ├── Temporal Analysis → Activity bursts, patterns               │
│ ├── Behavioral Baseline → "Normal" per entity                   │
│ ├── Anomaly Detection → Statistical deviation                   │
│ ├── Cross-Source Correlation → Match events across sources      │
│ ├── Event Deduplication → Same event, multiple observations     │
│ ├── Relationship Opportunity → Observed vs expected             │
│ ├── Background Rate → Individual vs population                  │
│ └── Temporal Causality → Precedence ≠ causation                 │
│                                                                 │
│ Process (ML Inference Sub-Stage):                               │
│ ├── GNN → Link prediction, community detection, role classif.   │
│ ├── Temporal Models → Evolution tracking, change detection      │
│ └── Adversarial Defense → Outlier detection, source triangulate │
│                                                                 │
│ Output:                                                         │
│ ├── ANALYTICS_RESULTS_STORE (computed metrics, anomalies)       │
│ ├── BEHAVIORAL_BASELINES_STORE (per entity baselines)           │
│ ├── GNN_PREDICTIONS_STORE (ML predictions with uncertainty)     │
│ ├── TEMPORAL_ANALYSIS_STORE (ML temporal analysis)              │
│ └── ADVERSARIAL_ASSESSMENT_STORE (threat assessments)           │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: HYPOTHESIS  [designed, not implemented]                │
│                                                                 │
│ Input:  ANALYTICS_RESULTS_STORE, EVIDENCE_EDGES_STORE,          │
│         GNN_PREDICTIONS_STORE, BN_INFERENCE_STORE               │
│                                                                 │
│ Process:                                                        │
│ ├── Pattern Matching → Match against known criminal patterns    │
│ ├── Hypothesis Generation → Competing explanations              │
│ ├── Evidence Evaluation → Support/contradict per hypothesis     │
│ ├── Gap Identification → What evidence is missing               │
│ └── BN Inference → Probabilistic reasoning (via ML)             │
│                                                                 │
│ Output:                                                         │
│ ├── HYPOTHESIS_STORE (competing explanations with scores)       │
│ └── BN_INFERENCE_STORE (posterior distributions)                │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: CONTRADICTION  [designed, not implemented]             │
│                                                                 │
│ Input:  HYPOTHESIS_STORE, EVIDENCE_EDGES_STORE,                 │
│         CONTRADICTIONS_STORE                                     │
│                                                                 │
│ Process:                                                        │
│ ├── Severity Assessment → How severe is this conflict?          │
│ ├── Source Comparison → Which source is more reliable?          │
│ ├── Resolution Suggester → How to resolve                       │
│ └── Impact Assessment → How does this affect hypotheses?        │
│                                                                 │
│ Output:                                                         │
│ └── CONTRADICTIONS_STORE (updated, append-only)                 │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: GAP DETECTION                                          │
│                                                                 │
│ Input:  HYPOTHESIS_STORE, BN_INFERENCE_STORE,                   │
│         INFORMATION_GAIN_STORE                                   │
│                                                                 │
│ Process:                                                        │
│ ├── Gap Identifier → What evidence is missing?                  │
│ ├── Information Gain → Which missing evidence matters most?     │
│ └── Action Prioritizer → What should investigator do next?      │
│                                                                 │
│ Output:                                                         │
│ ├── EVIDENCE_GAPS_STORE (what's missing and why)                │
│ ├── INFORMATION_GAIN_STORE (ranked evidence to obtain)          │
│ └── INVESTIGATOR_ACTIONS_STORE (recommended next steps)         │
└─────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 10: CRITIC                                                │
│                                                                 │
│ Input:  ALL STORES (read-only)                                  │
│                                                                 │
│ Process:                                                        │
│ ├── Query Parser → Understand investigator questions            │
│ ├── Evidence Assembler → Gather all relevant evidence           │
│ ├── Confidence Calibrator → Check if scores match evidence      │
│ ├── Falsification Checker → What would disprove this?           │
│ ├── ML Quality Check → Validate ML predictions                  │
│ ├── Report Generator → Create investigation summaries           │
│ └── Action Recommender → Suggest next steps                     │
│                                                                 │
│ Output:                                                         │
│ ├── AUDIT_STORE (complete audit trail)                          │
│ └── Investigator Interface (reports, explanations, actions)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. EVIDENCE MODEL — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVIDENCE MODEL                               │
│                    (INPUT_DATA.md)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SOURCE-ORIGIN EPISTEMIC CONTRACT            │   │
│  │                                                         │   │
│  │  Every piece of data has 6 properties:                  │   │
│  │                                                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │   │
│  │  │  SOURCE  │ │OBSERVATION│ │  CLAIM   │               │   │
│  │  │ Where it │ │ What was  │ │ What is  │               │   │
│  │  │ came from│ │ seen/     │ │ asserted │               │   │
│  │  │          │ │ recorded  │ │          │               │   │
│  │  └──────────┘ └──────────┘ └──────────┘               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │   │
│  │  │ DERIVED  │ │PROVENANCE│ │VERIFICATION│              │   │
│  │  │ INFO     │ │ CLASS    │ │ STATUS    │               │   │
│  │  │Computed  │ │Epistemic │ │How well   │               │   │
│  │  │from other│ │category  │ │verified   │               │   │
│  │  │data      │ │          │ │           │               │   │
│  │  └──────────┘ └──────────┘ └──────────┘               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CLAIM-AWARE DEPENDENCY DAG                  │   │
│  │                                                         │   │
│  │  FIR #1234 (root source)                                │   │
│  │  ├── Claim A: "Witness saw Rakesh" (independent)       │   │
│  │  ├── Claim B: "CCTV shows person" (independent)        │   │
│  │  ├── News article (derived from Claim A + B)           │   │
│  │  │   └── Social media (derived from news)              │   │
│  │  └── Investigator note (derived from FIR)              │   │
│  │                                                         │   │
│  │  RULE: Claims from same root cannot corroborate each    │   │
│  │        other. Independence = unique root source.        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SOURCE RELIABILITY MATRIX                   │   │
│  │                                                         │   │
│  │              occurrence identity intent location timing │   │
│  │  CDR record    0.95     0.60     N/A    0.70    0.95   │   │
│  │  Bank record   0.98     0.80     N/A    0.30    0.98   │   │
│  │  CCTV footage  0.90     0.70     N/A    0.95    0.85   │   │
│  │  FIR narrative 0.70     0.80     0.50   0.75    0.60   │   │
│  │  News article  0.40     0.30     0.20   0.30    0.20   │   │
│  │  Social media  0.20     0.15     0.10   0.25    0.10   │   │
│  │                                                         │   │
│  │  RULE: Reliability is CONTEXTUAL, not global.           │   │
│  │        CDR strong for "call occurred", weak for         │   │
│  │        "person A held the phone."                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  Raw Files → Epistemic Contract → Claim-Level DAG →             │
│  Reliability Weights → Evidence Graph                           │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── Source ←→ Observation (what source saw)                    │
│  ├── Observation ←→ Claim (what source asserts)                 │
│  ├── Claim ←→ Derived Info (what was computed)                  │
│  ├── Claim ←→ Claim (dependency via DAG)                        │
│  └── All ←→ Provenance Class + Verification Status              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. PROVENANCE MODEL — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROVENANCE MODEL                             │
│                    (SYSTEM_STRUCTURE.md)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PROVENANCE GRAPH                            │   │
│  │                                                         │   │
│  │  RawEvidence                                             │   │
│  │  └──→ ExtractedEntity                                    │   │
│  │       └──→ ResolvedEntity                                │   │
│  │            └──→ EvidenceEdge                             │   │
│  │                 └──→ Inference                           │   │
│  │                      └──→ Hypothesis                     │   │
│  │                                                         │   │
│  │  Each step has:                                          │   │
│  │  ├── derivation_depth (how many steps from raw)         │   │
│  │  ├── is_independent (has own root source?)              │   │
│  │  └── source_chain (list of sources in derivation)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DEPENDENCY TYPES                            │   │
│  │                                                         │   │
│  │  INDEPENDENT: Has own original source                   │   │
│  │  ├── CDR record (automated, objective)                  │   │
│  │  ├── Bank record (automated, objective)                 │   │
│  │  ├── CCTV footage (automated, visual)                   │   │
│  │  └── Device extraction (automated, forensic)            │   │
│  │                                                         │   │
│  │  DEPENDENT: Derived from another source                 │   │
│  │  ├── News article (from police report)                  │   │
│  │  ├── Social media post (from news article)              │   │
│  │  ├── Investigator note (from multiple sources)          │   │
│  │  └── ML inference (from extracted data)                 │   │
│  │                                                         │   │
│  │  MIXED: Partly independent, partly dependent            │   │
│  │  ├── FIR (narrative subjective, may reference data)     │   │
│  │  └── Surveillance report (agent observation, may        │   │
│  │      reference CDR)                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PROVENANCE RULES                            │   │
│  │                                                         │   │
│  │  RULE 1: Every node traces back to RawEvidence          │   │
│  │  RULE 2: Depth is tracked (how many steps from raw)     │   │
│  │  RULE 3: Independence is tracked                        │   │
│  │  RULE 4: Inference cannot corroborate inference         │   │
│  │          from same evidence chain                        │   │
│  │  RULE 5: Maximum depth is configurable (default = 5)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  RawEvidence → ExtractedEntity → ResolvedEntity →               │
│  EvidenceEdge → Hypothesis (each step adds depth)               │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── extracted_from (Entity ← RawEvidence)                      │
│  ├── derived_from (Derived ← Original)                          │
│  ├── inferred_from (Inference ← Evidence)                       │
│  └── hypothesized_from (Hypothesis ← Evidence)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. COVERAGE MODEL — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    COVERAGE MODEL                               │
│                    (SYSTEM_STRUCTURE.md)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              TEMPORAL COVERAGE                           │   │
│  │                                                         │   │
│  │  Per entity, per source:                                │   │
│  │                                                         │   │
│  │  Status Types:                                          │   │
│  │  ├── OBSERVED (data available)                          │   │
│  │  ├── NOT_OBSERVED (searched, found nothing)             │   │
│  │  ├── NOT_SEARCHED (haven't looked)                      │   │
│  │  ├── UNKNOWN (no data exists)                           │   │
│  │  ├── UNAVAILABLE (data exists, can't access)            │   │
│  │  └── DESTROYED (data existed, now gone)                 │   │
│  │                                                         │   │
│  │  Coverage Ratio = observed / total                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SPATIAL COVERAGE                            │   │
│  │                                                         │   │
│  │  Per location:                                          │   │
│  │  ├── Camera coverage                                    │   │
│  │  ├── Tower coverage                                     │   │
│  │  └── Gaps in coverage                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SOURCE COVERAGE                             │   │
│  │                                                         │   │
│  │  Per data type:                                         │   │
│  │  ├── CDR completeness                                   │   │
│  │  ├── Bank record completeness                           │   │
│  │  ├── FIR completeness                                   │   │
│  │  └── Overall data completeness                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              COVERAGE RULES                              │   │
│  │                                                         │   │
│  │  RULE 1: "No record" ≠ "record proves no event"        │   │
│  │  RULE 2: Coverage ratio is computed                     │   │
│  │  RULE 3: Gaps are explicit                              │   │
│  │  RULE 4: Coverage affects confidence                    │   │
│  │  RULE 5: NOT_SEARCHED ≠ NOT_OBSERVED                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  RawData → Temporal/Spatial/Source Coverage →                   │
│  Coverage Ratios → Confidence Adjustment                        │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── Entity ←→ Temporal Coverage (time intervals)               │
│  ├── Location ←→ Spatial Coverage (camera/tower)                │
│  ├── DataType ←→ Source Coverage (completeness)                 │
│  └── All ←→ Coverage Ratio (0-1)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. ENTITY STATE MODEL — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTITY STATE MODEL                           │
│                    (SYSTEM_STRUCTURE.md)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              IDENTITY RESOLUTION                         │   │
│  │                                                         │   │
│  │  UnknownEntity42                                         │   │
│  │       │                                                 │   │
│  │       ▼ possible_identity (confidence: 0.71)            │   │
│  │  Person A (res_001)                                     │   │
│  │       │                                                 │   │
│  │       ├── 47 calls                                      │   │
│  │       ├── Financial relationship                        │   │
│  │       └── Network centrality                            │   │
│  │                                                         │   │
│  │  RULE: Don't merge. Keep link. Propagate uncertainty.   │   │
│  │        All downstream inferences reduced by 0.71.       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ENTITY TYPES                                │   │
│  │                                                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │   │
│  │  │  Person  │ │  Phone   │ │ Vehicle  │               │   │
│  │  │          │ │          │ │          │               │   │
│  │  │ name     │ │ number   │ │ plate    │               │   │
│  │  │ aliases  │ │ carrier  │ │ make     │               │   │
│  │  │ dob      │ │ type     │ │ model    │               │   │
│  │  │ father   │ │ owner    │ │ owner    │               │   │
│  │  │ address  │ │          │ │          │               │   │
│  │  └──────────┘ └──────────┘ └──────────┘               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │   │
│  │  │ Location │ │ Account  │ │  Event   │ │ Unknown  │ │   │
│  │  │          │ │          │ │          │ │ Entity   │ │   │
│  │  │ name     │ │ number   │ │ type     │ │          │ │   │
│  │  │ coords   │ │ bank     │ │ date     │ │ raw_text │ │   │
│  │  │ type     │ │ holder   │ │ location │ │ possible │ │   │
│  │  │          │ │ balance  │ │ parties  │ │ _matches │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RESOLUTION PIPELINE INVARIANT                │   │
│  │                                                         │   │
│  │  INVARIANT: No high-impact inference may depend on      │   │
│  │  unresolved or weakly resolved identity without         │   │
│  │  explicitly propagating that identity uncertainty.      │   │
│  │                                                         │   │
│  │  This is not a reporting feature. It is a pipeline      │   │
│  │  invariant.                                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  ExtractedEntity → Identity Resolution → Merge Decision →       │
│  ResolvedEntity / UnknownEntity → Confidence Propagation        │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── possible_identity (UnknownEntity ←→ ResolvedEntity)        │
│  ├── same_as (ResolvedEntity ←→ ResolvedEntity)                 │
│  ├── source_entities (ResolvedEntity ← ExtractedEntity[])       │
│  └── roles (ResolvedEntity ← Role[])                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. HYPOTHESIS & INVESTIGATION MODEL — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYPOTHESIS & INVESTIGATION MODEL             │
│                    (SYSTEM_STRUCTURE.md)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              HYPOTHESIS STRUCTURE                        │   │
│  │                                                         │   │
│  │  H1: Fraud ring (confidence: 0.72)                      │   │
│  │  ├── supporting: [edge_001, edge_005, ano_001]          │   │
│  │  ├── contradicting: [edge_003]                          │   │
│  │  ├── missing: [bank_statement_Suresh]                   │   │
│  │  └── alternatives: [H2, H3]                             │   │
│  │                                                         │   │
│  │  H2: Legitimate business (confidence: 0.15)             │   │
│  │  ├── supporting: [edge_002]                             │   │
│  │  ├── contradicting: [edge_001, edge_005]                │   │
│  │  └── alternatives: [H1, H3]                             │   │
│  │                                                         │   │
│  │  H3: Coincidence (confidence: 0.08)                     │   │
│  │                                                         │   │
│  │  Null: Nothing criminal (confidence: 0.05)              │   │
│  │                                                         │   │
│  │  RULE: Always maintain null + alternatives.              │   │
│  │        Never commit to single explanation.              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FALSIFICATION                               │   │
│  │                                                         │   │
│  │  For each hypothesis:                                    │   │
│  │  ├── What would disprove this?                          │   │
│  │  ├── Has the investigator searched for it?              │   │
│  │  ├── Was it found or not found?                         │   │
│  │  └── What is the impact if found?                       │   │
│  │                                                         │   │
│  │  Falsification Status:                                   │   │
│  │  ├── NOT_SEARCHED (haven't looked)                      │   │
│  │  ├── SEARCHED_NOT_FOUND (looked, didn't find)           │   │
│  │  ├── FOUND (found, weakens hypothesis)                  │   │
│  │  └── UNAVAILABLE (can't obtain)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              EVIDENCE GAPS                               │   │
│  │                                                         │   │
│  │  Gap: "Bank statement for Suresh"                       │   │
│  │  ├── Why it matters: Distinguishes H1 from H2           │   │
│  │  ├── Information gain: 0.35                             │   │
│  │  ├── Feasibility: 0.80                                 │   │
│  │  └── Priority: HIGH                                     │   │
│  │                                                         │   │
│  │  Gap: "Phone records for Suresh"                        │   │
│  │  ├── Why it matters: Confirms/denies communication      │   │
│  │  ├── Information gain: 0.25                             │   │
│  │  ├── Feasibility: 0.60                                 │   │
│  │  └── Priority: MEDIUM                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              INVESTIGATIVE ACTIONS                       │   │
│  │                                                         │   │
│  │  Action: "Obtain Suresh bank statement"                 │   │
│  │  ├── Addresses gap: bank_statement_Suresh               │   │
│  │  ├── Expected IG: 0.35                                  │   │
│  │  ├── Feasibility: 0.80                                 │   │
│  │  ├── Timeliness: 0.90                                  │   │
│  │  └── Investigative value: 0.252                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  AnalyticsResults → PatternMatch → Hypothesis →                 │
│  EvidenceEval → GapIdentify → InfoGain → ActionPrioritize       │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── supports (EvidenceEdge ←→ Hypothesis)                      │
│  ├── contradicts (EvidenceEdge ←→ Hypothesis)                   │
│  ├── missing (Hypothesis ←→ EvidenceGap)                        │
│  ├── alternative (Hypothesis ←→ Hypothesis)                     │
│  └── addresses (InvestigativeAction ←→ EvidenceGap)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. ML ENGINE — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    ML ENGINE                                    │
│                    (ML_ENGINE.md)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LAYER 1: FEATURE ENGINEERING                │   │
│  │                                                         │   │
│  │  Node Features:                                         │   │
│  │  ├── Demographics (age, gender, occupation)             │   │
│  │  ├── Communication (call freq, unique contacts)         │   │
│  │  ├── Financial (transaction count, avg amount)          │   │
│  │  ├── Geographic (unique locations, travel radius)       │   │
│  │  └── Network Position (centrality, structural role)     │   │
│  │                                                         │   │
│  │  Edge Features:                                         │   │
│  │  ├── Relationship Type (type, function, specificity)    │   │
│  │  ├── Frequency (count, deviation from baseline)         │   │
│  │  ├── Temporal (first_seen, last_seen, duration)         │   │
│  │  ├── Strength (multiplexity, reciprocity, persistence)  │   │
│  │  └── Anomaly (score, type, baseline comparison)         │   │
│  │                                                         │   │
│  │  Graph Features:                                        │   │
│  │  ├── Global (density, avg_degree, clustering)           │   │
│  │  ├── Community (num_communities, modularity)            │   │
│  │  ├── Temporal (growth_rate, churn_rate, stability)      │   │
│  │  └── Anomaly (global_score, sudden_growth)              │   │
│  │                                                         │   │
│  │  Every feature carries:                                 │   │
│  │  ├── confidence (0-1)                                   │   │
│  │  ├── source (observed/inferred/default)                 │   │
│  │  ├── precision (exact/approximate/unknown)              │   │
│  │  └── staleness (current/recent/old/very_old)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LAYER 2: GRAPH NEURAL NETWORKS              │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Layer 1: Communication Network                 │   │   │
│  │  │  ├── Nodes: People, Phones                      │   │   │
│  │  │  ├── Edges: called, messaged                    │   │   │
│  │  │  └── GNN: GCN                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Layer 2: Financial Network                     │   │   │
│  │  │  ├── Nodes: People, Accounts                    │   │   │
│  │  │  ├── Edges: transferred_to, received_from       │   │   │
│  │  │  └── GNN: GCN                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Layer 3: Social Network                        │   │   │
│  │  │  ├── Nodes: People, Locations, Organizations    │   │   │
│  │  │  ├── Edges: family_of, friend_of, member_of     │   │   │
│  │  │  └── GNN: GCN                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Layer 4: Co-offending Network                  │   │   │
│  │  │  ├── Nodes: People, Events                      │   │   │
│  │  │  ├── Edges: co_offended, witnessed              │   │   │
│  │  │  └── GNN: GCN                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Fusion Layer                                   │   │   │
│  │  │  ├── Input: 4 GCN outputs                       │   │   │
│  │  │  ├── Method: Cross-layer attention              │   │   │
│  │  │  └── Output: Unified representations            │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  Tasks:                                                 │   │
│  │  ├── Link Prediction (hidden relationships)             │   │
│  │  ├── Community Detection (functional groups)            │   │
│  │  ├── Node Classification (roles)                        │   │
│  │  └── Anomaly Detection (unnatural patterns)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LAYER 3: BAYESIAN NETWORKS                  │   │
│  │                                                         │   │
│  │  Structure:                                             │   │
│  │  ├── Evidence Nodes (from Evidence Graph)               │   │
│  │  │   └── States: observed, not_observed, unknown        │   │
│  │  ├── Hypothesis Nodes (from Hypothesis Store)           │   │
│  │  │   └── States: true, false                            │   │
│  │  ├── Background Nodes (priors)                          │   │
│  │  │   └── Base rates, population stats                   │   │
│  │  └── Dependency Edges                                   │   │
│  │      ├── Evidence → Hypothesis (supporting)             │   │
│  │      ├── Evidence → Evidence (dependency)               │   │
│  │      ├── Hypothesis → Hypothesis (competition)          │   │
│  │      └── Background → Hypothesis (prior)                │   │
│  │                                                         │   │
│  │  Inference:                                             │   │
│  │  1. Initialize priors                                   │   │
│  │  2. Belief propagation                                  │   │
│  │  3. Competing hypotheses (sum = 1.0)                    │   │
│  │  4. Information gain calculation                        │   │
│  │  5. Contradiction handling                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LAYER 4: TEMPORAL MODELS                    │   │
│  │                                                         │   │
│  │  Model: Graph Convolutional Recurrent Network (GCRN)    │   │
│  │  ├── Spatial: GCN captures graph structure              │   │
│  │  ├── Temporal: GRU/LSTM captures evolution              │   │
│  │  └── Output: Predictions + anomalies                    │   │
│  │                                                         │   │
│  │  Tasks:                                                 │   │
│  │  ├── Predict next state of graph                        │   │
│  │  ├── Detect sudden structural changes                   │   │
│  │  ├── Identify emerging communities                      │   │
│  │  └── Model network resilience (hysteresis)              │   │
│  │                                                         │   │
│  │  Change Types:                                          │   │
│  │  ├── GRADUAL (slow, natural)                            │   │
│  │  ├── SUDDEN (arrest, new member)                        │   │
│  │  ├── ADVERSARIAL (deliberate manipulation)              │   │
│  │  ├── FRAGMENTATION (network splits)                     │   │
│  │  └── CONSOLIDATION (groups merge)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LAYER 5: ADVERSARIAL DEFENSE                │   │
│  │                                                         │   │
│  │  Threats:                                               │   │
│  │  ├── Graph Poisoning (fake edges/nodes)                 │   │
│  │  ├── Identity Manipulation (impersonation)              │   │
│  │  ├── Temporal Manipulation (false timelines)            │   │
│  │  └── Information Warfare (misinformation)               │   │
│  │                                                         │   │
│  │  Defenses:                                              │   │
│  │  ├── Outlier Detection (graph autoencoder)              │   │
│  │  ├── Source Triangulation (never single-source)         │   │
│  │  ├── Behavioral Consistency (claimed vs observed)       │   │
│  │  ├── Graceful Degradation (missing data handling)       │   │
│  │  └── Adversarial Training (perturbed graphs)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DATA FLOW:                                                     │
│  FeatureStore → GNN → GNNPredictionsStore →                     │
│  BN → BNInferenceStore → Temporal → TemporalAnalysisStore →     │
│  Adversarial → AdversarialAssessmentStore →                     │
│  ExplanationStore → Critic                                      │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── FEATURE_STORE ← reads from all input stores                │
│  ├── GNN_PREDICTIONS_STORE ← written by GNN                     │
│  ├── BN_INFERENCE_STORE ← written by BN                         │
│  ├── TEMPORAL_ANALYSIS_STORE ← written by Temporal              │
│  ├── ADVERSARIAL_ASSESSMENT_STORE ← written by Adversarial      │
│  ├── INFORMATION_GAIN_STORE ← written by BN                     │
│  └── EXPLANATION_STORE ← written by all ML components           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. CRITIC — Sub-Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRITIC                                       │
│                    (THE_CRITIC.md)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              QUERY SYSTEM                                │   │
│  │                                                         │   │
│  │  Query Types:                                           │   │
│  │  ├── Entity Query ("Tell me about Rakesh")              │   │
│  │  ├── Relationship Query ("How are they connected?")     │   │
│  │  ├── Timeline Query ("What happened on March 15?")      │   │
│  │  ├── Pattern Query ("Are there anomalies?")             │   │
│  │  ├── Hypothesis Query ("What explains the evidence?")   │   │
│  │  ├── Gap Query ("What don't we know?")                  │   │
│  │  └── Contradiction Query ("Are there conflicts?")       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FALSIFICATION ENGINE                        │   │
│  │                                                         │   │
│  │  For each hypothesis:                                    │   │
│  │  ├── What would disprove this?                          │   │
│  │  ├── Has the investigator searched for it?              │   │
│  │  ├── Was it found or not found?                         │   │
│  │  └── What is the impact?                                │   │
│  │                                                         │   │
│  │  Information Gain:                                       │   │
│  │  ├── IG(E) = H(P(H)) - H(P(H|E))                      │   │
│  │  ├── Rank by IG                                         │   │
│  │  └── Multiply by feasibility × timeliness               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ML QUALITY CHECK                            │   │
│  │                                                         │   │
│  │  Checks:                                                │   │
│  │  ├── Confidence Calibration (do probabilities match?)   │   │
│  │  ├── Contradiction Check (do ML outputs conflict?)      │   │
│  │  ├── Explainability Check (can we justify this?)        │   │
│  │  ├── Uncertainty Check (properly quantified?)           │   │
│  │  ├── Sanity Check (makes sense given evidence?)         │   │
│  │  └── Bias Check (biased toward certain patterns?)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CONFIDENCE CALIBRATION                      │   │
│  │                                                         │   │
│  │  Checks:                                                │   │
│  │  ├── Overconfidence (single source + high confidence)   │   │
│  │  ├── Dependency Inflation (dependent sources counted    │   │
│  │  │   as independent)                                    │   │
│  │  ├── Stale Confidence (old data, high confidence)       │   │
│  │  ├── Calibration Drift (model degraded over time)       │   │
│  │  └── Provenance Depth (too far from raw observation)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ACTION RECOMMENDER                          │   │
│  │                                                         │   │
│  │  InvestigativeValue = EIG × decision_relevance ×        │   │
│  │                       feasibility × timeliness_modifier │   │
│  │                                                         │   │
│  │  Where:                                                 │   │
│  │  ├── EIG = Expected Information Gain                    │   │
│  │  ├── decision_relevance = how relevant to decision      │   │
│  │  ├── feasibility = how easy to obtain                   │   │
│  │  └── timeliness_modifier = base × preservation_risk     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  READS FROM:                                                    │
│  ├── ALL existing stores                                        │
│  ├── GNN_PREDICTIONS_STORE                                      │
│  ├── BN_INFERENCE_STORE                                         │
│  ├── TEMPORAL_ANALYSIS_STORE                                    │
│  ├── ADVERSARIAL_ASSESSMENT_STORE                               │
│  ├── INFORMATION_GAIN_STORE                                     │
│  └── EXPLANATION_STORE                                          │
│                                                                 │
│  WRITES TO:                                                     │
│  ├── AUDIT_STORE (append-only)                                  │
│  └── Investigator Interface                                     │
│                                                                 │
│  DATA FLOW:                                                     │
│  Investigator Query → QueryParser → EvidenceAssembler →         │
│  ConfidenceCalibrator → FalsificationChecker →                  │
│  MLQualityCheck → ReportGenerator → ActionRecommender →         │
│  Investigator Interface                                         │
│                                                                 │
│  RELATIONS:                                                     │
│  ├── reads_from (Critic ← All Stores)                           │
│  ├── writes_to (Critic → AuditStore)                            │
│  ├── validates (Critic → ML Predictions)                        │
│  ├── calibrates (Critic → Confidence Scores)                    │
│  └── recommends (Critic → Investigative Actions)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. STORE MAP — Complete Data Relations

```
┌─────────────────────────────────────────────────────────────────┐
│                    STORE MAP                                    │
│                    (INTERNAL_BINDINGS.md)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              EXISTING STORES                             │   │
│  │                                                         │   │
│  │  RAW_EVIDENCE_STORE                                      │   │
│  │  ├── Written by: IngestionEngine (Stage 1)              │   │
│  │  ├── Read by: ExtractionEngine (Stage 2)                │   │
│  │  └── Purpose: Original data, never modified             │   │
│  │                                                         │   │
│  │  EXTRACTED_ENTITIES_STORE                                │   │
│  │  ├── Written by: ExtractionEngine (Stage 2)             │   │
│  │  ├── Read by: ResolutionEngine (Stage 3)                │   │
│  │  └── Purpose: Raw NER output before dedup               │   │
│  │                                                         │   │
│  │  EXTRACTED_RELATIONS_STORE                               │   │
│  │  ├── Written by: ExtractionEngine (Stage 2)             │   │
│  │  ├── Read by: ResolutionEngine (Stage 3)                │   │
│  │  │           TemporalEngine (Stage 4)                   │   │
│  │  │           GraphBuilderEngine (Stage 5)               │   │
│  │  └── Purpose: Raw relation extraction                   │   │
│  │                                                         │   │
│  │  RESOLVED_ENTITIES_STORE                                 │   │
│  │  ├── Written by: ResolutionEngine (Stage 3)             │   │
│  │  ├── Read by: GraphBuilderEngine (Stage 5)              │   │
│  │  │           AnalyticsEngine (Stage 6)                  │   │
│  │  │           HypothesisEngine (Stage 7)                 │   │
│  │  └── Purpose: Deduplicated entities with canonical IDs  │   │
│  │                                                         │   │
│  │  UNKNOWN_ENTITIES_STORE                                  │   │
│  │  ├── Written by: ResolutionEngine (Stage 3)             │   │
│  │  ├── Read by: GraphBuilderEngine (Stage 5)              │   │
│  │  └── Purpose: Unresolved entities preserved as nodes    │   │
│  │                                                         │   │
│  │  CONTRADICTIONS_STORE (append-only, versioned)          │   │
│  │  ├── Written by: ResolutionEngine (Stage 3)             │   │
│  │  │           ContradictionEngine (Stage 8)              │   │
│  │  │           [Stage 8: designed, not implemented]       │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  │           [designed, not implemented]                │   │
│  │  └── Purpose: All contradictions                        │   │
│  │                                                         │   │
│  │  TEMPORAL_SPATIAL_STORE                                  │   │
│  │  ├── Written by: TemporalEngine (Stage 4)               │   │
│  │  ├── Read by: GraphBuilderEngine (Stage 5)              │   │
│  │  │           AnalyticsEngine (Stage 6)                  │   │
│  │  └── Purpose: Normalized time and location              │   │
│  │                                                         │   │
│  │  EVIDENCE_EDGES_STORE                                    │   │
│  │  ├── Written by: GraphBuilderEngine (Stage 5)           │   │
│  │  ├── Read by: AnalyticsEngine (Stage 6)                 │   │
│  │  │           HypothesisEngine (Stage 7)                 │   │
│  │  │           ContradictionEngine (Stage 8)              │   │
│  │  └── Purpose: The graph itself (nodes + edges)          │   │
│  │                                                         │   │
│  │  PROVENANCE_STORE                                        │   │
│  │  ├── Written by: GraphBuilderEngine (Stage 5)           │   │
│  │  ├── Read by: AnalyticsEngine (Stage 6)                 │   │
│  │  │           HypothesisEngine (Stage 7)                 │   │
│  │  └── Purpose: How each node/edge was derived            │   │
│  │                                                         │   │
│  │  ANALYTICS_RESULTS_STORE                                 │   │
│  │  ├── Written by: AnalyticsEngine (Stage 6)              │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  └── Purpose: Computed metrics, anomalies               │   │
│  │                                                         │   │
│  │  BEHAVIORAL_BASELINES_STORE                              │   │
│  │  ├── Written by: AnalyticsEngine (Stage 6)              │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  └── Purpose: What "normal" looks like per entity       │   │
│  │                                                         │   │
│  │  HYPOTHESIS_STORE                                        │   │
│  │  ├── Written by: HypothesisEngine (Stage 7)             │   │
│  │  │           [designed, not implemented]                │   │
│  │  ├── Read by: ContradictionEngine (Stage 8)             │   │
│  │  │           [designed, not implemented]                │   │
│  │  │           GapDetectionEngine (Stage 9)               │   │
│  │  └── Purpose: Competing explanations with scores        │   │
│  │                                                         │   │
│  │  EVIDENCE_GAPS_STORE                                     │   │
│  │  ├── Written by: GapDetectionEngine (Stage 9)           │   │
│  │  ├── Read by: CriticEngine (Stage 10)                   │   │
│  │  └── Purpose: What's missing and why it matters         │   │
│  │                                                         │   │
│  │  INVESTIGATOR_ACTIONS_STORE                              │   │
│  │  ├── Written by: GapDetectionEngine (Stage 9)           │   │
│  │  ├── Read by: CriticEngine (Stage 10)                   │   │
│  │  └── Purpose: Recommended next steps                    │   │
│  │                                                         │   │
│  │  AUDIT_STORE (append-only)                               │   │
│  │  ├── Written by: ALL stages                             │   │
│  │  ├── Read by: CriticEngine (Stage 10)                   │   │
│  │  └── Purpose: Complete audit trail                      │   │
│  │                                                         │   │
│  │  DEDUPLICATED_EVENTS_STORE                               │   │
│  │  ├── Written by: AnalyticsEngine (Stage 6)              │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  └── Purpose: Deduplicated events from multiple sources │   │
│  │                                                         │   │
│  │  INVESTIGATION_FEEDBACK_STORE                            │   │
│  │  ├── Written by: CriticEngine (Stage 10)                │   │
│  │  ├── Read by: All stages                                │   │
│  │  └── Purpose: Investigator feedback on system outputs   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ML STORES                                   │   │
│  │                                                         │   │
│  │  FEATURE_STORE                                           │   │
│  │  ├── Written by: IngestionEngine (Stage 1)              │   │
│  │  ├── Read by: GNNEngine (Stage 6)                       │   │
│  │  │           BNEngine (Stage 7)                         │   │
│  │  │           TemporalEngine (Stage 4)                   │   │
│  │  │           AdversarialEngine (Stage 8)                │   │
│  │  └── Purpose: ML features with uncertainty metadata     │   │
│  │                                                         │   │
│  │  GNN_PREDICTIONS_STORE                                   │   │
│  │  ├── Written by: GNNEngine (Stage 6)                    │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  │           CriticEngine (Stage 10)                    │   │
│  │  └── Purpose: GNN predictions with ConfidenceSchema     │   │
│  │                                                         │   │
│  │  BN_INFERENCE_STORE                                      │   │
│  │  ├── Written by: BNEngine (Stage 7)                     │   │
│  │  │           [designed, not implemented]                │   │
│  │  ├── Read by: GapDetectionEngine (Stage 9)              │   │
│  │  │           CriticEngine (Stage 10)                    │   │
│  │  └── Purpose: BN inference with posterior distributions │   │
│  │                                                         │   │
│  │  TEMPORAL_ANALYSIS_STORE                                 │   │
│  │  ├── Written by: TemporalEngine (Stage 4)               │   │
│  │  ├── Read by: HypothesisEngine (Stage 7)                │   │
│  │  │           CriticEngine (Stage 10)                    │   │
│  │  └── Purpose: Temporal analysis with change metrics     │   │
│  │                                                         │   │
│  │  ADVERSARIAL_ASSESSMENT_STORE                            │   │
│  │  ├── Written by: AdversarialEngine (Stage 8)            │   │
│  │  │           [designed, not implemented]                │   │
│  │  ├── Read by: CriticEngine (Stage 10)                   │   │
│  │  └── Purpose: Threat assessments with ConfidenceSchema  │   │
│  │                                                         │   │
│  │  INFORMATION_GAIN_STORE                                  │   │
│  │  ├── Written by: BNEngine (Stage 7)                     │   │
│  │  ├── Read by: GapDetectionEngine (Stage 9)              │   │
│  │  └── Purpose: Ranked evidence to obtain                 │   │
│  │                                                         │   │
│  │  EXPLANATION_STORE                                       │   │
│  │  ├── Written by: GNNEngine, BNEngine,                   │   │
│  │  │           TemporalEngine, AdversarialEngine           │   │
│  │  ├── Read by: CriticEngine (Stage 10)                   │   │
│  │  └── Purpose: Human-readable explanations for ML        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              STORE INTERACTION MAP                       │   │
│  │                                                         │   │
│  │  IngestionEngine → writes to → RAW_EVIDENCE_STORE       │   │
│  │                        → writes to → FEATURE_STORE       │   │
│  │                                                         │   │
│  │  ExtractionEngine → reads from → RAW_EVIDENCE_STORE     │   │
│  │                   → writes to → EXTRACTED_ENTITIES      │   │
│  │                   → writes to → EXTRACTED_RELATIONS     │   │
│  │                                                         │   │
│  │  ResolutionEngine → reads from → EXTRACTED_ENTITIES     │   │
│  │                   → reads from → EXTRACTED_RELATIONS    │   │
│  │                   → writes to → RESOLVED_ENTITIES       │   │
│  │                   → writes to → UNKNOWN_ENTITIES        │   │
│  │                   → writes to → CONTRADICTIONS          │   │
│  │                                                         │   │
│  │  TemporalEngine → reads from → EXTRACTED_RELATIONS      │   │
│  │                 → reads from → RESOLVED_ENTITIES        │   │
│  │                 → writes to → TEMPORAL_SPATIAL          │   │
│  │                 → writes to → TEMPORAL_ANALYSIS (ML)    │   │
│  │                                                         │   │
│  │  GraphBuilderEngine → reads from → RESOLVED_ENTITIES    │   │
│  │                    → reads from → EXTRACTED_RELATIONS   │   │
│  │                    → reads from → TEMPORAL_SPATIAL      │   │
│  │                    → writes to → EVIDENCE_EDGES         │   │
│  │                    → writes to → PROVENANCE             │   │
│  │                                                         │   │
│  │  AnalyticsEngine → reads from → EVIDENCE_EDGES          │   │
│  │                  → reads from → RESOLVED_ENTITIES       │   │
│  │                  → reads from → FEATURE_STORE (ML)      │   │
│  │                  → writes to → ANALYTICS_RESULTS        │   │
│  │                  → writes to → BEHAVIORAL_BASELINES     │   │
│  │                  → writes to → GNN_PREDICTIONS (ML)     │   │
│  │                                                         │   │
│  │  HypothesisEngine → reads from → ANALYTICS_RESULTS      │   │
│  │                   → reads from → EVIDENCE_EDGES         │   │
│  │                   → reads from → GNN_PREDICTIONS (ML)   │   │
│  │                   → reads from → BN_INFERENCE (ML)      │   │
│  │                   → writes to → HYPOTHESIS              │   │
│  │                   [designed, not implemented]           │   │
│  │                                                         │   │
│  │  ContradictionEngine → reads from → HYPOTHESIS          │   │
│  │                     → reads from → EVIDENCE_EDGES       │   │
│  │                     → writes to → CONTRADICTIONS        │   │
│  │                     [designed, not implemented]         │   │
│  │                                                         │   │
│  │  GapDetectionEngine → reads from → HYPOTHESIS           │   │
│  │                    → reads from → BN_INFERENCE (ML)     │   │
│  │                    → reads from → INFORMATION_GAIN (ML) │   │
│  │                    → writes to → EVIDENCE_GAPS          │   │
│  │                    → writes to → INVESTIGATOR_ACTIONS   │   │
│  │                                                         │   │
│  │  CriticEngine → reads from → ALL STORES                 │   │
│  │              → writes to → AUDIT                        │   │
│  │              → writes to → INVESTIGATION_FEEDBACK       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. RELATIONS MODEL — Complete

```
┌─────────────────────────────────────────────────────────────────┐
│                    RELATIONS MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ENTITY RELATIONS                            │   │
│  │                                                         │   │
│  │  Person ←──called──→ Phone                              │   │
│  │  Person ←──owns──→ Vehicle                              │   │
│  │  Person ←──registered_owner──→ Vehicle                  │   │
│  │  Person ←──actual_user──→ Vehicle                       │   │
│  │  Person ←──driver──→ Vehicle                            │   │
│  │  Person ←──family_of──→ Person                          │   │
│  │  Person ←──friend_of──→ Person                          │   │
│  │  Person ←──associate_of──→ Person                       │   │
│  │  Person ←──works_with──→ Person                         │   │
│  │  Person ←──member_of──→ Organization                    │   │
│  │  Person ←──lives_at──→ Location                         │   │
│  │  Person ←──works_at──→ Location                         │   │
│  │  Person ←──met_at──→ Location                           │   │
│  │  Person ←──transferred_to──→ Account                    │   │
│  │  Person ←──received_from──→ Account                     │   │
│  │  Person ←──suspects──→ Event                            │   │
│  │  Person ←──victims──→ Event                             │   │
│  │  Person ←──witnesses──→ Event                           │   │
│  │  Person ←──co_offended──→ Event                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RELATIONSHIP TYPES (by function)            │   │
│  │                                                         │   │
│  │  ENTREPRENEURIAL:                                        │   │
│  │  ├── business_partner                                   │   │
│  │  ├── supplier                                            │   │
│  │  ├── customer                                            │   │
│  │  ├── distributor                                         │   │
│  │  └── money_launderer                                     │   │
│  │                                                         │   │
│  │  ASSOCIATIONAL:                                          │   │
│  │  ├── family_member                                       │   │
│  │  ├── friend                                              │   │
│  │  ├── club_member                                         │   │
│  │  ├── neighbor                                            │   │
│  │  └── schoolmate                                          │   │
│  │                                                         │   │
│  │  QUASI-GOVERNMENTAL:                                     │   │
│  │  ├── dispute_adjudicator                                 │   │
│  │  ├── rule_setter                                         │   │
│  │  ├── enforcer                                            │   │
│  │  └── protector                                           │   │
│  │                                                         │   │
│  │  UPPERWORLD BRIDGES:                                     │   │
│  │  ├── political_backer                                    │   │
│  │  ├── corrupt_official                                    │   │
│  │  └── legitimate_front                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              EVIDENCE RELATIONS                          │   │
│  │                                                         │   │
│  │  EvidenceEdge {                                         │   │
│  │    id: string                                           │   │
│  │    source_id: string                                    │   │
│  │    target_id: string                                    │   │
│  │    relationship_type: string                            │   │
│  │    edge_type: string                                    │   │
│  │    confidence: ConfidenceSchema                         │   │
│  │    supporting_evidence: string[]                        │   │
│  │    contradicting_evidence: string[]                     │   │
│  │    temporal_info: TemporalInfo                          │   │
│  │    provenance_chain: string[]                           │   │
│  │    created_at: datetime                                 │   │
│  │    updated_at: datetime                                 │   │
│  │  }                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PROVENANCE RELATIONS                        │   │
│  │                                                         │   │
│  │  RawEvidence ──extracted_from──→ ExtractedEntity         │   │
│  │  RawEvidence ──extracted_from──→ ExtractedRelation       │   │
│  │  ExtractedEntity ──resolved_to──→ ResolvedEntity         │   │
│  │  ResolvedEntity ──possible_identity──→ UnknownEntity     │   │
│  │  ResolvedEntity ──has_edge──→ EvidenceEdge               │   │
│  │  EvidenceEdge ──supports──→ Hypothesis                   │   │
│  │  EvidenceEdge ──contradicts──→ Hypothesis                │   │
│  │  Hypothesis ──alternative──→ Hypothesis                  │   │
│  │  Hypothesis ──has_gap──→ EvidenceGap                     │   │
│  │  EvidenceGap ──addresses_by──→ InvestigativeAction       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ML RELATIONS                                │   │
│  │                                                         │   │
│  │  FEATURE_STORE ──feeds──→ GNNEngine                      │   │
│  │  FEATURE_STORE ──feeds──→ BNEngine                       │   │
│  │  FEATURE_STORE ──feeds──→ TemporalEngine                 │   │
│  │  FEATURE_STORE ──feeds──→ AdversarialEngine              │   │
│  │  GNNEngine ──produces──→ GNN_PREDICTIONS_STORE           │   │
│  │  BNEngine ──produces──→ BN_INFERENCE_STORE               │   │
│  │  TemporalEngine ──produces──→ TEMPORAL_ANALYSIS_STORE    │   │
│  │  AdversarialEngine ──produces──→ ADVERSARIAL_ASSESSMENT  │   │
│  │  BNEngine ──produces──→ INFORMATION_GAIN_STORE           │   │
│  │  All ML ──produces──→ EXPLANATION_STORE                  │   │
│  │  EXPLANATION_STORE ──feeds──→ CriticEngine                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. GRAPH DATABASE SCHEMA — Neo4j Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEO4J GRAPH DATABASE SCHEMA                              │
│                    Node Labels · Relationship Types · Properties            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     NODE LABELS                                      │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │   :Person     │  │   :Phone      │  │  :Vehicle    │             │   │
│  │  │              │  │              │  │              │             │   │
│  │  │ id: string   │  │ id: string   │  │ id: string   │             │   │
│  │  │ name: string │  │ number: str  │  │ plate: str   │             │   │
│  │  │ aliases: []  │  │ carrier: str │  │ make: str    │             │   │
│  │  │ dob: date    │  │ type: str    │  │ model: str   │             │   │
│  │  │ gender: str  │  │ owner_id: str│  │ color: str   │             │   │
│  │  │ father: str  │  │              │  │ owner_id: str│             │   │
│  │  │ address: str │  │              │  │              │             │   │
│  │  │ occupation   │  │              │  │              │             │   │
│  │  │ confidence   │  │              │  │              │             │   │
│  │  │ source_id    │  │              │  │              │             │   │
│  │  │ created_at   │  │              │  │              │             │   │
│  │  │ updated_at   │  │              │  │              │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │  :Location    │  │  :Account     │  │   :Event     │             │   │
│  │  │              │  │              │  │              │             │   │
│  │  │ id: string   │  │ id: string   │  │ id: string   │             │   │
│  │  │ name: string │  │ number: str  │  │ type: str    │             │   │
│  │  │ coords: str  │  │ bank: str    │  │ date: datetime│            │   │
│  │  │ type: str    │  │ holder: str  │  │ location_id  │             │   │
│  │  │ address: str │  │ balance: num │  │ parties: []  │             │   │
│  │  │ city: str    │  │ type: str    │  │ description  │             │   │
│  │  │ state: str   │  │ opened: date │  │ confidence   │             │   │
│  │  │ pincode: str │  │ status: str  │  │ source_id    │             │   │
│  │  │ confidence   │  │ confidence   │  │ created_at   │             │   │
│  │  │ source_id    │  │ source_id    │  │              │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │ :UnknownEntity│ │ :Organization │  │ :Device      │             │   │
│  │  │              │  │              │  │              │             │   │
│  │  │ id: string   │  │ id: string   │  │ id: string   │             │   │
│  │  │ raw_text: str│  │ name: str    │  │ type: str    │             │   │
│  │  │ possible_    │  │ type: str    │  │ imei: str    │             │   │
│  │  │  matches: [] │  │ registration │  │ serial: str  │             │   │
│  │  │ first_seen   │  │ address: str │  │ owner_id: str│             │   │
│  │  │ last_seen    │  │ confidence   │  │ confidence   │             │   │
│  │  │ confidence   │  │ source_id    │  │ source_id    │             │   │
│  │  │ source_id    │  │              │  │              │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│  │  │  :Source       │ │ :RawEvidence  │  │ :Hypothesis  │             │   │
│  │  │              │  │              │  │              │             │   │
│  │  │ id: string   │  │ id: string   │  │ id: string   │             │   │
│  │  │ type: str    │  │ content: str │  │ statement    │             │   │
│  │  │ reliability  │  │ file_path    │  │ confidence   │             │   │
│  │  │  _matrix:{}  │  │ file_type    │  │ supporting[] │             │   │
│  │  │ jurisdiction │  │ source_id    │  │ contradict[] │             │   │
│  │  │ collected_by │  │ extracted_at │  │ missing[]    │             │   │
│  │  │ collected_at │  │ hash: str    │  │ alternatives │             │   │
│  │  │ hash: str    │  │              │  │ created_at   │             │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│  │                                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐                                │   │
│  │  │ :EvidenceGap  │  │ :Action       │                                │   │
│  │  │              │  │              │                                │   │
│  │  │ id: string   │  │ id: string   │                                │   │
│  │  │ description  │  │ description  │                                │   │
│  │  │ why_it_      │  │ addresses[]  │                                │   │
│  │  │  matters     │  │ expected_ig  │                                │   │
│  │  │ info_gain    │  │ feasibility  │                                │   │
│  │  │ feasibility  │  │ timeliness   │                                │   │
│  │  │ priority     │  │ priority     │                                │   │
│  │  └──────────────┘  └──────────────┘                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  RELATIONSHIP TYPES                                  │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  COMMUNICATION RELATIONSHIPS                                 │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:CALLED {                                       │   │   │
│  │  │    call_count: int,                                         │   │   │
│  │  │    total_duration: int,                                     │   │   │
│  │  │    first_seen: datetime,                                    │   │   │
│  │  │    last_seen: datetime,                                     │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Phone)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:MESSED {                                       │   │   │
│  │  │    msg_count: int,                                          │   │   │
│  │  │    first_seen: datetime,                                    │   │   │
│  │  │    last_seen: datetime,                                     │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Phone)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Phone)-[:ASSOCIATED_WITH {                               │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    evidence_type: string,                                   │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Phone)                                               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  FINANCIAL RELATIONSHIPS                                     │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:TRANSFERRED_TO {                               │   │   │
│  │  │    amount: float,                                           │   │   │
│  │  │    currency: string,                                        │   │   │
│  │  │    transaction_date: datetime,                              │   │   │
│  │  │    reference: string,                                       │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Account)                                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Account)-[:TRANSFERRED_TO {                              │   │   │
│  │  │    amount: float,                                           │   │   │
│  │  │    transaction_date: datetime,                              │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Account)                                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:OWNS_ACCOUNT]->(:Account)                      │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  VEHICLE RELATIONSHIPS                                       │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:REGISTERED_OWNER {                             │   │   │
│  │  │    since: date,                                             │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Vehicle)                                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:ACTUAL_USER {                                  │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    evidence_type: string,                                   │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Vehicle)                                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:DRIVER {                                       │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Vehicle)                                             │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  SOCIAL / PERSONAL RELATIONSHIPS                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:FAMILY_OF {                                    │   │   │
│  │  │    relation: string,  (father/brother/wife/son/etc)         │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:FRIEND_OF {                                    │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:ASSOCIATE_OF {                                 │   │   │
│  │  │    context: string,                                         │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:WORKS_WITH {                                   │   │   │
│  │  │    context: string,                                         │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  LOCATION RELATIONSHIPS                                      │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:LIVES_AT {                                     │   │   │
│  │  │    since: date,                                             │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Location)                                            │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:WORKS_AT {                                     │   │   │
│  │  │    since: date,                                             │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Location)                                            │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:VISITED {                                      │   │   │
│  │  │    visit_date: datetime,                                    │   │   │
│  │  │    duration_min: int,                                       │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Location)                                            │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Event)-[:OCCURRED_AT]->(:Location)                       │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Phone)-[:TOWER_LOCATION {                                │   │   │
│  │  │    timestamp: datetime,                                     │   │   │
│  │  │    duration_sec: int,                                       │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Location)                                            │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  EVENT / CRIME RELATIONSHIPS                                 │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:SUSPECT_OF {                                   │   │   │
│  │  │    role: string,                                            │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Event)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:VICTIM_OF {                                    │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Event)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:WITNESS_OF {                                   │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Event)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:CO_OFFENDED {                                  │   │   │
│  │  │    role: string,                                            │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Event)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Event)-[:LED_TO]->(:Event)                               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  ORGANIZATION RELATIONSHIPS                                  │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:MEMBER_OF {                                    │   │   │
│  │  │    role: string,                                            │   │   │
│  │  │    since: date,                                             │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    source_id: string                                        │   │   │
│  │  │  }]->(:Organization)                                        │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Organization)-[:LOCATED_AT]->(:Location)                 │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Organization)-[:OWNS_ACCOUNT]->(:Account)                │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  PROVENANCE / META RELATIONSHIPS                             │   │   │
│  │  │                                                             │   │   │
│  │  │  (:RawEvidence)-[:EXTRACTED {                               │   │   │
│  │  │    extraction_method: string,                               │   │   │
│  │  │    confidence: float                                        │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  │                                                             │   │   │
│  │  │  (:RawEvidence)-[:EXTRACTED {                               │   │   │
│  │  │    extraction_method: string,                               │   │   │
│  │  │    confidence: float                                        │   │   │
│  │  │  }]->(:Phone)                                               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:RawEvidence)-[:OBSERVED]->(:Event)                       │   │   │
│  │  │                                                             │   │   │
│  │  │  (:RawEvidence)-[:SUPPORTS]->(:Hypothesis)                  │   │   │
│  │  │  (:RawEvidence)-[:CONTRADICTS]->(:Hypothesis)               │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Hypothesis)-[:ALTERNATIVE_TO]->(:Hypothesis)             │   │   │
│  │  │  (:Hypothesis)-[:REQUIRES_GAP]->(:EvidenceGap)              │   │   │
│  │  │  (:EvidenceGap)-[:ADDRESSED_BY]->(:Action)                  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  IDENTITY RESOLUTION RELATIONSHIPS                           │   │   │
│  │  │                                                             │   │   │
│  │  │  (:UnknownEntity)-[:POSSIBLE_IDENTITY {                     │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    evidence: string[],                                      │   │   │
│  │  │    method: string                                           │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  │                                                             │   │   │
│  │  │  (:Person)-[:SAME_AS {                                      │   │   │
│  │  │    confidence: float,                                       │   │   │
│  │  │    evidence: string[]                                       │   │   │
│  │  │  }]->(:Person)                                              │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  GRAPH SCHEMA EXAMPLE                                │   │
│  │                                                                     │   │
│  │                        ┌──────────┐                                 │   │
│  │              ┌────────→│ :Phone   │←───┐                            │   │
│  │              │ CALLED  │ 9876543  │    │ CALLED                     │   │
│  │              │         └──────────┘    │                            │   │
│  │              │                         │                            │   │
│  │    ┌─────────┴──┐              ┌───────┴──┐                        │   │
│  │    │  :Person    │              │  :Person  │                        │   │
│  │    │  Rakesh     │──FAMILY_OF──→│  Suresh   │                        │   │
│  │    │  (accused)  │              │  (brother)│                        │   │
│  │    └──────┬─────┘              └───────┬──┘                        │   │
│  │           │                            │                            │   │
│  │     OWNS_ACCOUNT               TRANSFERRED_TO                       │   │
│  │           │                            │                            │   │
│  │    ┌──────┴─────┐              ┌───────┴──┐                        │   │
│  │    │  :Account   │←─────────────│  :Account │                        │   │
│  │    │  SBI-XXX    │ TRANSFERRED  │  HDFC-YYY │                        │   │
│  │    │  (Rakesh)   │    TO        │  (Suresh) │                        │   │
│  │    └────────────┘              └──────────┘                        │   │
│  │                                                                     │   │
│  │    ┌────────────────┐         ┌──────────┐                         │   │
│  │    │    :Event       │         │ :Location │                         │   │
│  │    │  Fraud-2024-001 │──OCCURRED_AT──→│ Delhi     │                         │   │
│  │    │  (FIR #1234)    │         │           │                         │   │
│  │    └───────┬────────┘         └──────────┘                         │   │
│  │            │                                                        │   │
│  │      SUSPECT_OF      CO_OFFENDED                                    │   │
│  │            │                │                                        │   │
│  │    ┌───────┴────┐   ┌──────┴─────┐                                 │   │
│  │    │  :Person    │   │  :Person    │                                 │   │
│  │    │  Rakesh     │   │  Amit       │                                 │   │
│  │    └────────────┘   └────────────┘                                 │   │
│  │                                                                     │   │
│  │  Provenance:                                                        │   │
│  │    (:RawEvidence [FIR PDF])──EXTRACTED──→(:Person [Rakesh])         │   │
│  │    (:RawEvidence [CDR CSV])──EXTRACTED──→(:Phone [9876543])         │   │
│  │    (:RawEvidence [CDR CSV])──SUPPORTS──→(:Hypothesis [H1])          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  CONFIDENCE SCHEMA (on all relationships)            │   │
│  │                                                                     │   │
│  │  Every relationship carries:                                        │   │
│  │  {                                                                   │   │
│  │    confidence: float,          // 0.0 - 1.0                         │   │
│  │    evidence_count: int,        // supporting observations           │   │
│  │    contradiction_count: int,   // contradicting observations        │   │
│  │    source_reliability: float,  // from Source.reliability_matrix    │   │
│  │    derivation_depth: int,      // 0=raw, 1=inferred, 2=derived     │   │
│  │    is_independent: bool,       // unique root source?               │   │
│  │    last_verified: datetime,    // when last corroborated            │   │
│  │    staleness: enum             // current/recent/old/very_old       │   │
│  │  }                                                                   │   │
│  │                                                                     │   │
│  │  RULE: confidence NEVER increases without new independent evidence. │   │
│  │  RULE: derivation_depth > 2 requires explicit justification.        │   │
│  │  RULE: is_independent=false means source is derived from another.   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  NEO4J CONSTRAINTS & INDEXES                         │   │
│  │                                                                     │   │
│  │  // Unique ID constraints                                            │   │
│  │  CREATE CONSTRAINT person_id IF NOT EXISTS                           │   │
│  │    FOR (p:Person) REQUIRE p.id IS UNIQUE                             │   │
│  │  CREATE CONSTRAINT phone_id IF NOT EXISTS                            │   │
│  │    FOR (ph:Phone) REQUIRE ph.id IS UNIQUE                            │   │
│  │  CREATE CONSTRAINT vehicle_id IF NOT EXISTS                          │   │
│  │    FOR (v:Vehicle) REQUIRE v.id IS UNIQUE                            │   │
│  │  CREATE CONSTRAINT location_id IF NOT EXISTS                         │   │
│  │    FOR (l:Location) REQUIRE l.id IS UNIQUE                           │   │
│  │  CREATE CONSTRAINT account_id IF NOT EXISTS                          │   │
│  │    FOR (a:Account) REQUIRE a.id IS UNIQUE                            │   │
│  │  CREATE CONSTRAINT event_id IF NOT EXISTS                            │   │
│  │    FOR (e:Event) REQUIRE e.id IS UNIQUE                              │   │
│  │  CREATE CONSTRAINT source_id IF NOT EXISTS                           │   │
│  │    FOR (s:Source) REQUIRE s.id IS UNIQUE                             │   │
│  │  CREATE CONSTRAINT org_id IF NOT EXISTS                              │   │
│  │    FOR (o:Organization) REQUIRE o.id IS UNIQUE                       │   │
│  │                                                                     │   │
│  │  // Performance indexes                                              │   │
│  │  CREATE INDEX person_name IF NOT EXISTS                              │   │
│  │    FOR (p:Person) ON (p.name)                                        │   │
│  │  CREATE INDEX phone_number IF NOT EXISTS                             │   │
│  │    FOR (ph:Phone) ON (ph.number)                                     │   │
│  │  CREATE INDEX vehicle_plate IF NOT EXISTS                            │   │
│  │    FOR (v:Vehicle) ON (v.plate)                                      │   │
│  │  CREATE INDEX event_date IF NOT EXISTS                               │   │
│  │    FOR (e:Event) ON (e.date)                                         │   │
│  │  CREATE INDEX confidence IF NOT EXISTS                               │   │
│  │    FOR ()-[r]-() ON (r.confidence)                                   │   │
│  │                                                                     │   │
│  │  // Full-text search                                                 │   │
│  │  CREATE FULLTEXT INDEX entity_search IF NOT EXISTS                   │   │
│  │    FOR (n:Person|Phone|Vehicle|Location|Organization)                │   │
│  │    ON EACH [n.name, n aliases, n.address]                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. CROSS-REFERENCES

| Structure | Document | Section |
|-----------|----------|---------|
| Evidence Model | INPUT_DATA.md | Section 0: Source-Origin Epistemic Contract |
| Provenance Model | SYSTEM_STRUCTURE.md | Layer 2: Provenance Graph |
| Coverage Model | SYSTEM_STRUCTURE.md | Layer 3: Coverage Model |
| Entity State Model | SYSTEM_STRUCTURE.md | Layer 4: Entity State |
| Hypothesis Model | SYSTEM_STRUCTURE.md | Layer 5: Hypothesis & Investigation |
| ML Engine | ML_ENGINE.md | All sections |
| Critic | THE_CRITIC.md | All sections |
| Data Flow | DATA_FLOW.md | All stages |
| Stage Reasoners | STAGE_REASONERS.md | All stages |
| Store Connections | INTERNAL_BINDINGS.md | All stores |
| Output Formats | OUTPUTS.md | All stages |
| ML Integration | ML_MAPPING.md | All mappings |
| Graph DB Schema | Neo4j | Node labels, relationship types, constraints |

---

## 14. REVISION 3+ ENTITY RELATIONSHIPS

### FIR Lifecycle Dimensions (replaces FirStatus enum)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIR LIFECYCLE DIMENSIONS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FIR entity has THREE independent lifecycle dimensions:             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  investigation_status (FIRInvestigationStatus enum)        │     │
│  │                                                           │     │
│  │  OPEN → UNDER_INVESTIGATION → CHARGE_SHEET_FILED → CLOSED│     │
│  │   ↑            ↑                     ↑             ↑       │     │
│  │   └────────────┴─────────────────────┴─────────────┘       │     │
│  │            (each transition is timestamped)                │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  legal_disposition (FIRLegalDisposition enum)              │     │
│  │                                                           │     │
│  │  PENDING → CONVICTION | ACQUITTAL | DISMISSED | COMPOUNDED│     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  record_status (FIRRecordStatus enum)                     │     │
│  │                                                           │     │
│  │  ACTIVE → SEALED | ARCHIVED                               │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  Each dimension transitions independently with timestamp tracking. │
│  FIRInvestigationStatus, FIRLegalDisposition, FIRRecordStatus      │
│  replace the removed FirStatus enum.                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Case ↔ FIR: 1:1 Relationship

```
┌──────────────────────┐       ┌──────────────────────────────────────┐
│       Case            │       │        FIR                            │
├──────────────────────┤       ├──────────────────────────────────────┤
│ id (PK)              │◄──────│ case_id (FK, UNIQUE — 1:1 invariant)│
│ jurisdiction_node_id │       │ fir_number (jurisdiction-scoped)     │
│ location_id          │       │ jurisdiction_node_id                 │
│ case_status          │       │ description                          │
│ description          │       │ filed_by_id                          │
└──────────────────────┘       │                                      │
                               │ investigation_status                 │
                               │ legal_disposition                    │
                               │ record_status                        │
                               └──────────────────────────────────────┘

Invariant: One Case has exactly one FIR (case_id is UNIQUE on FIR)
FIR number uniqueness: @@unique([firNumber, jurisdictionNodeId])
```

### CaseRelationship & History

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CASE RELATIONSHIPS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CaseRelationship {                                                │
│    id: string (PK)                                                 │
│    source_case_id: string (FK → Case)                              │
│    target_case_id: string (FK → Case)                              │
│    relationship_type: string  (e.g., SAME_INCIDENT,                │
│                                RELATED_EVIDENCE, COMMON_ACCUSED)   │
│    confidence: float                                               │
│    created_by: string  (who/what created this link)                │
│    created_at: datetime                                            │
│    metadata: json                                                  │
│  }                                                                  │
│                                                                     │
│  CaseRelationshipHistory {                                         │
│    id: string (PK)                                                 │
│    relationship_id: string (FK → CaseRelationship)                 │
│    action: string  (CREATED | UPDATED | DISPUTED | CONFIRMED)     │
│    previous_state: json                                            │
│    new_state: json                                                 │
│    performed_by: string                                            │
│    performed_at: datetime                                          │
│    reason: string                                                  │
│  }                                                                  │
│                                                                     │
│  CaseRelationships are append-only; history tracks all mutations.  │
└─────────────────────────────────────────────────────────────────────┘
```

### CaseAccess (Authorization)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CASE ACCESS CONTROL                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CaseAccess {                                                      │
│    id: string (PK)                                                 │
│    case_id: string (FK → Case)                                     │
│    user_id: string (FK → User)                                     │
│    role: string  (INVESTIGATOR | SUPERVISOR | ANALYST | READ_ONLY) │
│    granted_by: string                                              │
│    granted_at: datetime                                            │
│    expires_at: datetime (optional)                                 │
│    is_active: boolean                                              │
│  }                                                                  │
│                                                                     │
│  CaseAccess controls WHO can see/edit a Case.                      │
│  InvestigationWorkspace organizes work; CaseAccess gates access.   │
└─────────────────────────────────────────────────────────────────────┘
```

### InvestigationWorkspace & Workspace Entities

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INVESTIGATION WORKSPACE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  InvestigationWorkspace {                                          │
│    id: string (PK)                                                 │
│    name: string                                                    │
│    description: string                                             │
│    created_by: string (FK → User)                                  │
│    created_at: datetime                                            │
│    updated_at: datetime                                            │
│    status: string  (ACTIVE | ARCHIVED)                             │
│  }                                                                  │
│                                                                     │
│  WorkspaceCase {                                                   │
│    id: string (PK)                                                 │
│    workspace_id: string (FK → InvestigationWorkspace)              │
│    case_id: string (FK → Case)                                     │
│    added_at: datetime                                              │
│  }                                                                  │
│                                                                     │
│  WorkspaceMember {                                                 │
│    id: string (PK)                                                 │
│    workspace_id: string (FK → InvestigationWorkspace)              │
│    user_id: string (FK → User)                                     │
│    role: string  (OWNER | MEMBER | VIEWER)                         │
│    joined_at: datetime                                             │
│  }                                                                  │
│                                                                     │
│  InvestigationWorkspace groups Cases for collaborative investigation│
│  WorkspaceCase links Cases to Workspaces.                          │
│  WorkspaceMember controls who participates in a Workspace.         │
└─────────────────────────────────────────────────────────────────────┘
```

### AnalysisRun & Related Entities (Immutable Historical Execution)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ANALYSIS RUN (Immutable)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  NOTE: AnalysisRun ≠ PipelineRun. PipelineRun is the live pipeline.│
│  AnalysisRun is a frozen snapshot of a completed analysis execution.│
│                                                                     │
│  AnalysisRun {                                                     │
│    id: string (PK)                                                 │
│    workspace_id: string (FK → InvestigationWorkspace)              │
│    run_type: string  (FULL_ANALYSIS | INCREMENTAL | TARGETED)     │
│    status: string  (COMPLETED | FAILED | PARTIAL)                  │
│    input_snapshot: json   (frozen input parameters)                │
│    started_at: datetime                                            │
│    completed_at: datetime                                          │
│    created_by: string (FK → User)                                  │
│    metadata: json                                                  │
│  }                                                                  │
│                                                                     │
│  AnalysisRunCase {                                                 │
│    id: string (PK)                                                 │
│    analysis_run_id: string (FK → AnalysisRun)                      │
│    case_id: string (FK → Case)                                     │
│    included_at: datetime                                           │
│  }                                                                  │
│                                                                     │
│  AnalysisRunResult {                                               │
│    id: string (PK)                                                 │
│    analysis_run_id: string (FK → AnalysisRun)                      │
│    result_type: string  (ENTITY | RELATIONSHIP | HYPOTHESIS |     │
│                          ANOMALY | CLUSTER)                        │
│    entity_id: string (optional, FK to relevant entity)             │
│    content: json       (frozen output snapshot)                    │
│    confidence: float                                               │
│    created_at: datetime                                            │
│  }                                                                  │
│                                                                     │
│  AnalysisRun is IMMUTABLE after creation.                          │
│  AnalysisRunResult stores all output snapshots for reproducibility.│
└─────────────────────────────────────────────────────────────────────┘
```

### Finding Entity

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FINDING                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Finding {                                                         │
│    id: string (PK)                                                 │
│    case_id: string (FK → Case)                                     │
│    analysis_run_id: string (FK → AnalysisRun, optional)           │
│    finding_type: string  (PATTERN | ANOMALY | CONNECTION |         │
│                           TIMELINE | FINANCIAL)                    │
│    title: string                                                   │
│    description: string                                             │
│    evidence_refs: string[]  (entity/edge IDs supporting this)     │
│    confidence: float                                               │
│    severity: string  (LOW | MEDIUM | HIGH | CRITICAL)             │
│    status: string  (DRAFT | REVIEWED | CONFIRMED | DISMISSED)    │
│    created_by: string (FK → User)                                  │
│    created_at: datetime                                            │
│    updated_at: datetime                                            │
│  }                                                                  │
│                                                                     │
│  Findings are investigator-facing conclusions derived from         │
│  analysis results. They link back to AnalysisRun for traceability. │
└─────────────────────────────────────────────────────────────────────┘
```

### FIRLifecycleHistory

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIR LIFECYCLE HISTORY                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FIRLifecycleHistory {                                             │
│    id: string (PK)                                                 │
│    fir_id: string (FK → FIR)                                       │
│    dimension: string  (INVESTIGATION | LEGAL | RECORD)            │
│    previous_value: string                                          │
│    new_value: string                                               │
│    changed_by: string                                              │
│    changed_at: datetime                                            │
│    reason: string                                                  │
│  }                                                                  │
│                                                                     │
│  Append-only audit trail for all FIR lifecycle dimension changes.  │
└─────────────────────────────────────────────────────────────────────┘
```

### Complete Revision 3+ Entity Relationship Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REVISION 3+ ENTITY RELATIONSHIPS                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Case ──1:1──→ FIR                                                 │
│    │              │                                                 │
│    │              ├── FIRInvestigationStatus (lifecycle dim 1)     │
│    │              ├── FIRLegalDisposition    (lifecycle dim 2)     │
│    │              └── FIRRecordStatus        (lifecycle dim 3)     │
│    │                                                               │
│    ├──CaseRelationship──→ Case (source → target)                  │
│    │    └── CaseRelationshipHistory (append-only)                 │
│    │                                                               │
│    ├──CaseAccess──→ User (authorization)                          │
│    │                                                               │
│    ├──Finding──→ AnalysisRun (optional)                           │
│    │                                                               │
│    └──WorkspaceCase──→ InvestigationWorkspace                     │
│                          ├── WorkspaceCase──→ Case                │
│                          └── WorkspaceMember──→ User              │
│                                                                     │
│  InvestigationWorkspace ──→ AnalysisRun                            │
│    └── AnalysisRunCase ──→ Case                                    │
│    └── AnalysisRunResult (immutable output snapshots)             │
│                                                                     │
│  FIR ──→ FIRLifecycleHistory (append-only audit trail)            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 15. MULTI-CASE ARCHITECTURE

### Multi-Case Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-CASE ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: JURISDICTION HIERARCHY                             │   │
│  │                                                               │   │
│  │  NATION                                                       │   │
│  │  ├── STATE_UT (Delhi)                                         │   │
│  │  │   ├── COMMISSIONERATE (Delhi Police)                       │   │
│  │  │   │   ├── ZONE (Central)                                   │   │
│  │  │   │   │   ├── DIVISION (Kotwali)                           │   │
│  │  │   │   │   │   └── JURISDICTION_NODE (Kotwali PS)             │   │
│  │  │   │   │   └── DIVISION (Karol Bagh)                       │   │
│  │  │   │   │       └── JURISDICTION_NODE (Karol Bagh PS)          │   │
│  │  │   │   └── ZONE (South)                                     │   │
│  │  │   │       └── ...                                          │   │
│  │  │   └── STATE_UT (Maharashtra)                               │   │
│  │  │       └── ...                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: GLOBAL ENTITY IDENTITY INDEX                       │   │
│  │                                                               │   │
│  │  GlobalEntity (canonical_id, canonical_name, phones, ...)     │   │
│  │  ├── GlobalEntityLink → Case A, Local Entity 1               │   │
│  │  ├── GlobalEntityLink → Case B, Local Entity 3               │   │
│  │  └── CrossCaseAlert → HIGH (2 jurisdictions)                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LAYER 3: SCOPED ANALYTICAL GRAPHS                          │   │
│  │                                                               │   │
│  │  Local Graph A (Case A)  ──┐                                  │   │
│  │  Local Graph B (Case B)  ──┼── Merge ── Scoped Graph          │   │
│  │  Local Graph C (Case C)  ──┘    (on-demand, not stored)       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Jurisdiction Hierarchy Tree Diagram

```
NATION
└── STATE_UT: Delhi
    ├── COMMISSIONERATE: Delhi Police
    │   ├── ZONE: Central
    │   │   ├── DIVISION: Kotwali
    │   │   │   └── JURISDICTION_NODE: Kotwali PS
    │   │   └── DIVISION: Karol Bagh
    │   │       └── JURISDICTION_NODE: Karol Bagh PS
    │   └── ZONE: South
    │       ├── DIVISION: Lajpat Nagar
    │       │   └── JURISDICTION_NODE: Lajpat Nagar PS
    │       └── ...
    └── STATE_UT: Maharashtra
        └── COMMISSIONERATE: Mumbai Police
            └── ...
```

### Case-FIR Relationship Diagram

```
┌──────────────────────┐       ┌──────────────────────────────────────────┐
│       Case            │       │        FIR                                │
├──────────────────────┤       ├──────────────────────────────────────────┤
│ id (PK)              │◄──────│ case_id (FK, unique — 1:1)              │
│ jurisdiction_node_id │       │ fir_number (jurisdiction-scoped unique)  │
│ location_id          │       │ jurisdiction_node_id                     │
│ case_status          │       │ description                              │
│ description          │       │ filed_by_id                              │
└──────────────────────┘       │                                          │
                               │  FIR Lifecycle Dimensions:               │
                               │  ┌────────────────────────────────────┐  │
                               │  │ investigation_status               │  │
                               │  │ (FIRInvestigationStatus enum)      │  │
                               │  │  OPEN | UNDER_INVESTIGATION |      │  │
                               │  │  CHARGE_SHEET_FILED | CLOSED       │  │
                               │  ├────────────────────────────────────┤  │
                               │  │ legal_disposition                  │  │
                               │  │ (FIRLegalDisposition enum)         │  │
                               │  │  PENDING | CONVICTION | ACQUITTAL  │  │
                               │  │  DISMISSED | COMPOUNDED            │  │
                               │  ├────────────────────────────────────┤  │
                               │  │ record_status                      │  │
                               │  │ (FIRRecordStatus enum)             │  │
                               │  │  ACTIVE | SEALED | ARCHIVED        │  │
                               │  └────────────────────────────────────┘  │
                               └──────────────────────────────────────────┘

Case ↔ FIR: 1:1 invariant (FIR.caseId is unique)
FIR number uniqueness: @@unique([firNumber, jurisdictionNodeId])
```

### Global Entity Identity Index Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  GLOBAL ENTITY IDENTITY INDEX                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  GlobalEntity: "Rakesh Kumar"                                │
│  ├── phones: ["9876543210"]                                  │
│  ├── accounts: ["ACC001"]                                    │
│  ├── total_cases: 3                                          │
│  └── total_jurisdictions: 2                                  │
│                                                              │
│  GlobalEntityLink:                                           │
│  ├── Case A → Local Entity 1 (confidence: 0.95)             │
│  ├── Case B → Local Entity 3 (confidence: 0.80)             │
│  └── Case C → Local Entity 2 (confidence: 0.90)             │
│                                                              │
│  CrossCaseAlert:                                             │
│  └── HIGH: Entity in 2 jurisdictions (Delhi + Maharashtra)   │
└─────────────────────────────────────────────────────────────┘
```
