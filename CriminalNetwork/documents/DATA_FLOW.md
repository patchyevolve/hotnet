# DATA FLOW — How Data Moves Through the System

> Each stage transforms data. This document traces every transformation, every output, every connection.

> **Note:** `PoliceStation` has been replaced by `JurisdictionNode` throughout the system. All references to `police_station_id` are now `jurisdiction_node_id`.

---

## Stage → Model Mapping

Each stage's data flow populates one or more of the five analytical models (see SYSTEM_STRUCTURE.md):

```
Stage 1: Ingestion     → Model 1: Evidence Model
Stage 2: Extraction    → Model 1: Evidence Model
Stage 3: Resolution    → Model 2: Provenance + Model 3: Coverage + Model 4: Entity State
Stage 4: Temporal      → Model 2: Provenance + Model 3: Coverage
Stage 5: Graph Build   → Model 4: Entity State + Model 5: Hypothesis
Stage 6: Analytics     → Model 5: Hypothesis & Investigation
Stage 7: Hypothesis    → Model 5: Hypothesis & Investigation [implemented]
Stage 8: Contradiction → Model 5: Hypothesis & Investigation [implemented]
Stage 9: Gap Detection → Model 5: Hypothesis & Investigation [implemented]
Stage 10: Critic       → Reads ALL models (read-only), writes audit
```

---

## Pipeline Run Versioning

Every pipeline execution is a discrete run. Runs are versioned and traceable.

```
PipelineRun {
  run_id:            string      // "run_001"
  case_id:           string      // "CASE_001"
  jurisdiction_node_id: string   // "JN_001" (primary jurisdiction for this run)
  input_snapshot:    string[]    // RawEvidence IDs included in this run
  pipeline_version:  string      // "v1.0"
  model_versions:    object      // {ner: "v2.1", relation: "v1.3", anomaly: "v1.0"}
  policy_version:    string      // "policy_v1.0"
  start_time:        datetime
  end_time:          datetime
  parent_run_id:     string      // null for first run, previous run ID for re-runs
  trigger:           string      // "new_evidence" / "reprocessing" / "policy_change" / "manual"
  status:            string      // "running" / "completed" / "failed"
}
```

### What Constitutes a New Run

```
NEW RUN TRIGGERS:
├── New evidence added to case
├── Evidence corrected/updated
├── Policy changed (thresholds adjusted)
├── Model retrained (new version)
├── Manual reprocessing requested
└── Contradiction resolution changes hypothesis

WHAT DOES NOT TRIGGER A NEW RUN:
├── Query answered by Critic (read-only)
├── Report generated (read-only)
├── Investigation action taken (external, not system-triggered)
└── Hypothesis confidence updated within same run (continuous)
```

### Run Comparison

```
Run 001 (2024-03-20):
├── Input: FIR #1234, CDR (Rakesh), Bank (Rakesh)
├── Hypothesis H1: fraud_ring, confidence = 0.61
├── Evidence gaps: [bank_statement_Suresh]
└── Actions: [obtain_Suresh_bank_statement]

Run 002 (2024-03-25):
├── Input: Run 001 inputs + Suresh bank statement
├── Hypothesis H1: fraud_ring, confidence = 0.74
├── Evidence gaps: [phone_records_Suresh]
├── Actions: [obtain_Suresh_phone_records]
├── parent_run_id: "run_001"
└── trigger: "new_evidence"

COMPARISON:
├── H1 confidence: 0.61 → 0.74 (+0.13)
├── New evidence: Suresh bank statement (independent source)
├── Resolved gap: bank_statement_Suresh
├── New gap: phone_records_Suresh
└── Confidence change explainable by new independent evidence
```

### PipelineRun vs AnalysisRun (Revision 3+)

PipelineRun and AnalysisRun are separate concepts:

- **PipelineRun**: The live processing pipeline (Stages 1-10). Mutable, re-runnable. Each run produces versioned outputs tagged with `run_id`.
- **AnalysisRun**: An immutable historical execution snapshot. Captures the state of inputs at a point in time. Input snapshots are stored in **AnalysisRunResult** (not in AnalysisRun itself). AnalysisRun is for reproducibility and audit, not for live processing.

### Versioned Graph State

```
Each run produces a snapshot of the graph state.

GraphSnapshot {
  run_id:            string
  timestamp:         datetime
  entities:          int         // count of resolved entities
  edges:             int         // count of evidence edges
  hypotheses:        int         // count of active hypotheses
  contradictions:    int         // count of unresolved contradictions
  coverage_ratio:    float       // overall data coverage
  confidence_stats:  object      // {min, max, mean, median} of hypothesis confidences
}

RULE: Every hypothesis confidence value is tagged with its run_id.
      When comparing confidence across runs, always note which run produced it.
```

---

## Stage 1: Ingestion Engine

### Input
```
ingest(case_id, files)
├── case_id:     "CASE_001"
└── files:
    ├── FIR.pdf (or .docx, .txt)
    ├── CDR.csv
    ├── bank_records.xlsx
    ├── surveillance_report.pdf
    ├── social_media.json
    ├── cctv_frames/
    ├── device_extraction/
    └── criminal_history.json
```

### Processing

```
1. DETECT FORMAT
   └── Read file headers, content structure
   └── Classify: PDF, CSV, Excel, JSON, text, image, video

2. PARSE
   └── PDF → Extract text (OCR if scanned)
   └── CSV → Parse columns, handle encoding
   └── Excel → Parse sheets, handle formulas
   └── JSON → Parse structure
   └── Text → Split paragraphs, detect language

3. VALIDATE
   └── Required fields present?
   └── Date formats parseable?
   └── Phone numbers valid length?
   └── File not corrupted?

4. NORMALIZE
   └── Dates → YYYY-MM-DD
   └── Times → HH:MM:SS
   └── Phone numbers → 10-digit
   └── Amounts → numeric
   └── Text → UTF-8
   └── Hindi → transliterate to English

5. ASSIGN METADATA
   └── source_type: "fir" / "cdr" / "bank" / etc.
   └── source_reliability: auto / manual / mixed
   └── processing_timestamp: when ingested
   └── file_hash: SHA-256 for integrity
```

