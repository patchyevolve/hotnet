# STAGE REASONERS — What Each Stage Thinks About

> Each stage has its own reasoning. Not just data transformation — actual judgment calls.

---

## Stage → Model Mapping

Each stage contributes to one or more of the five analytical models (see SYSTEM_STRUCTURE.md):

```
Stage 1: Ingestion     → Model 1: Evidence Model
Stage 2: Extraction    → Model 1: Evidence Model
Stage 3: Resolution    → Model 2: Provenance + Model 3: Coverage + Model 4: Entity State
Stage 4: Temporal      → Model 2: Provenance + Model 3: Coverage
Stage 5: Graph Build   → Model 4: Entity State + Model 5: Hypothesis
Stage 6: Analytics     → Model 5: Hypothesis & Investigation
Stage 7: Hypothesis    → Model 5: Hypothesis & Investigation
Stage 8: Contradiction → Model 5: Hypothesis & Investigation
Stage 9: Gap Detection → Model 5: Hypothesis & Investigation
Stage 10: Critic       → Reads ALL models (read-only), writes audit
```

---

## Stage 1: Ingestion Reasoner

### What It Thinks About
"Is this data reliable enough to process?"

### Reasoning Steps

```
1. SOURCE RELIABILITY ASSESSMENT
   └── Input: File type, source metadata
   └── Questions:
   │   ├── Is this from an official source? (FIR, CDR = yes)
   │   ├── Is this from a human source? (surveillance = maybe biased)
   │   ├── Is this automated? (CDR, bank = high reliability)
   │   └── Is this scanned/OCR? (may have errors)
   └── Output: reliability_score (0-1)

2. DATA QUALITY ASSESSMENT
   └── Input: Parsed content
   └── Questions:
   │   ├── Are required fields present?
   │   ├── Are dates/times parseable?
   │   ├── Are phone numbers valid format?
   │   ├── Is the text in expected language?
   │   └── Is there corruption or encoding issues?
   └── Output: quality_score (0-1)

3. COMPLETENESS ASSESSMENT
   └── Input: Parsed content
   └── Questions:
   │   ├── How many fields are filled vs empty?
   │   ├── Is the narrative complete or truncated?
   │   └── Are there obvious missing sections?
   └── Output: completeness_score (0-1)

4. SOURCE CORRELATION
   └── Input: Current file + existing data
   └── Questions:
   │   ├── Does this mention entities we've already seen?
   │   ├── Does this reference other cases?
   │   └── Does this conflict with existing data?
   └── Output: correlation_notes
```

### Output to Next Stage

See OUTPUTS.md for full RawEvidence format.

```
RawEvidence {
  ...fields...,
  reliability: 0.85,        // from source assessment
  quality: 0.92,            // from data quality
  completeness: 0.78,       // from completeness
  correlation_notes: [...], // from correlation
  processing_confidence: 0.88  // combined
}
```

### What Happens If Reasoning Fails

```
IF reliability < 0.5:
  → Flag for manual review
  → Still process, but mark as low confidence

IF quality < 0.3:
  → Skip processing
  → Log error
  → Alert investigator

IF completeness < 0.4:
  → Process what's available
  → Note gaps
  → Don't assume missing = doesn't exist

FAILURE MODE GUARD: ADVERSARIAL DATA
  → Check if data appears planted
  → Check behavioral consistency
  → Check temporal consistency
  → Flag suspicious patterns
```

### ML Calls at This Stage

```
### ML Calls at This Stage

See ML_ENGINE.md for exact ML output formats.

```
ML CALL: Feature Extraction
├── Input: Parsed content + source metadata
├── Process: Extract node/edge features with uncertainty
├── Output: FeatureStore[] with confidence metadata
├── Purpose: Prepare features for GNN and BN
└── Fallback: Rule-based feature extraction if ML fails

ML CALL: Source Reliability Weighting
├── Input: Source type + claim type
├── Process: Look up reliability from SourceReliabilityMatrix
├── Output: Reliability weights for features
├── Purpose: Weight features by source trustworthiness
└── Fallback: Default reliability scores if matrix unavailable
```

---

## Stage 2: Extraction Reasoner

### What It Thinks About
"What entities and relationships exist in this text?"

### Reasoning Steps

```
1. ENTITY IDENTIFICATION
   └── Input: Parsed text
   └── Questions:
   │   ├── What names appear? (person, org, location)
   │   ├── What numbers appear? (phone, vehicle, account)
   │   ├── What dates/times appear?
   │   ├── What locations appear?
   │   └── What role does each entity play? (accused, victim, witness)
   └── Output: Entity[] with type, position, confidence

2. RELATIONSHIP IDENTIFICATION
   └── Input: Text + entities
   └── Questions:
   │   ├── What actions connect entities? (called, met, transferred)
   │   ├── What is the direction? (A → B or B → A)
   │   ├── What is the temporal context? (when did it happen?)
   │   └── What is the spatial context? (where did it happen?)
   └── Output: Relation[] with type, entities, confidence

3. ROLE ASSIGNMENT
   └── Input: Text + entities
   └── Questions:
   │   ├── Who is the accused?
   │   ├── Who is the victim?
   │   ├── Who is the witness?
   │   ├── Who is the complainant?
   │   └── What is each person's relationship to the crime?
   └── Output: Role assignments

4. CONFIDENCE SCORING
   └── Input: All extractions
   └── Questions:
   │   ├── Is the entity name clear or ambiguous?
   │   ├── Is the relationship explicit or implied?
   │   ├── Is the text in expected language?
   │   ├── Are there OCR errors?
   │   └── How confident is the NER model?
   └── Output: Confidence scores per extraction

5. CROSS-DOCUMENT LINKING
   └── Input: Current extractions + existing entities
   └── Questions:
   │   ├── Does this entity match someone we've seen?
   │   ├── Same name? Same phone? Same address?
   │   ├── How confident is the match?
   │   └── Should we link or keep separate?
   └── Output: Link candidates
```

### Output to Next Stage

```
ExtractedEntity {
  id: "ext_001",
  type: "person",
  name: "Rakesh",
  aliases: ["Raki"],
  raw_text: "Rakesh alias Raki s/o Ram Kumar",
  source_id: "raw_001",
  confidence: 0.92,
  role: "accused",
  start_pos: 45,
  end_pos: 67
}

ExtractedRelation {
  id: "rel_001",
  type: "called",
  source_entity: "ext_001",
  target_entity: "ext_002",
  raw_text: "Rakesh ne Suresh ko phone kiya",
  source_id: "raw_001",
  confidence: 0.88,
  temporal: {start: "2024-03-15T14:32:00Z", precision: "exact"}
}
```

### What Happens If Reasoning Fails

```
IF entity confidence < 0.5:
  → Create as UnknownEntity
  → Don't force into known entity