### Output → `raw_evidence_store`

```
RawEvidence {
  id:             "raw_001"
  source_type:    "fir"
  file_hash:      "sha256:abc123..."
  parsed_text:    "FIR No: 1234/2024..."
  structured_data: { /* parsed fields */ }
  language:       "en"
  confidence:     0.95
  reliability:    0.7  // manual vs auto
  timestamp:      "2024-03-20T10:00:00Z"
}
```

---

## Stage 2: Extraction Engine

### Input
```
extract(case_id, ingested_files)
├── case_id:          "CASE_001"
└── ingested_files:   raw_evidence_store[] — all RawEvidence records
```

### Processing

```
1. NAMED ENTITY RECOGNITION (NER)
   └── Input: parsed_text
   └── Model: spaCy + custom Indian law NER
   └── Output: Entity[] with type, position, confidence

2. RELATION EXTRACTION
   └── Input: parsed_text + entities
   └── Model: Relation extraction model
   └── Output: Relation[] with type, entities, confidence

3. ENTITY LINKING
   └── Input: Entity[]
   └── Process: Link to same entity across documents
   └── Output: Linked entities with cross-reference

4. ROLE EXTRACTION
   └── Input: parsed_text + entities
   └── Process: Identify FIR roles (accused, victim, witness)
   └── Output: Role assignments with confidence

5. FINANCIAL EXTRACTION (for bank records)
   └── Input: structured_data
   └── Process: Parse transactions, identify counterparties
   └── Output: Transaction[] with parties

6. TEMPORAL EXTRACTION
   └── Input: parsed_text + structured_data
   └── Process: Extract dates, times, durations
   └── Output: TemporalInfo[] with precision

7. LOCATION EXTRACTION
   └── Input: parsed_text + structured_data
   └── Process: Extract addresses, coordinates, landmarks
   └── Output: LocationInfo[] with precision
```

### Output → `extracted_entities_store` + `extracted_relations_store`

```
ExtractedEntity {
  id:             "ext_001"
  type:           "person"
  name:           "Rakesh"
  aliases:        ["Raki", "Rakesh Kumar"]
  raw_text:       "Rakesh alias Raki s/o Ram Kumar"
  source_id:      "raw_001"
  confidence:     0.92
  start_pos:      45
  end_pos:        67
}

ExtractedRelation {
  id:             "rel_001"
  type:           "called"
  source_entity:  "ext_001"
  target_entity:  "ext_002"
  raw_text:       "Rakesh ne Suresh ko phone kiya"
  source_id:      "raw_001"
  confidence:     0.88
  temporal_info:  null
}
```

---

## Stage 3: Resolution Engine

### Input
```
resolve(case_id, extracted_entities)
├── case_id:              "CASE_001"
└── extracted_entities:   extracted_entities_store[] — all ExtractedEntity records
```

### Processing

```
1. DEDUPLICATION
   └── Input: Entity[] with names, phones, addresses
   └── Process: Probabilistic matching
   │   ├── Name similarity (Jaro-Winkler)
   │   ├── Phone exact match
   │   ├── Address similarity
   │   ├── Father's name match
   │   └── Combine scores
   └── Output: Merge candidates

2. MERGE DECISIONS
   └── Input: Merge candidates
   └── Process:
   │   ├── High confidence (>0.9): Auto-merge
   │   ├── Medium (0.7-0.9): Flag for review
   │   └── Low (<0.7): Keep separate
   └── Output: Merged entities

3. ALIAS RESOLUTION
   └── Input: Entities with aliases
   └── Process: Map all names to canonical form
   └── Output: Canonical entity with all aliases

4. UNKNOWN ENTITY DETECTION
   └── Input: Unresolved entities
   └── Process: Create UnknownEntity nodes
   │   ├── "unknown male, 30-35"
   │   ├── "one Suresh" (no further ID)
   │   └── "unknown number 9876543211"
   └── Output: UnknownEntity[]

5. CONTRADICTION DETECTION
   └── Input: Entities with conflicting info
   └── Process: Detect same entity with different attributes
   │   ├── Same phone, different father
   │   ├── Same name, different address
   │   └── Same person, different age
   └── Output: Contradiction[]

6. ROLE ASSIGNMENT
   └── Input: Entities + FIR roles
   └── Process: Assign per-event roles
   │   ├── "Rakesh" is accused in FIR 1234
   │   ├── "Suresh" is witness in FIR 1234
   │   └── "Mohan" is complainant in FIR 1234
   └── Output: Role assignments
```

### Output → `resolved_entities_store` + `unknown_entities_store` + `contradictions_store`

```
ResolvedEntity {
  id:             "res_001"
  canonical_name: "Rakesh Kumar"
  aliases:        ["Rakesh", "Raki", "R. Kumar"]
  phone:          ["9876543210"]
  vehicle:        ["MP09-AB-1234"]
  address:        ["Village Dhaneli, Guna, MP"]
  father:         "Ram Kumar"
  dob:            "1990-05-15"
  merge_confidence: 0.87
  source_entities: ["ext_001", "ext_005", "ext_012"]
  roles:          [{event: "FIR_1234", role: "accused"}]
}

UnknownEntity {
  id:             "unk_001"
  description:    "unknown male, 30-35, medium build"
  source_entity:  "ext_008"
  source_id:      "raw_004"
  possible_matches: ["res_003"]  // low confidence
  confidence:     0.45
}

Contradiction {
  id:             "con_001"
  type:           "attribute_conflict"
  entity_id:      "res_001"
  attribute:      "father_name"
  values:         ["Ram Kumar", "Ramesh Kumar"]
  sources:        ["raw_001", "raw_003"]
  severity:       "medium"
  resolved:       false
}
```