IF relation confidence < 0.5:
  → Don't create edge
  → Log as "possible relation, not confirmed"

IF role assignment ambiguous:
  → Assign multiple possible roles
  → Flag for manual review

IF cross-doc link confidence < 0.7:
  → Keep separate
  → Don't merge prematurely
```

### ML Calls at This Stage

```
ML CALL: GNN-Based Entity Extraction
├── Input: Parsed text + existing graph structure
├── Process: Use GNN to improve entity extraction
├── Output: Enhanced entity candidates with graph context
├── Purpose: Better extraction using graph structure
└── Fallback: Rule-based NER if GNN unavailable

ML CALL: GNN-Based Relation Extraction
├── Input: Text + entities + existing edges
├── Process: Use GNN to predict missing relations
├Output: Enhanced relation candidates
├── Purpose: Find relations that rule-based methods miss
└── Fallback: Pattern-based relation extraction if GNN unavailable
```

---

## Stage 3: Resolution Reasoner

### What It Thinks About
"Are these the same person? What contradictions exist?"

### Reasoning Steps

```
1. IDENTITY RESOLUTION
   └── Input: ExtractedEntity[]
   └── Questions:
   │   ├── Do any two entities refer to the same person?
   │   ├── Same name? Same phone? Same address? Same father?
   │   ├── How many attributes match?
   │   ├── How many contradict?
   │   └── What is the combined probability?
   └── Output: Merge candidates with confidence

2. MERGE DECISION
   └── Input: Merge candidates
   └── Questions:
   │   ├── Is confidence > 0.9? → Auto-merge
   │   ├── Is confidence 0.7-0.9? → Flag for review
   │   ├── Is confidence < 0.7? → Keep separate
   │   ├── Are there contradictions in the merge?
   │   └── What is the cost of wrong merge vs missed merge?
   └── Output: Merge decisions

3. ALIAS RESOLUTION
   └── Input: Entities with multiple names
   └── Questions:
   │   ├── Is "Rakesh" same as "Rakesh Kumar"?
   │   ├── Is "Raki" an alias for "Rakesh"?
   │   ├── What is the canonical name?
   │   └── What are all known aliases?
   └── Output: Canonical entity with alias list

4. UNKNOWN ENTITY CREATION
   └── Input: Unresolved entities
   └── Questions:
   │   ├── Can this entity be described?
   │   ├── What attributes are known?
   │   ├── Is this a person, phone, vehicle, or location?
   │   └── What context surrounds this entity?
   └── Output: UnknownEntity with description

5. CONTRADICTION DETECTION
   └── Input: Entities being merged
   └── Questions:
   │   ├── Do two sources give different father names?
   │   ├── Do two sources give different addresses?
   │   ├── Do two sources give different ages?
   │   ├── Is this a real contradiction or data entry error?
   │   └── How severe is the contradiction?
   └── Output: Contradiction with severity

6. ROLE CONSOLIDATION
   └── Input: Entity + all its roles
   └── Questions:
   │   ├── Is this person accused in multiple FIRs?
   │   ├── Is this person witness in one, accused in another?
   │   ├── What is the most common role?
   │   └── Are roles contradictory?
   └── Output: Consolidated role assignments
```

### Output to Next Stage

```
ResolvedEntity {
  id: "res_001",
  canonical_name: "Rakesh Kumar",
  aliases: ["Rakesh", "Raki", "R. Kumar"],
  phone: ["9876543210"],
  vehicle: ["MP09-AB-1234"],
  address: ["Village Dhaneli, Guna, MP"],
  father: "Ram Kumar",
  dob: "1990-05-15",
  merge_confidence: 0.87,
  source_entities: ["ext_001", "ext_005", "ext_012"],
  roles: [
    {event: "FIR_1234", role: "accused"},
    {event: "FIR_5678", role: "accused"}
  ],
  contradictions: ["con_001"]
}

UnknownEntity {
  id: "unk_001",
  description: "unknown male, 30-35, medium build, blue shirt",
  source_entity: "ext_008",
  source_id: "raw_004",
  possible_matches: ["res_003"],
  confidence: 0.45
}

Contradiction {
  id: "con_001",
  type: "attribute_conflict",
  entity_id: "res_001",
  attribute: "father_name",
  values: ["Ram Kumar", "Ramesh Kumar"],
  sources: ["raw_001", "raw_003"],
  severity: "medium",
  resolved: false
}
```

### What Happens If Reasoning Fails

```
IF merge confidence borderline (0.7-0.9):
  → Don't auto-merge
  → Flag for human review
  → Keep both entities separate until resolved

IF contradiction detected:
  → Don't resolve automatically
  → Track both values
  → Flag for investigator

IF unknown entity has possible matches:
  → Create as UnknownEntity
  → Link possible matches with low confidence
  → Don't force resolution

FAILURE MODE GUARD: IDENTITY UNCERTAINTY PROPAGATION
  → When traversing from uncertain entity (confidence 0.71)
  → All downstream inferences reduced by 0.71
  → Never rewrite graph as if uncertain = certain
  → UnknownEntity42 → possible_identity → Person A (0.71)
  → Don't merge. Keep link. Propagate uncertainty.

FAILURE MODE GUARD: CROSS-CASE CONTAMINATION
  → Entity appears in Case 1 and Case 2
  → Don't assume cases are connected
  → Each case has own hypothesis space
  → Shared entity noted, not automatically linked
```

### ML Calls at This Stage

```
ML CALL: GNN-Based Entity Matching
├── Input: ExtractedEntity[] + existing ResolvedEntitiesStore[]
├── Process: Use GNN to predict entity matches
├── Output: Enhanced merge candidates with graph context
├── Purpose: Better matching using graph structure
└── Fallback: Rule-based matching if GNN unavailable

ML CALL: Identity Uncertainty Propagation
├── Input: Resolution confidence scores
├── Process: Propagate uncertainty through graph
├── Output: Adjusted confidence for all downstream entities
├── Purpose: Ensure uncertainty is properly propagated
└── Fallback: Simple multiplication if BN unavailable
```

---

## Stage 4: Temporal Reasoner

### What It Thinks About
"When exactly did things happen? How precise is the timing?"

### Reasoning Steps

```
1. TIMESTAMP STANDARDIZATION
   └── Input: Various date/time formats
   └── Questions:
   │   ├── What format is this? (DD/MM/YYYY, YYYY-MM-DD, etc.)
   │   ├── What timezone? (IST, UTC, unknown)
   │   ├── What precision? (exact, day, month, year)
   │   └── Is this ambiguous? (03/04 = March 4 or April 3?)
   └── Output: Standardized timestamp with precision