---

## Stage 4: Temporal Engine

### Input
```
enrich_temporal(case_id, resolved_entities)
├── case_id:               "CASE_001"
├── resolved_entities:     extracted_entities_store[] — all ExtractedRelation records
└── raw_evidence:          raw_evidence_store[] — all RawEvidence records
```

### Processing

```
1. TIMESTAMP NORMALIZATION
   └── Input: Various date/time formats
   └── Process: Convert all to ISO 8601
   └── Output: Standardized timestamps

2. PRECISION MODELING
   └── Input: Timestamps with varying precision
   └── Process: Model as intervals
   │   ├── "15/03/2024" → [2024-03-15, 2024-03-15]
   │   ├── "Between 14:00 and 16:00" → [14:00, 16:00]
   │   ├── "March 2024" → [2024-03-01, 2024-03-31]
   │   └── "afternoon" → [12:00, 17:00]
   └── Output: TemporalInfo with precision

3. SPATIAL NORMALIZATION
   └── Input: Addresses, coordinates, landmarks
   └── Process: Geocode, normalize
   │   ├── "Hotel Taj, Guna" → {lat: 24.12, lon: 77.12}
   │   ├── "CELL_456" → {lat: 24.123, lon: 77.123}
   │   └── "Village Dhaneli" → {lat: 24.23, lon: 77.23}
   └── Output: SpatialInfo with precision

4. TEMPORAL ALIGNMENT
   └── Input: Events with timestamps
   └── Process: Align to common timeline
   │   ├── FIR date
   │   ├── CDR timestamps
   │   ├── Surveillance timestamps
   │   └── Bank transaction dates
   └── Output: Unified timeline
```

### Output → `temporal_spatial_store`

```
TemporalInfo {
  id:             "temp_001"
  entity_id:      "res_001"
  event_type:     "call"
  start_time:     "2024-03-15T14:32:00Z"
  end_time:       "2024-03-15T14:35:00Z"
  precision:      "exact"  // exact / approximate / range / unknown
  source_id:      "raw_002"
}

SpatialInfo {
  id:             "spat_001"
  entity_id:      "res_001"
  event_type:     "location"
  latitude:       24.123456
  longitude:      77.123456
  radius_km:      0.5  // precision radius
  precision:      "exact"  // exact / tower / city / unknown
  source_id:      "raw_002"
}
```

---

## Stage 5: Graph Builder Engine

### Input
```
build_graph(case_id, resolved_entities, temporal_info)
├── case_id:              "CASE_001"
├── resolved_entities:    resolved_entities_store[]
├── unknown_entities:     unknown_entities_store[]
├── extracted_relations:  extracted_relations_store[]
├── temporal_spatial:     temporal_spatial_store[]
└── raw_evidence:         raw_evidence_store[]
```

### Processing

```
1. CREATE ENTITY NODES
   └── Input: ResolvedEntity[]
   └── Process: Create graph nodes
   │   ├── Person nodes
   │   ├── Phone nodes
   │   ├── Vehicle nodes
   │   ├── Location nodes
   │   ├── Account nodes
   │   └── UnknownEntity nodes
   └── Output: Graph nodes

2. CREATE RELATIONSHIP EDGES
   └── Input: ExtractedRelation[]
   └── Process: Create graph edges
   │   ├── called (CDR)
   │   ├── met_at (surveillance)
   │   ├── owns (FIR)
   │   ├── transferred_to (bank)
   │   └── etc.
   └── Output: Graph edges

3. ASSIGN RELATIONSHIP SEMANTICS
   └── Input: Edges + context
   └── Process: Classify into three functions
   │   ├── Entrepreneurial (business/profit)
   │   ├── Associational (social/bonding)
   │   └── Quasi-governmental (governance/enforcement)
   └── Output: Semantic classifications

4. CREATE PROVENANCE CHAINS
   └── Input: All entities + edges
   └── Process: Trace back to raw evidence
   │   ├── Entity → ExtractedRelation → RawEvidence
   │   └── Track derivation depth
   └── Output: Provenance chains

5. CHECK DEPENDENCY
   └── Input: Provenance chains
   └── Process: Check if derived from same source
   │   ├── Same FIR → dependent
   │   ├── Different FIR + CDR → independent
   │   └── CDR + bank → independent
   └── Output: Dependency flags
```

### Output → `evidence_edges_store` + `provenance_store`

```
EvidenceEdge {
  id:             "edge_001"
  source_id:      "res_001"  // Rakesh
  target_id:      "res_002"  // Suresh
  relationship_type: "called"
  edge_type:      "associational"  // social connection
  confidence:     ConfidenceSchema  // 0.92
  supporting_evidence: ["raw_002"]  // CDR record
  contradicting_evidence: []
  temporal_info:  TemporalInfo
  provenance_chain: ["prov_001"]
  created_at:     "2024-03-20T10:00:00Z"
  updated_at:     "2024-03-20T10:00:00Z"
}

ProvenanceChain {
  id:             "prov_001"
  node_id:        "res_001"
  derivation_type: "extracted"
  depth:          1
  source_evidence: ["raw_001", "raw_002", "raw_003"]
  is_independent: true
  dependency_group: "group_A"
}
```

---

## Stage 6: Analytics Engine

### Input
```
compute_analytics(case_id, local_graph)
├── case_id:              "CASE_001"
├── evidence_edges:       evidence_edges_store[]
├── resolved_entities:    resolved_entities_store[]
├── unknown_entities:     unknown_entities_store[]
└── temporal_spatial:     temporal_spatial_store[]
```

### Processing

```
1. STRUCTURAL ANALYSIS
   └── Input: EvidenceEdge[]
   └── Process: Graph metrics
   │   ├── Degree centrality (who is connected to many?)
   │   ├── Betweenness centrality (who bridges groups?)
   │   ├── Eigenvector centrality (who is connected to important people?)
   │   ├── Clique detection (tight-knit groups)
   │   └── Community detection (clusters)
   └── Output: CentralityScore[], Community[]

2. TEMPORAL ANALYSIS
   └── Input: TemporalInfo[] + EvidenceEdge[]
   └── Process: Time-based patterns
   │   ├── Activity bursts (sudden increase in calls)
   │   ├── Communication frequency changes
   │   ├── Meeting patterns
   │   └── Event clustering
   └── Output: TemporalPattern[]

3. BEHAVIORAL BASELINE
   └── Input: All data per entity
   └── Process: Establish "normal" for each person
   │   ├── Avg calls/day
   │   ├── Avg transactions/month
   │   ├── Typical locations
   │   ├── Typical contacts
   │   └── Typical hours
   └── Output: BehavioralBaseline[]

4. ANOMALY DETECTION
   └── Input: Events + baselines
   └── Process: Compare actual vs expected
   │   ├── Statistical deviation
   │   ├── Pattern break detection
   │   ├── New relationship detection
   │   └── Temporal anomaly
   └── Output: AnomalySignal[]

5. CROSS-SOURCE CORRELATION
   └── Input: All data sources
   └── Process: Find matching events across sources
   │   ├── CDR call + FIR mention
   │   ├── Surveillance meeting + CDR calls
   │   └── Bank transfer + phone activity
   └── Output: Correlation[]

6. EVENT DEDUPLICATION
   └── Input: Events from different sources
   └── Process: Determine if events are same real-world event
   │   ├── Same time + same location + same people = SAME EVENT
   │   ├── Same time + different location = DIFFERENT EVENTS
   │   ├── Different time + same location = DIFFERENT EVENTS
   │   └── Uncertain = FLAG FOR REVIEW
   └── Output: Deduplicated event set
   └── RULE: "A met B at 15:00" + "A seen with B at 15:00" = ONE event, not two

7. RELATIONSHIP OPPORTUNITY MODELING
   └── Input: Edge + historical interaction data
   └── Process: Compare observed vs expected interaction
   │   ├── observed_interaction / expected_interaction = anomaly_score
   │   ├── A called B 5 times, never communicated before → HIGH anomaly
   │   ├── A called B 5 times, communicated 2000 times → LOW anomaly
   │   └── New relationships more interesting than established ones
   └── Output: Anomaly score per edge

8. BACKGROUND RATE COMPARISON
   └── Input: Anomaly signals + population data
   └── Process: Compare individual anomaly against population baseline
   │   ├── Individual: A visits location X 5 times/week (unusual for A)
   │   ├── Population: 10,000 people visit X daily (normal for location)
   │   ├── Combined: A's visits are normal for location, unusual for A
   │   └── Decision: Location visits not independently suspicious
   └── Output: Background-adjusted anomaly scores

9. TEMPORAL CAUSALITY CHECK
   └── Input: Events with temporal ordering
   └── Process: Distinguish precedence from causation
   │   ├── A happened before B → TEMPORAL_PRECEDENCE
   │   ├── A caused B → CAUSAL_RELATION (requires stronger evidence)
   │   ├── Money transfer before crime → could be financing OR routine
   │   └── Don't assume causation from sequence
   └── Output: Causality flags per event pair
```

### Output → `analytics_results_store` + `behavioral_baselines_store`

```
AnomalySignal {
  id:             "ano_001"
  type:           "activity_burst"
  entity_id:      "res_001"
  description:    "Call frequency increased 3x in 24 hours"
  baseline:       5  // avg calls/day
  actual:         15
  deviation:      3.0
  time_period:    "2024-03-14 to 2024-03-15"
  confidence:     0.85
  significance:   "high"
}

BehavioralBaseline {
  id:             "base_001"
  entity_id:      "res_001"
  metric:         "calls_per_day"
  mean:           5.2
  std_dev:        2.1
  sample_period:  "2024-01-01 to 2024-03-14"
  confidence:     0.9
}
```

---

## Stage 6: ML Inference Engine (Sub-stage)

### Input
```
feature_store[]
evidence_edges_store[]
resolved_entities_store[]
temporal_spatial_store[]
provenance_store[]
```

### Processing