2. TEMPORAL INTERVAL MODELING
   └── Input: Timestamps with imprecision
   └── Questions:
   │   ├── Is this a point or a range?
   │   ├── "Between 14:00 and 16:00" → [14:00, 16:00]
   │   ├── "March 2024" → [2024-03-01, 2024-03-31]
   │   └── "afternoon" → [12:00, 17:00]
   └── Output: TemporalInfo with start, end, precision

3. SPATIAL PRECISION ASSESSMENT
   └── Input: Location data
   └── Questions:
   │   ├── Is this GPS coordinates? (exact)
   │   ├── Is this cell tower? (1-3km radius)
   │   ├── Is this city name? (very imprecise)
   │   └── Is this "near Hotel Taj"? (vague)
   └── Output: SpatialInfo with coordinates, radius, precision

4. TEMPORAL ALIGNMENT
   └── Input: Events from different sources
   └── Questions:
   │   ├── Do timestamps from different sources agree?
   │   ├── Is there clock drift between systems?
   │   ├── Can we align to a common timeline?
   │   └── What is the uncertainty in alignment?
   └── Output: Aligned timeline

5. COVERAGE ASSESSMENT
   └── Input: Timeline + available data
   └── Questions:
   │   ├── What time periods have data?
   │   ├── What time periods have no data?
   │   ├── Why is there no data? (expired? not collected? doesn't exist?)
   │   └── What is the coverage ratio?
   └── Output: Coverage intervals
```

### Output to Next Stage

```
TemporalInfo {
  id: "temp_001",
  entity_id: "res_001",
  event_type: "call",
  start_time: "2024-03-15T14:32:00Z",
  end_time: "2024-03-15T14:35:00Z",
  precision: "exact",
  source_id: "raw_002",
  confidence: 0.95
}

SpatialInfo {
  id: "spat_001",
  entity_id: "res_001",
  event_type: "location",
  latitude: 24.123456,
  longitude: 77.123456,
  radius_km: 0.5,
  precision: "exact",
  source_id: "raw_002",
  confidence: 0.95
}

CoverageInterval {
  entity_id: "res_001",
  source_type: "cdr",
  start: "2024-01-01",
  end: "2024-03-20",
  status: "OBSERVED",
  coverage_ratio: 0.85
}
```

### What Happens If Reasoning Fails

```
IF timestamp ambiguous:
  → Model as interval, not point
  → Use widest reasonable interval
  → Don't guess

IF spatial precision low:
  → Use large radius
  → Don't assume "near X" means "at X"

IF coverage gap detected:
  → Don't assume "no data" = "nothing happened"
  → Note the gap explicitly
  → Don't fill with assumptions
```

### ML Calls at This Stage

```
ML CALL: Temporal Pattern Detection
├── Input: TemporalInfo[] + EvidenceEdge[]
├── Process: Use temporal models to detect patterns
├── Output: TemporalPattern[] with confidence
├── Purpose: Find time-based patterns humans might miss
└── Fallback: Rule-based temporal analysis if models unavailable

ML CALL: Event Clustering
├── Input: Events from different sources
├── Process: Use ML to determine if events are same real-world event
├── Output: Deduplicated event set with confidence
├── Purpose: Better event deduplication than rule-based matching
└── Fallback: Rule-based matching if ML unavailable
```

---

## Stage 5: Graph Builder Reasoner

### What It Thinks About
"Should this edge exist? What does this relationship mean?"

### Reasoning Steps

```
1. EDGE CREATION THRESHOLD
   └── Input: ExtractedRelation[]
   └── Questions:
   │   ├── Is confidence > 0.5?
   │   ├── Is the relationship explicit or implied?
   │   ├── Is there supporting evidence from another source?
   │   └── Should we create this edge?
   └── Output: Edge creation decisions

2. RELATIONSHIP SEMANTICS
   └── Input: Edge + context
   └── Questions:
   │   ├── Is this entrepreneurial (business/profit)?
   │   ├── Is this associational (social/bonding)?
   │   ├── Is this quasi-governmental (governance/enforcement)?
   │   ├── Is this an upperworld bridge (legitimate sphere)?
   │   └── What is the specific relationship type?
   └── Output: Semantic classification

3. CONFIDENCE PROPAGATION
   └── Input: Edge + entity confidences
   └── Questions:
   │   ├── What is the source entity's confidence?
   │   ├── What is the target entity's confidence?
   │   ├── What is the extraction confidence?
   │   └── How do these combine?
   └── Output: Edge confidence = min(source, target, extraction)

4. PROVENANCE CHAIN CREATION
   └── Input: Edge + source evidence
   └── Questions:
   │   ├── What raw evidence supports this edge?
   │   ├── How many steps from raw evidence?
   │   ├── Is this independent of other edges?
   │   └── What dependency group does this belong to?
   └── Output: Provenance chain

5. MISSING EDGE TRACKING
   └── Input: Entities + expected relationships
   └── Questions:
   │   ├── Do we expect an edge that doesn't exist?
   │   ├── Is it missing because it doesn't exist?
   │   ├── Is it missing because we haven't collected data?
   │   └── How significant is this absence?
   └── Output: Missing edge notes
```

### Output to Next Stage

```
EvidenceEdge {
  id: "edge_001",
  source_id: "res_001",
  target_id: "res_002",
  relationship_type: "called",
  edge_type: "associational",
  confidence: ConfidenceSchema,
  supporting_evidence: ["raw_002"],
  contradicting_evidence: [],
  temporal_info: TemporalInfo,
  provenance_chain: ["prov_001"],
  created_at: "2024-03-20T10:00:00Z",
  updated_at: "2024-03-20T10:00:00Z"
}

ProvenanceChain {
  id: "prov_001",
  node_id: "edge_001",
  derivation: [
    {step: 1, type: "raw_evidence", id: "raw_002"},
    {step: 2, type: "extracted_relation", id: "rel_001"},
    {step: 3, type: "evidence_edge", id: "edge_001"}
  ],
  depth: 3,
  is_independent: true,
  dependency_group: "group_B"
}
```

### What Happens If Reasoning Fails

```
IF edge confidence < 0.5:
  → Don't create edge
  → Log as "possible, not confirmed"

IF relationship semantics ambiguous:
  → Assign primary + secondary classification
  → Don't force into single category

IF provenance depth > 5:
  → Flag as high uncertainty
  → Reduce confidence significantly

IF dependency group same for multiple edges:
  → Don't treat them as independent evidence
  → Track group membership

FAILURE MODE GUARD: RELATIONSHIP SEMANTICS
  → Don't collapse into generic "associated"
  → Preserve: REGISTERED_OWNER, ACTUAL_USER, DRIVER, etc.
  → Same person + vehicle ≠ same relationship type
  → Four different relationships: owns, drives, registered, insured

FAILURE MODE GUARD: ADVERSARIAL EDGE DETECTION
  → Check if edge fits natural interaction pattern
  → Check temporal consistency
  → Check source reliability
  → Flag edges that don't fit natural patterns

FAILURE MODE GUARD: TEMPORAL CAUSALITY
  → Distinguish TEMPORAL_PRECEDENCE from CAUSAL_RELATION
  → "A happened before B" ≠ "A caused B"
  → Causal claims require stronger evidence
  → Don't assume causation from sequence
```

### ML Calls at This Stage

See ML_ENGINE.md for exact ML output formats.

```
ML CALL: GNN Link Prediction
├── Input: EvidenceEdgesStore[] + ResolvedEntitiesStore[]
├── Process: Use GNN to predict hidden relationships
├── Output: GNNPredictionsStore[] with confidence intervals
├── Purpose: Find relationships that rule-based methods miss
└── Fallback: Rule-based link prediction if GNN unavailable

ML CALL: GNN Community Detection
├── Input: EvidenceEdgesStore[] + node features
├── Process: Use GNN to detect functional communities
├── Output: Community assignments with confidence
├── Purpose: Find communities that match functional types (von Lampe)
└── Fallback: Louvain community detection if GNN unavailable

ML CALL: GNN Node Classification
├── Input: Node features + local graph structure
├── Process: Use GNN to classify node roles
├── Output: Role assignments (hub, broker, bridge, peripheral) with confidence
├── Purpose: Identify structural roles with innocent explanations
└── Fallback: Centrality-based role assignment if GNN unavailable

ML CALL: GNN Anomaly Detection
├── Input: Node/edge/graph features
├── Process: Use Graph Autoencoder to detect anomalies
├── Output: Anomaly scores with confidence
├── Purpose: Detect unnatural patterns (adversarial, poisoning)
└── Fallback: Statistical anomaly detection if GNN unavailable
```

---

## Stage 6: Analytics Reasoner

### What It Thinks About
"What patterns exist? What's normal? What's anomalous?"

### Reasoning Steps

```
1. ANOMALY SIGNIFICANCE
   └── Input: Statistical deviations
   └── Questions:
   │   ├── Is deviation > 2 standard deviations?
   │   ├── Is deviation > 3 standard deviations?
   │   ├── Is this a one-time spike or sustained?
   │   ├── Is this expected given context?
   │   └── How significant is this anomaly?
   └── Output: Anomaly significance score

2. PATTERN RECOGNITION
   └── Input: Graph structure + temporal patterns
   └── Questions:
   │   ├── Does this match known criminal patterns?
   │   ├── Is this a communication burst?
   │   ├── Is this a money flow pattern?
   │   ├── Is this a meeting pattern?
   │   └── How well does this match?
   └── Output: Pattern matches with confidence

3. COMMUNITY DETECTION
   └── Input: Graph structure
   └── Questions:
   │   ├── Are there tight-knit groups?
   │   ├── Who bridges groups?
   │   ├── Are there isolated clusters?
   │   └── What do communities represent?
   └── Output: Community assignments

4. BASELINE VALIDITY
   └── Input: Behavioral baselines
   └── Questions:
   │   ├── Is the baseline based on enough data?
   │   ├── Is the baseline still valid? (person may have changed)
   │   ├── Is the baseline appropriate for this context?
   │   └── How confident are we in the baseline?
   └── Output: Baseline validity scores

5. CROSS-SOURCE CORRELATION
   └── Input: Events from different sources
   └── Questions:
   │   ├── Do events from different sources align?
   │   ├── CDR call + FIR mention + surveillance meeting
   │   ├── Are these the same event or different?
   │   └── How confident is the correlation?
   └── Output: Correlation assessments
```

### Output to Next Stage

```
AnomalySignal {
  id: "ano_001",
  type: "activity_burst",
  entity_id: "res_001",
  description: "Call frequency increased 3x in 24 hours",
  baseline: 5,
  actual: 15,
  deviation: 3.0,
  significance: "high",
  confidence: 0.85,
  time_period: "2024-03-14 to 2024-03-15"
}

Community {
  id: "comm_001",
  members: ["res_001", "res_002", "res_003"],
  density: 0.8,
  internal_edges: 12,
  external_edges: 3,
  description: "Tight-knit group with frequent communication"
}

Correlation {
  id: "corr_001",
  events: ["edge_001", "edge_005", "surv_001"],
  event_type: "meeting",
  time_alignment: "2024-03-15T14:30:00Z",
  location_alignment: "Hotel Taj",
  confidence: 0.92,
  description: "CDR, FIR, and surveillance all indicate meeting at Hotel Taj"
}
```

### What Happens If Reasoning Fails

```
IF baseline invalid (not enough data):
  → Don't compute anomalies
  → Note "insufficient baseline data"

IF pattern match low confidence:
  → Don't commit to pattern
  → List as "possible pattern"

IF community detection ambiguous:
  → Report multiple possible communities
  → Don't force single assignment

IF cross-source correlation uncertain:
  → Don't assume same event
  → List as "possibly correlated"

FAILURE MODE GUARD: EVENT DEDUPLICATION
  → "A met B at 15:00" + "A seen with B at 15:00" = ONE event
  → Don't count as two independent observations
  → Event identity model: multiple evidence → one event
  → Confidence based on independent observations, not observation count

FAILURE MODE GUARD: BACKGROUND RATES
  → Compare individual anomaly against population baseline
  → Individual anomaly + population normal = not interesting
  → Individual anomaly + population anomaly = potentially interesting
  → Don't treat high-traffic locations as suspicious

FAILURE MODE GUARD: INFERENCE LINEAGE
  → ML inference cannot corroborate another inference from same evidence chain
  → Inference A → Inference B → Inference A (circular)
  → Enforce computationally, not just documented
```

### ML Calls at This Stage

```
ML CALL: Temporal Change Detection
├── Input: TemporalInfo[] + graph snapshots
├── Process: Use temporal models to detect changes
├── Output: Change metrics with confidence
├── Purpose: Find sudden vs gradual changes in network
└── Fallback: Simple comparison if temporal models unavailable

ML CALL: Adversarial Pattern Detection
├── Input: EvidenceEdgesStore[] + ProvenanceStore[]
├── Process: Use adversarial defense to detect manipulation
├── Output: AdversarialAssessmentStore[] with threat level
├── Purpose: Detect deliberate graph poisoning
└── Fallback: Manual review if adversarial detection unavailable
```

---

## Stage 7: Hypothesis Reasoner

### What It Thinks About
"What could explain all this evidence? What are the alternatives?"

### Reasoning Steps

```
1. HYPOTHESIS GENERATION
   └── Input: Anomalies + patterns + graph structure
   └── Questions:
   │   ├── What criminal activity could explain these patterns?
   │   ├── What are the alternative explanations?
   │   ├── What is the null hypothesis (nothing criminal)?
   │   └── Are these hypotheses mutually exclusive or complementary?
   └── Output: Hypothesis set

2. EVIDENCE EVALUATION
   └── Input: Hypothesis + all evidence
   └── Questions:
   │   ├── Which evidence supports this hypothesis?
   │   ├── Which evidence contradicts this hypothesis?
   │   ├── Which evidence is neutral?
   │   └── Which evidence is missing?
   └── Output: Evidence scores per hypothesis

3. CONFIDENCE COMPUTATION
   └── Input: Evidence scores
   └── Questions:
   │   ├── How strong is the supporting evidence?
   │   ├── How strong is the contradicting evidence?
   │   ├── Are the sources independent?
   │   ├── How much does source reliability matter?
   │   └── What is the combined confidence?
   └── Output: Confidence score

4. HYPOTHESIS COMPETITION
   └── Input: All hypotheses with scores
   └── Questions:
   │   ├── Which hypothesis has strongest evidence?
   │   ├── Which hypothesis best explains all evidence?
   │   ├── Are there simpler explanations?
   │   └── Should we commit to one or maintain alternatives?
   └── Output: Ranked hypotheses

5. ALTERNATIVE GENERATION
   └── Input: Primary hypothesis
   └── Questions:
   │   ├── What else could explain this?
   │   ├── What would a skeptic say?
   │   ├── What innocent explanation fits?
   │   └── Are we suffering from confirmation bias?
   └── Output: Alternative hypotheses
```

### Output to Next Stage

```
Hypothesis {
  id: "hyp_001",
  type: "fraud_ring",
  description: "Rakesh and Suresh operate a financial fraud ring",
  confidence: ConfidenceDecomposition,
  supporting: ["edge_001", "edge_005", "ano_001", "corr_001"],
  contradicting: ["edge_003"],
  missing: ["bank_statement_Suresh", "phone_records_Suresh"],
  alternatives: ["hyp_002", "hyp_003"],
  null_hypothesis: "hyp_null",
  falsifiers: [Falsifier],
  sensitivity: SensitivityAnalysis,
  evidence_independence: 0.8,
  last_updated: "2024-03-20T10:00:00Z",
  reasoning: "Three independent sources (CDR, bank, surveillance) indicate coordinated activity"
}
```

---

## Multi-Level Alternative Generation

The system must generate alternatives at multiple levels, not just around the initial graph.

### Why Multi-Level Alternatives Matter

```
DANGEROUS:
  H1: A did it
  H2: B assisted A
  H3: A acted alone

  All alternatives assume A is involved.
  Misses:
  H4: C independently committed the event
  H5: Event was unrelated to suspected network
  H6: Source attribution is wrong
  H7: Event itself was misidentified
```

### Alternative Hypothesis Levels

```
LEVEL 1: ENTITY HYPOTHESES
├── Who is involved?
├── H1: A coordinated fraud
├── H2: B coordinated fraud
├── H3: A and B coordinated together
└── H4: Unknown person coordinated fraud

LEVEL 2: EVENT HYPOTHESES
├── What happened?
├── H1: Fraud occurred as described
├── H2: Different criminal activity occurred
├── H3: No criminal activity occurred
└── H4: Event was misidentified (not actually criminal)

LEVEL 3: RELATIONSHIP HYPOTHESES
├── How are entities connected?
├── H1: A and B are co-conspirators
├── H2: A and B are unrelated actors
├── H3: A and B have legitimate relationship being misinterpreted
└── H4: Relationship is fabricated (adversarial)

LEVEL 4: CAUSAL HYPOTHESES
├── Why did this happen?
├── H1: Financial motive
├── H2: Personal grudge
├── H3: Coerced by unknown party
└── H4: Coincidence

LEVEL 5: SOURCE-ERROR HYPOTHESES
├── Is the evidence itself wrong?
├── H1: Source is accurate
├── H2: Source misidentified person
├── H3: Source misidentified event
├── H4: Source is fabricated
└── H5: Source is manipulated (adversarial)
```

### Alternative Generation Rules

```
RULE 1: Always generate alternatives at ALL five levels.
        Don't just generate alternatives around the primary hypothesis.

RULE 2: Source-error hypotheses are particularly important.
        The most dangerous errors are when the evidence itself is wrong.

RULE 3: Each alternative must have:
        ├── Confidence (with decomposition)
        ├── Supporting evidence
        ├── Contradicting evidence
        ├── Missing evidence
        └── Falsifiers

RULE 4: The null hypothesis must always be present.
        "Nothing criminal occurred" must always be a competing hypothesis.

RULE 5: Alternatives must be genuinely different.
        "A did it alone" vs "A did it with B" are not sufficiently different
        if both assume A is involved. Include alternatives where A is NOT involved.
```

---

## Investigative Attention Bias

The system must detect when investigation effort is unequally distributed, creating misleading confidence differences.

### The Problem

```
DANGEROUS PATTERN:
1. System flags Entity A
2. Investigator focuses on A
3. A gets 74% of investigative attention
4. A gets more records, more graph edges, more anomalies
5. System raises A's confidence
6. Investigator focuses more on A

Meanwhile:
7. Entity B gets 9% of attention
8. B has fewer records, fewer edges
9. System sees B as less suspicious
10. But B might be the real perpetrator

THE EVIDENCE DIFFERENCE MAY REFLECT UNEQUAL INVESTIGATION EFFORT.
```

### Attention Bias Detection

```
FUNCTION: detect_attention_bias(entities[])
├── input: all entities in case
├── process:
│   ├── Calculate attention_ratio for each entity
│   ├── Flag entities with attention_ratio > 0.50 (dominant focus)
│   ├── Flag entities where evidence_after_recommendation / evidence_count > 0.70
│   └── Compare confidence with/without investigation-generated evidence
├── output: AttentionBiasReport

AttentionBiasReport {
  dominant_entities: string[]    // entities receiving >50% attention
  attention_distribution: object // {entity_id: attention_ratio}
  feedback_loop_risk: string[]   // entities where confidence may be investigation-driven
  recommendation: string         // "increase attention to X" / "no bias detected"
}
```

### Attention Bias in Hypothesis Reasoning

```
RULE: The hypothesis reasoner must account for attention bias.

WHEN computing hypothesis confidence:
├── Separate observational evidence from investigation-generated evidence
├── Note how much evidence was found AFTER system recommendation
├── Compare confidence with/without investigation-generated evidence
├── If confidence drops significantly without investigation-generated evidence:
│   └── Flag as attention-biased

WHEN reporting hypothesis confidence:
├── Report observational_evidence_count
├── Report investigation_generated_evidence_count
├── Report confidence_with_investigation_focus
├── Report confidence_without_investigation_focus
└── Note if confidence may be attention-biased
```

### Attention Bias in Investigator Interface

```
INVESTIGATOR SEES:

Attention Distribution:
├── Person A: 74% of investigative effort (32 evidence items)
│   ├── Observational evidence: 8 items
│   └── Investigation-generated: 24 items
├── Person B: 9% of investigative effort (4 evidence items)
│   ├── Observational evidence: 3 items
│   └── Investigation-generated: 1 item
├── Person C: 8% of investigative effort (3 evidence items)
│   ├── Observational evidence: 2 items
│   └── Investigation-generated: 1 item
└── Others: 9% combined

Warning: Person A's high confidence may partly reflect
unequal investigation effort. 24 of 32 evidence items
were found after system recommended investigating A.
Consider increasing attention to Person B and Person C.
```

### What Happens If Reasoning Fails

```
IF only one hypothesis generated:
  → Force alternative generation
  → Ask "what else could explain this?"

IF confidence too high (>0.95):
  → Suspect overconfidence
  → Check for confirmation bias
  → Reduce confidence

IF all evidence supporting, none contradicting:
  → Suspect bias
  → Actively search for counter-evidence
  → Flag as "potentially biased assessment"

IF hypothesis too specific:
  → Generalize
  → Consider broader explanations

FAILURE MODE GUARD: HYPOTHESIS COMPETITION
  → Always maintain null hypothesis + alternatives
  → Never commit to single explanation
  → Multiple hypotheses maintained simultaneously
  → Update as new evidence arrives

FAILURE MODE GUARD: EVIDENCE INDEPENDENCE
  → Check if supporting evidence is actually independent
  → Police report → News article → Social media = 1 original observation
  → Don't count dependent evidence as independent
  → Confidence based on independent sources, not source count

FAILURE MODE GUARD: EXCULPATORY EVIDENCE
  → What would prove innocence?
  → Have we looked for it?
  → Are we biased toward guilt?
  → Contradicting evidence has equal structural status to supporting evidence

FAILURE MODE GUARD: FALSIFICATION
  → Every hypothesis must carry falsifiers[]
  → Falsifiers are specific evidence that would disprove hypothesis
  → Track falsification status (tested vs untested)
  → Actively seek falsifying evidence
  → Hypotheses that survive falsification are stronger
```

### ML Calls at This Stage

See ML_ENGINE.md for exact ML output formats.

Both calls below are **designed, not implemented** — no Bayesian network,
no posterior and no `InformationGainStore` exist in `src/`. Stage 7 reports
factors only; nothing in the pipeline computes an information gain.

```
ML CALL: Bayesian Network Inference [not implemented]
├── Input: EvidenceGraph[] + HypothesesStore[] + DependencyDAG
├── Process: Use BN to compute posterior probabilities
├── Output: BNInferenceStore[] with posterior distributions
├── Purpose: Probabilistic reasoning about competing hypotheses
└── Fallback: Simple scoring if BN unavailable

ML CALL: Information Gain Calculation [not implemented — belongs to Stage 9/10]
├── Input: BN inference results + missing evidence
├── Process: Calculate which evidence would most change beliefs
├── Output: InformationGainStore[] with rankings
├── Purpose: Prioritize which evidence to obtain next
└── Fallback: Simple ranking if BN unavailable
```

---

## Stage 8: Contradiction Reasoner

### What It Thinks About
"Does exactly one claim about this key survive the admissible evidence? If
not, what record would decide it, and which hypothesis would move if it did?"

### Boundary (decides *before* it reasons)

Detection belongs to Stage 3 (and Stage 6 for temporal). Stage 8 adjudicates.

RESOLVED requires three things at once:
1. exactly one asserted value still stands for the disputed key — not
   "fewest", not "best supported";
2. every elimination was caused by evidence computed without reference to
   this contradiction;
3. the survivor and the eliminating evidence are written to the record.

NOT resolution: low severity, low impact, Stage 3 having merged the entities,
a hypothesis absorbing the conflict, or `resolvable: false`.

### Reasoning Steps

```
1. ATTRIBUTION
   └── Input: Contradiction.values + entity_ids + extraction_output
   └── Process: map each disputed value to the source files asserting it
   │   ├── provenance unavailable -> nothing may be eliminated (input failure)
   │   └── value with no source record -> eliminated (A2)
   └── Output: value -> sources

2. ADMISSIBLE ELIMINATION (closed whitelist)
   └── Input: value -> sources + Stage 1 is_suspicious
   └── Question: is EVERY asserting source of this value flagged?
   │   ├── yes -> value loses standing (A1)
   │   └── no  -> value stands
   └── Rejects: reliability priors, name similarity, corroboration counts,
   │            merge_confidence, hypothesis confidence, severity, LLM
   └── Output: standing values, eliminated values

3. RESOLUTION FEASIBILITY
   └── Input: standing values + their source classes
   └── Question: do the survivors span more than one record class?
   │   ├── >1 class  -> resolvable; a third class can decide it
   │   └── 1 class   -> irreducible inside this corpus; more records of
   │                    that class can only outnumber, never decide
   └── Output: resolvable + resolution_suggestion
   │           (Stage 9 re-derives its own gap from the same requirement;
   │            this prose is not copied into evidence_gaps.json)

4. IMPACT ON HYPOTHESIS
   └── Input: contradiction + community membership + W_CONTRADICTION
   └── Process: recompute, do not classify
   │   └── impact = 0.3 * (1 / community_members)
   │       the confidence the primary hypothesis gains if this resolves
   └── Output: hypothesis_id, impact_on_hypothesis (float)
```

### Output to Next Stage

```
Contradiction {
  id: "CON_f1ff0555476558f8",
  type: "identity",
  attribute: "name",
  values: ["Shop - Lajpat Nagar", "Lajpat Nagar, Delhi", ...],
  sources: ["01_FIR.txt", "16_Device_Amit.json", "32_Adversarial_Social.json", ...],
  severity: "medium",                    // inherited, never regraded

  resolved: false,
  resolution_note: "",
  resolved_by: "",
  resolvable: true,
  resolution_suggestion: "Obtain a record stating 'name' ... from a source class outside {cdr, device, fir}.",
  resolution_evidence: {
    admissible_rules: ["source_disqualification"],
    standing_values: ["Shop - Lajpat Nagar", "Lajpat Nagar Tower 1", "Lajpat Nagar"],
    eliminated_values: [{"value": "Lajpat Nagar, Delhi", "rule": "source_disqualification", ...}],
    standing_source_classes: ["cdr", "device", "fir"],
    provenance_available: true
  },

  hypothesis_id: "HYP_...",
  impact_on_hypothesis: 0.042857,         // 0.3 / 7 members — recomputed, not a band
  description: "3 source-backed value(s) for 'name' of Lajpat Nagar Tower 1 ..."
}
```

### ML Calls at This Stage

None. The verdict must be reproducible from the corpus alone; an LLM or BN
call would be untracked and non-deterministic, and the LLM is disabled here
(`self.ai=None`). Classification and resolution are rule-based by design.

---

## Stage 9: Gap Detection Reasoner

**Status:** Implemented.

### What It Thinks About
"Which single piece of evidence is absent, what would it be, and where
would it come from?"

Not: "how much would this change our beliefs?" — no posterior exists to
change.

### Boundary (decides *before* it reasons)

Stage 9 describes missing evidence. It never invents evidence and never
resolves the underlying uncertainty; the uncertainty stays open and travels
to Stage 10.

The unit is **one missing evidence requirement**, not one occurrence of that
requirement inside a hypothesis:

```
identity = (kind, subject, requirement)
id       = generate_id("GAP", f"{kind}:{subject}:{requirement}")
```

The hypothesis is excluded from identity *on purpose* — that exclusion is the
deduplication rule. Stage 7 repeats each missing edge across up to seven
hypotheses (38 occurrences for 6 distinct edges in the demo corpus); those
collapse to six gaps, each reattaching its citing hypotheses through
`affects_hypothesis`, with `reach` counting them.

### Reasoning Steps

```
1. PRODUCTION GATE
   └── Input: Contradiction + resolution_evidence
   └── Question: is there still an outstanding, gatherable requirement?
   │   ├── resolved                 -> no: the requirement no longer exists
   │   ├── resolvable: false        -> no: Stage 8's limitation, Stage 10's
   │   │                               `limitations`, not missing evidence
   │   ├── provenance_available: false -> no: input failure, not a gap
   │   └── otherwise                -> yes
   └── Output: attribute gaps

2. RELATION GAPS
   └── Input: Hypothesis.missing + missing_edges.json
   └── Process: enumerate from the edge store (which carries the predicted
   │            confidence and source_files), scope from Hypothesis.missing
   │            to find every citing hypothesis
   └── Rejects: duplicating one per citing hypothesis
   └── Output: relation gaps

3. DATA SOURCE (derived, no word list)
   └── Input: requirement + corpus source classes + the graph
   └── Question: where could this requirement be satisfied?
   │   ├── attribute -> corpus classes MINUS those already asserting the key
   │   │               (complement of standing_source_classes)
   │   ├── relation  -> classes observed carrying expected_relation elsewhere
   │   └── derived predicates with no carriers of their own
   │       (e.g. SHARED_ASSOCIATE) -> classes observed carrying any edge
   │       incident to either subject
   └── feasible = bool(data_source)
   └── Output: data_source, feasible, suggested_action

4. IMPACT ON HYPOTHESIS (recomputed, never classified)
   └── Input: citing primary + missing_edges.confidence + W_* weights
   └── Process: inject the predicted record's score, recompute
   │   ├── attribute -> reuse Stage 8's impact_on_hypothesis (frozen)
   │   └── relation  -> anchored on the hypothesis's reported score so
   │                    stored + impact == recomputed holds exactly
   │   └── guard: if the endpoints are not BOTH inside the primary's
   │              community the record could never become internal
   │              supporting evidence -> delta is genuinely 0.0
   └── Output: reach, impact_on_hypothesis
```

### What it deliberately does NOT reason about

| Dropped | Why |
|---------|-----|
| `discrimination` | needs a posterior over competing hypotheses; no probabilistic model exists |
| `information_gain` | same — and a placeholder `0.0` would be read downstream as a measurement |
| `impact` bands (`low`/`medium`/`high`) | classification reintroduces the thresholds this stage exists to avoid |
| `InvestigatorAction` | its `type` enum maps both gap kinds to `collect_records`; `deadline` and `legal_authority` would be fabricated |
| any word list for `suggested_action` | the action is a template over the requirement, the subject labels and `data_source` |

A negative `impact_on_hypothesis` is a legitimate result, not a defect to be
clamped: `corroboration` is a mean, and the predicted confidence for this
corpus sits below the family means, so gathering the record would dilute
rather than strengthen.

### Output to Next Stage

```
EvidenceGap {
  id: "GAP_bfba8bb7c8a4c1f1",
  kind: "missing_relation",
  subject: ["RES_06b3f3578a482b62", "RES_9eeb75085f3656ee"],
  requirement: "CALLED",
  description: "Expected relation CALLED between 9876543210 and 01126543210
                 is absent from the evidence graph (predicted confidence
                 0.5000). Candidate source class(es): ['cdr'].",
  affects_hypothesis: ["HYP_3ad520e8e7a8d529", ...],
  feasible: true,
  suggested_action: "Acquire a CALLED record for 9876543210 and 01126543210
                     from source class in {cdr}.",
  data_source: ["cdr"],
  reach: 6,
  impact_on_hypothesis: -0.004746,     // recomputed; may be negative
  run_id: "run_20260925_225032"
}
```

### ML Calls at This Stage

None. `feasible`, `data_source` and `suggested_action` are structural
derivations from the requirement and the corpus's source classes; impact is
arithmetic on Stage 7's own reported factors. An LLM call would be
untracked and non-deterministic, and the LLM is disabled here
(`self.ai=None`). No ranking, no classification, no thresholds.

---

## Policy-Driven Thresholds

All thresholds below are configurable, not hardcoded. They reference a policy object that can be versioned and case-specific.

```
POLICY VERSION: v1.0
CASE: CASE_001
MODIFIED: 2024-03-20
```

### Stage 1: Ingestion

```
SOURCE RELIABILITY DEFAULTS:
├── CDR:              0.95    # automated, objective
├── Bank:             0.95    # automated, objective
├── FIR:              0.70    # manual, subjective
├── News article:     0.50    # derived, secondhand
├── Social media:     0.50    # unverified
└── Surveillance:     0.60    # human observation, medium reliability

MIN QUALITY TO PROCESS:
├── min_quality:              0.30    # below this → reject
├── min_completeness:         0.50    # below this → reject
└── min_source_reliability:   0.30    # below this → reject
```

### Stage 3: Entity Resolution

```
ENTITY MERGE:
├── auto_merge_confidence:    0.90    # above → automatic merge
├── flag_for_review:          0.70    # between → human review
├── keep_separate:            0.00    # below → keep separate
└── note: Different entity types may need different thresholds

GROUP ALGORITHM:
├── min_match_score:          0.85    # cosine similarity threshold
└── max_distance:             2       # Levenshtein distance threshold
```

### Stage 5: Graph Building

```
EDGE CREATION:
├── min_confidence:           0.50    # below this → no edge
├── min_source_reliability:   0.30    # source must meet this
└── note: CDR edges may use lower threshold than surveillance edges

INFERENCE DEPTH:
├── max_depth:                5       # maximum steps from raw evidence
├── decay_rate:               0.85    # confidence multiplier per depth step
└── note: May be increased for well-sourced investigations
```

### Stage 6: Analytics

```
ANOMALY DETECTION:
├── individual_std:           2.0     # standard deviations from individual baseline
├── population_std:           2.0     # standard deviations from population baseline
├── min_sample_size:          30      # minimum data points for baseline
└── note: May be adjusted per entity type

TEMPORAL WINDOW:
├── default_window_days:      30      # default analysis window
├── max_window_days:          365     # maximum analysis window
└── note: Adjusted based on case type
```

### Stage 7: Hypothesis

```
HYPOTHESIS COMPETITION:
├── min_hypotheses:           3       # always maintain at least this many
├── null_hypothesis_always:   true    # null hypothesis always present
├── max_confidence_without_corroboration: 0.85
└── note: Never commit to single hypothesis
```

### Stage 8: Contradictions

```
ADMISSIBLE ELIMINATION (closed whitelist):
├── source_disqualification  # every asserting source is Stage 1 is_suspicious
└── provenance_absence       # value has no source record

RESOLVABILITY:
├── cross-record-class  -> resolvable: true  (a third class can decide)
└── single-record-class -> resolvable: false (more of one class only outnumbers)

IMPACT:
└── impact_on_hypothesis = 0.3 * (1 / community_members)   # recomputed, not a band

REJECTED (would reintroduce tuned thresholds):
├── severity bands            (0.80 / 0.60 / 0.40)  -- NOT USED
├── temporal_leeway_minutes   (10)                   -- NOT USED
├── name_similarity_threshold (0.85)                 -- NOT USED
└── amount_tolerance          (0.10)                 -- NOT USED
```

### Stage 9: Gap Detection

```
IDENTITY (deduplication, not a threshold):
└── (kind, subject, requirement) -> id = generate_id("GAP", ...)
    the hypothesis is excluded from identity on purpose: that exclusion
    is what collapses N citing hypotheses into one gap

DATA SOURCE (derived from the corpus, no word list):
├── attribute -> corpus source classes MINUS standing_source_classes
├── relation  -> classes observed carrying expected_relation, else
│                classes observed carrying any edge incident to a subject
└── feasible  = bool(data_source)

IMPACT (recomputed, never classified):
├── attribute -> reuse Stage 8's impact_on_hypothesis (Stage 8 is frozen)
└── relation  -> inject missing_edges.confidence, recompute, anchor on the
│                hypothesis's reported score:
│                stored + impact == recomputed  (exact)
└── guard     -> endpoints must BOTH be inside the primary's community,
                 else the record could never become internal -> 0.0

REJECTED (would fabricate a measurement or reintroduce thresholds):
├── discrimination            -- needs a posterior; none exists   -- NOT USED
├── information_gain          -- needs a posterior; none exists   -- NOT USED
├── impact bands              (low / medium / high)              -- NOT USED
├── ML calls                  (ranking, feasibility, prioritization) -- NOT USED
└── InvestigatorAction        (deadline, legal_authority would be fabricated)
                                                               -- DEFERRED
```

### Stage 10: Critic

**Implementation status:** Partial. The running Stage 10 writes a separate,
read-only quality review and validates LLM citations against supplied IDs. The
thresholds and comprehensive investigation/query capabilities below are
aspirational until separately implemented and validated.

```
CONFIDENCE CALIBRATION:
├── overconfidence_threshold: 0.95    # flag if single source + high confidence
├── independence_bonus:       0.10    # bonus for independent confirmation
├── dependency_penalty:       0.20    # penalty for dependent evidence
└── note: Calibrated per case

EVIDENCE THRESHOLDS:
├── min_independent_sources:  2       # minimum for confident hypothesis
├── min_coverage_ratio:       0.50    # minimum data coverage for conclusion
└── note: May be increased for high-stakes cases

BIAS CHECK:
├── confirmation_bias_threshold: 0.7  # flag if above
├── anchoring_bias_threshold:    0.7  # flag if above
├── availability_bias_threshold: 0.7  # flag if above
└── independence_bias_threshold: 0.7  # flag if above
```

### Edge Cases

```
EDGE CASES:

1. Empty Evidence
   ├── All evidence stores empty
   ├── Action: Report "no data available" with confidence 0
   
2. Single Source Only
   ├── Only one independent source
   ├── Action: Flag as "single source dependency", cap confidence
   
3. Circular Contradictions
   ├── A contradicts B, B contradicts C, C contradicts A
   ├── Action: Break cycle, flag for manual review
   
4. Conflicting Timestamps
   ├── Same event, different timestamps
   ├── Action: Use temporal_leeway_minutes, flag if exceeds
   
5. Identity Ambiguity
   ├── Entity resolution confidence < 0.5
   ├── Action: Track all alternatives, propagate uncertainty
   
6. ML Overconfidence
   ├── ML prediction confidence > 0.95
   ├── Action: Apply calibration, check for bias
   
7. Coverage Gaps
   ├── Missing data > 50% of timeline
   ├── Action: Flag, suggest evidence collection
```

### Policy Application

```
RULE: Every reasoning step references its threshold from the policy.

EXAMPLE:
"Is this edge worth creating?"
├── edge_confidence = 0.58
├── policy.min_confidence = 0.50
├── 0.58 > 0.50 → YES, create edge
└── BUT: Log that confidence was close to threshold

IF policy changes mid-case:
├── Create new run (PipelineRun)
├── Reference new policy version
├── Re-process affected stages
└── Compare results with previous run

See OUTPUTS.md for exact output formats for each stage.
```