```
1. FEATURE EXTRACTION
   └── Input: Raw data from previous stages
   └── Process: Extract ML features with uncertainty
   │   ├── Node features (demographics, communication, financial, geographic)
   │   ├── Edge features (type, frequency, temporal, strength)
   │   └── Graph features (density, modularity, community structure)
   └── Output: FeatureStore[] (with uncertainty metadata)

2. GNN INFERENCE
   └── Input: FeatureStore[], EvidenceEdgesStore[], ResolvedEntitiesStore[]
   └── Process: Run Graph Neural Network predictions
   │   ├── Link prediction (hidden relationships)
   │   ├── Community detection (functional groups)
   │   ├── Node classification (roles: hub, broker, bridge, peripheral)
   │   └── Anomaly detection (unnatural patterns)
   └── Output: GNNPredictionsStore[] (with confidence intervals)

3. TEMPORAL ANALYSIS
   └── Input: FeatureStore[], TemporalSpatialStore[]
   └── Process: Track network evolution
   │   ├── Time-windowed graph snapshots
   │   ├── Change detection (sudden vs gradual)
   │   ├── Evolution tracking (how network changes)
   │   └── Hysteresis modeling (recovery after disruption)
   └── Output: TemporalAnalysisStore[] (with change metrics)

4. ADVERSARIAL ASSESSMENT
   └── Input: FeatureStore[], EvidenceEdgesStore[], ProvenanceStore[]
   └── Process: Detect deliberate manipulation
   │   ├── Outlier detection (graph autoencoder)
   │   ├── Source triangulation (never single-source)
   │   ├── Behavioral consistency (claimed vs observed)
   │   └── Graceful degradation (missing data handling)
   └── Output: AdversarialAssessmentStore[] (with threat level)

5. ML OUTPUT VALIDATION
   └── Input: All ML outputs
   └── Process: Sanity checks before passing to reasoning layer
   │   ├── Confidence calibration (do probabilities match reality?)
   │   ├── Contradiction check (do ML outputs conflict?)
   │   ├── Explainability check (can we justify this prediction?)
   │   └── Uncertainty check (is uncertainty properly quantified?)
   └── Output: Validated ML outputs ready for reasoning layer
```

### Output → `gnn_predictions_store` + `temporal_analysis_store` + `adversarial_assessment_store` + `explanation_store`

```
GNNPrediction {
  prediction_type:    "link_prediction"
  target:             "edge_042"
  source_node:        "res_001"
  target_node:        "res_003"
  prediction:         "hidden_relationship"
  confidence:         0.73
  uncertainty:        0.12
  evidence:           ["feature_call_frequency", "feature_geographic_proximity"]
  graph_context:      {...relevant subgraph...}
  model_version:      "gnn_v1.0"
  timestamp:          "2024-03-20T10:30:00Z"
  explanation:        "High call frequency + geographic proximity suggests hidden relationship"
}

TemporalAnalysisResult {
  time_window:        "2024-03-01 to 2024-03-20"
  change_metrics:     {density: +0.15, modularity: -0.08}
  anomalies:          [{type: "sudden_growth", severity: 0.82}]
  evolution_trajectory: "network expanding rapidly"
  resilience_score:   0.65
  confidence:         0.78
}

AdversarialAssessment {
  threat_level:       "medium"
  detected_threats:   [{type: "possible_decoy_connections", confidence: 0.45}]
  confidence:         0.67
  recommended_actions: ["verify_source_independence", "check_behavioral_consistency"]
}
```

### ML Failure Handling

```
IF GNN prediction fails:
  → Use rule-based fallback (centrality, community detection)
  → Log failure in AUDIT_STORE
  → Reduce confidence in downstream stages
  → Never crash pipeline

IF BN inference fails:
  → Use simple majority vote for hypothesis ranking
  → Log failure in AUDIT_STORE
  → Flag for manual review
  → Never crash pipeline

IF temporal analysis fails:
  → Use static analysis (current snapshot only)
  → Log failure in AUDIT_STORE
  → Note limitation in outputs
  → Never crash pipeline

IF adversarial detection fails:
  → Flag for manual review
  → Log failure in AUDIT_STORE
  → Assume potential threat (conservative approach)
  → Never crash pipeline
```

---

## Stage 7: Hypothesis Engine

### Input
```
analytics_results_store[]
evidence_edges_store[]
resolved_entities_store[]
```

### Processing

```
1. PATTERN MATCHING
   └── Input: AnomalySignal[] + EvidenceEdge[]
   └── Process: Match against known patterns
   │   ├── Drug trafficking patterns
   │   ├── Fraud patterns
   │   ├── Money laundering patterns
   │   └── Terror financing patterns
   └── Output: PatternMatch[]

2. HYPOTHESIS GENERATION
   └── Input: PatternMatch[] + anomalies
   └── Process: Generate competing explanations
   │   ├── Primary hypothesis
   │   ├── Alternative 1
   │   ├── Alternative 2
   │   └── Null hypothesis (nothing criminal)
   └── Output: Hypothesis[]

3. EVIDENCE SCORING
   └── Input: Hypothesis[] + EvidenceEdge[]
   └── Process: Score evidence against each hypothesis
   │   ├── Support (increases confidence)
   │   ├── Contradict (decreases confidence)
   │   ├── Neutral (no effect)
   │   └── Missing (would distinguish)
   └── Output: Evidence scores per hypothesis

4. CONFIDENCE COMPUTATION
   └── Input: Evidence scores
   └── Process: Combine scores
   │   ├── Bayesian update
   │   ├── Dempster-Shafer combination
   │   └── Confidence propagation
   └── Output: Hypothesis confidence scores

5. HYPOTHESIS COMPETITION
   └── Input: Hypothesis[] with scores
   └── Process: Rank by evidence strength
   │   ├── Primary: strongest evidence
   │   ├── Alternatives: weaker but plausible
   │   └── Null: may be strongest if evidence weak
   └── Output: Ranked hypotheses
```

### Output → `hypotheses_store`

```
Hypothesis {
  id:             "hyp_001"
  type:           "fraud_ring"
  description:    "Rakesh and Suresh operate a financial fraud ring"
  confidence:     0.72
  supporting:     ["edge_001", "edge_005", "ano_001"]
  contradicting:  ["edge_003"]
  missing:        ["bank_statement_Suresh", "phone_records_Suresh"]
  alternatives:   ["hyp_002", "hyp_003"]
  null_hypothesis: "hyp_null"
  evidence_independence: 0.8  // how independent are supporting sources
  last_updated:   "2024-03-20T10:00:00Z"
}
```

---

## Stage 8: Contradiction Engine

Stage 8 does **not** detect contradictions — Stage 3 does. It adjudicates the
store and routes what it cannot decide to Stage 9.

### Input
```
contradictions_store[]      (Stage 3)
hypotheses_store[]          (Stage 7)
community_assignments[]     (Stage 6)
extraction_output[]         (Stage 2 — value -> source attribution)
extraction_summary[]        (Stage 1 — Stage 1 is_suspicious flags)
```

### Processing

```
1. ATTRIBUTION
   └── Input: Contradiction.values + entity_ids + extraction_output
   └── Process: map each disputed value to the files asserting it
   │   ├── provenance unavailable -> input failure, nothing eliminated
   │   └── value with no source record -> eliminated (A2)
   └── Output: value -> sources

2. ADMISSIBLE ELIMINATION (closed whitelist)
   └── Input: value -> sources + Stage 1 is_suspicious
   └── Process: is EVERY asserting source of this value flagged?
   │   ├── yes -> value loses standing (A1)
   │   └── no  -> value stands
   │   Rejects: reliability priors, name similarity, corroboration counts,
   │            merge_confidence, hypothesis confidence, severity, LLM
   └── Output: standing values, eliminated values

3. RESOLUTION FEASIBILITY
   └── Input: standing values + their source classes
   └── Process: do the survivors span more than one record class?
   │   ├── >1 class -> resolvable, a third class can decide it
   │   └── 1 class  -> irreducible inside this corpus
   └── Output: resolvable + resolution_suggestion

4. IMPACT ON HYPOTHESIS
   └── Input: contradiction + community membership + W_CONTRADICTION
   └── Process: recompute, do not classify
   │   └── impact = 0.3 * (1 / community_members)
   └── Output: hypothesis_id, impact_on_hypothesis (float)
```

### Output → `contradictions_store` (extends Stage 3 output)

```
Contradiction {
  id:                "CON_f1ff0555476558f8"
  type:              "identity"        // inherited
  attribute:         "name"            // inherited
  values:            [...]             // inherited
  sources:           [...]             // inherited
  severity:          "medium"          // inherited, never regraded

  resolved:          false             // exactly one survivor under A1/A2
  resolution_note:   ""
  resolved_by:       ""
  resolvable:        true              // survivors span >1 source class
  resolution_suggestion: "Obtain a record stating 'name' ... from a source class outside {cdr, device, fir}."
  resolution_evidence: {
    admissible_rules, standing_values, eliminated_values,
    standing_sources, standing_source_classes, provenance_available
  }

  hypothesis_id:     "HYP_..."
  impact_on_hypothesis: 0.042857       // 0.3 / 7 members — recomputed, not a band
  description:       "3 source-backed value(s) for 'name' of Lajpat Nagar Tower 1 ..."
}
```

### Consumers

| Consumer | What It Uses |
|----------|-------------|
| GapDetectionEngine (Stage 9) | id, resolved, resolvable, entity_ids, attribute, hypothesis_id, impact_on_hypothesis, resolution_evidence |
| CriticEngine (Stage 10) | Everything (reports, queries, limitations) |
| `Contradiction` DB table | entities, description, isResolved, resolvedById, resolvedAt |

---

## Stage 9: Gap Detection Engine

Stage 9 detects and describes **missing evidence requirements**. It does not
invent evidence and does not resolve the underlying uncertainty — that stays
open and travels to Stage 10.

The unit is one requirement, not one occurrence inside a hypothesis:
`identity = (kind, subject, requirement)`, so the seven hypotheses citing the
same absent relation collapse into one gap.

### Input
```
hypotheses_store[]           (Stage 7 — missing, contradicting, supporting,
                              confidence, generation_basis, community_id)
contradictions_store[]       (Stage 8 — resolved, resolvable, entity_ids,
                              attribute, hypothesis_id,
                              impact_on_hypothesis, resolution_evidence)
missing_edges_store[]        (Stage 5 — expected_relation, confidence,
                              source_files)
graph_edges_store[]          (Stage 5 — relationship_type, provenance_chain)
community_assignments[]      (Stage 6 — node_ids)
extraction_summary[]         (Stage 1 — corpus source classes)
id_map / resolved_entities   (Stage 3 — resolved ids and labels)
```

### Processing

```
1. PRODUCTION GATE
   └── Input: Contradiction + resolution_evidence
   └── Question: is there still an outstanding, gatherable requirement?
   │   ├── resolved                    -> no: requirement no longer exists
   │   ├── resolvable: false           -> no: Stage 8's limitation for Stage 10
   │   ├── provenance_available: false -> no: input failure, not a gap
   │   ├── empty subject / attribute   -> no: describes no requirement
   │   └── otherwise                   -> yes
   └── Output: attribute gap candidates

2. RELATION GAPS
   └── Input: missing_edges[] (enumerate) + Hypothesis.missing (scope)
   └── Process: one gap per edge identity; every citing hypothesis is
   │            reattached through affects_hypothesis
   └── Rejects: one gap per citing hypothesis
   └── Output: relation gap candidates

3. IDENTITY + DEDUPLICATION
   └── Process: bucket BOTH producers by (kind, subject, requirement)
   │   ├── the hypothesis is excluded from identity -> the dedup rule
   │   ├── kind and subject cardinality separate
   │   │   the two producers, so they cannot collide
   │   └── duplicates merge: affects is a union, impact is the max
   └── Output: EvidenceGap[]

4. DATA SOURCE (derived, no word list)
   └── attribute -> corpus classes MINUS standing_source_classes
   └── relation  -> classes observed carrying expected_relation, else
   │                classes observed carrying any edge incident to a subject
   └── feasible = bool(data_source)
   └── suggested_action = template(requirement, subject labels, data_source)

5. IMPACT ON HYPOTHESIS (recomputed, never classified)
   └── attribute -> reuse Stage 8's impact_on_hypothesis (frozen)
   └── relation  -> inject missing_edges.confidence as the score the record
   │                would carry; anchor on the reported score so
   │                stored + impact == recomputed holds exactly
   └── guard: endpoints must BOTH be inside the citing primary's community,
              else the record could never become internal -> 0.0
   └── Output: reach, impact_on_hypothesis
```

### Output → `evidence_gaps.json` (list, sorted by kind → subject → requirement)

```
EvidenceGap {
  id:                    "GAP_bfba8bb7c8a4c1f1"   // stable across runs
  kind:                  "missing_relation"        // | "unresolved_attribute"
  subject:               ["RES_06b3...", "RES_9eeb..."]
  requirement:           "CALLED"
  description:           "Expected relation CALLED between ... is absent ..."
  affects_hypothesis:    ["HYP_3ad5...", ...]      // may be empty
  feasible:              true
  suggested_action:      "Acquire a CALLED record for ... from source class in {cdr}."
  data_source:           ["cdr"]
  reach:                 6                          // len(affects_hypothesis)
  impact_on_hypothesis:  -0.004746                  // recomputed; may be negative
  run_id:                "run_20260925_225032"
}
```

Not produced, by design: `discrimination` and `information_gain` (both need a
posterior over competing hypotheses and no probabilistic model exists — they
are absent rather than zeroed, because `0.0` would read as a measurement),
`impact` bands, and `InvestigatorAction` (deferred: its `type` enum maps both
kinds to `collect_records` and `deadline` / `legal_authority` would be
fabricated).

### Consumers

| Consumer | What It Uses |
|----------|-------------|
| CriticEngine (Stage 10) | id, kind, subject, requirement, reach, impact_on_hypothesis, description |
| Investigator Interface | description, suggested_action, data_source, feasible |

---

## Stage 10: Critic Engine

**Implementation status:** Partial. The pipeline currently performs a
read-only structural review and optional ID-grounded LLM review, writing
`critic_review.json`. It does not yet implement query answering, full case
reports, confidence calibration, or investigator actions; those sections
below remain target design.

### Input
```
ALL stores — queries any store as needed
```

### Processing (see THE_CRITIC.md for details)

```
1. INVESTIGATION REVIEW
   └── Process: Comprehensive case assessment
   └── Output: InvestigationReport

2. QUERY ANSWERING
   └── Process: Answer specific questions
   └── Output: QueryResult

3. EVIDENCE ASSEMBLY
   └── Process: Assemble complete picture
   └── Output: EvidenceSummary

4. CONFIDENCE CALIBRATION
   └── Process: Check if confidence matches evidence
   └── Output: CalibrationReport
```

### Output → Investigator Interface

```
InvestigationReport {
  case_id:        "CASE_001"
  summary:        "Rakesh Kumar and Suresh appear to..."
  primary_hypothesis: "hyp_001"
  confidence:     0.72
  key_evidence:   ["edge_001", "edge_005"]
  key_contradictions: ["con_001"]
  evidence_gaps:  ["gap_001", "gap_002"]
  recommended_actions: ["act_001", "act_002"]
  data_quality:   "medium"
  coverage_ratio: 0.65
  limitations:    ["No bank records for Suresh", ...]
}
```

---

## Multi-Case Data Flow

### Case Processing Flow
Each Case is processed independently through Stages 1-6:
1. Case is created with jurisdiction_node_id (primary jurisdiction)
2. FIR is created with case_id and jurisdiction_node_id. FIR has three lifecycle dimensions: investigation_status, legal_disposition, record_status (replaces single status field). FIR number uniqueness is jurisdiction-scoped.
3. Evidence files are ingested with case_id
4. Entities are extracted with case_id
5. Entities are resolved within the Case (scoped to case_id)
6. Local graph is built for the Case
7. Analytics are computed on the local graph
8. Global Entity Push (Stage 11) pushes identity signals to global index [implemented]
9. Scoped Analytics (Stage 12) can be computed on-demand across Cases [designed, not implemented]

### Stage 11: Global Entity Push
**Status:** Implemented.
**Input:** ResolvedEntities from local pipeline
**Process:**
1. Extract identity signals (phones, accounts, names)
2. Match against GlobalEntity index
3. Create/update GlobalEntity records
4. Create GlobalEntityLinks
5. Generate CrossCaseAlerts for multi-jurisdiction entities
**Output:** updated global_entities.json, global_entity_links.json, cross_case_alerts.json

### Stage 12: Scoped Analytics (On-Demand)
**Status:** Partially implemented. A declared multi-case manifest produces
per-case totals and a summary of shared Stage 11 identities and alerts. Local
evidence graphs and risk scores are not merged. The merged-graph analytics
described below remain designed, not implemented.
**Input:** Set of Case IDs, local graphs, global entity links
**Process:**
1. Fetch local graphs for each Case
2. Merge using GlobalEntity identity links
3. Compute analytics and ML on merged graph (same algorithms as Stage 6 — GNN, Bayesian Networks, community detection, centrality, anomaly detection)
4. Return results (not persisted; optionally cached)
**Output:** scoped_analytics.json (temporary, carries source_case_ids for traceability)

---

## Evidence Acquisition Pipeline

The system must model evidence acquisition with cost, time, availability, and destruction risk.

### Why This Matters

```
CURRENT STATE:
  "We need more evidence."
  → Investigator doesn't know what to get, how to get it, or what's urgent.

BETTER STATE:
  "Among the evidence we could realistically acquire,
   this is the best next observation:
   ├── Bank statement for Suresh
   ├── Why: would confirm/deny money flow (information gain: 0.9)
   ├── From: State Bank of India (legal request required)
   ├── Feasibility: 0.8 (requires legal request, but doable)
   ├── Time: 3-5 days
   ├── Preservation risk: LOW (records retained for 7 years)
   ├── If not obtained: hypothesis remains uncertain
   └── Alternative source: None (only bank has this evidence)"
```

### Evidence Acquisition Model

```
EvidenceAction {
  id:                string
  
  // TARGET
  target:            string          // what evidence to obtain
  evidence_type:     string          // "bank_statement" / "phone_records" / "cctv" / etc.
  addresses_gap:     string          // which EvidenceGap this addresses
  
  // VALUE
  investigative_value: InvestigativeValue
  
  // ACQUISITION
  source:            string          // who has this evidence
  acquisition_method: string          // "legal_request" / "subpoena" / "direct_request" / etc.
  authorization_required: boolean     // does this need legal authority?
  authorization_type: string          // what type of authorization?
  
  // COST
  acquisition_cost:  AcquisitionCost
  
  // TIME
  acquisition_time:  TimeEstimate
  
  // PRIORITY
  priority_score:    float           // information_gain × feasibility × urgency
  priority_rank:     int             // 1 = highest priority
  min_gain_to_investigate: 0.10      // below this → skip
}
  
  // AVAILABILITY
  availability:      Availability
  
  // PRESERVATION
  preservation_risk: PreservationRisk
  
  // ALTERNATIVES
  alternative_sources: AlternativeSource[]
  
  // DECISION
  priority:          float           // 0-1, overall priority
  recommendation:    string          // "do_first" / "do_if_possible" / "do_if_time" / "skip"
}

InvestigativeValue {
  expected_uncertainty_reduction: float   // 0-1
  decision_relevance: float              // 0-1, does this help make actionable decision?
  addresses_primary_question: boolean    // does this address main investigative question?
  distinguishes_alternatives: boolean    // does this help distinguish competing hypotheses?
}

AcquisitionCost {
  monetary_cost:     float           // estimated cost (0 if free)
  effort_level:      string          // "low" / "medium" / "high"
  legal_complexity:  string          // "simple" / "moderate" / "complex"
  political_difficulty: string       // "none" / "moderate" / "high"
}

TimeEstimate {
  minimum_days:      int             // fastest possible
  typical_days:      int             // normal timeline
  maximum_days:      int             // worst case
  
  // TIME SENSITIVITY
  time_critical:     boolean         // does timing matter?
  deadline:          datetime        // if time-sensitive, when?
}

Availability {
  likely_to_exist:   float           // 0-1, probability evidence exists
  accessible:        boolean         // can we legally access it?
  access_difficulty:  string          // "easy" / "moderate" / "difficult" / "impossible"
  
  // KNOWN LIMITATIONS
  limitations:       string[]        // known issues with availability
}

PreservationRisk {
  risk_level:        string          // "LOW" / "MEDIUM" / "HIGH" / "CRITICAL"
  destruction_window: string         // when evidence might be destroyed
  destruction_probability: float     // 0-1, probability evidence will be destroyed
  
  // DESTRUCTION SCENARIOS
  destruction_scenarios: string[]    // how evidence might be destroyed
  
  // MITIGATION
  mitigation_actions: string[]       // what can be done to preserve
}

AlternativeSource {
  source:            string          // alternative source for same evidence
  reliability:       float           // 0-1, how reliable is this alternative
  accessibility:     string          // "easier" / "harder" / "same"
  limitations:       string[]        // limitations of this alternative
}
```

### Evidence Acquisition Decision Rules

```
RULE 1: HIGH PRESERVATION_RISK = URGENT regardless of other factors
        ├── Even if investigative value is moderate, must act quickly
        ├── Example: CCTV footage that expires in 24 hours
        └── Action: Obtain immediately or lose forever

RULE 2: Investigative value considers decision relevance, not just information gain
        ├── Evidence that changes abstract probabilities is less valuable
        └── Evidence that helps decide what to do next is more valuable

RULE 3: Always note alternative sources
        ├── If primary source unavailable, what else can we use?
        └── If no alternatives exist, note as single-point-of-failure

RULE 4: Authorization requirements affect feasibility
        ├── Legal requests take time
        ├── Complex authorization reduces feasibility
        └── Note authorization requirements in action plan

RULE 5: Cost and time estimates are advisory, not binding
        ├── Investigator may have different cost/time constraints
        ├── System provides estimates, investigator decides
        └── But system must flag high-cost or time-sensitive items
```

### Evidence Acquisition in Pipeline

```
FLOW:
EvidenceGap (Stage 9)
    ↓
Candidate Actions (evidence acquisition generator)
    ↓
Value Assessment (investigative value calculator)
    ↓
Feasibility Assessment (cost, time, availability, preservation)
    ↓
Priority Ranking (investigative_value × feasibility × timeliness × preservation_risk)
    ↓
Action Plan (ordered list of recommended actions)
    ↓
Investigator Decision (human chooses what to pursue)
    ↓
New Evidence (collected by investigator)
    ↓
Ingestion (Stage 1)
    ↓
Pipeline Re-runs (with new evidence)
```

### Evidence Acquisition Output

```
EvidenceAcquisitionPlan {
  case_id:            string
  generated_at:       datetime
  
  // PRIORITIZED ACTIONS
  actions:            EvidenceAction[]
  
  // SUMMARY
  total_actions:      int
  high_priority:      int
  medium_priority:    int
  low_priority:       int
  
  // RESOURCE ESTIMATES
  estimated_total_cost: float
  estimated_total_time: string
  
  // URGENCY
  time_critical_items: string[]      // items that must be obtained quickly
  preservation_risk_items: string[]  // items at risk of destruction
  
  // COVERAGE
  gaps_addressed:     int
  gaps_remaining:     int
  coverage_improvement: float        // expected improvement in coverage ratio
}
```
