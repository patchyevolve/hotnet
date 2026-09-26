# OUTPUTS — What Each Stage Produces

> Every stage produces output. Every output goes to a store. Every store is read by specific downstream stages. This document maps it all.

> **Note:** `PoliceStation` has been replaced by `JurisdictionNode` throughout the system. All references to `PoliceStation` should be read as `JurisdictionNode`.

---

## Stage → Model Mapping

Each stage produces outputs for one or more of the five analytical models (see SYSTEM_STRUCTURE.md):

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
Stage 11: Global Entity Push → Multi-Case Entity Resolution
Stage 12: Scoped Analytics   → On-Demand Cross-Case Analytics
```

---

## Confidence Semantic Typing

All confidence values must use specific semantic types, never generic "confidence."

### The Confidence Taxonomy

```
SOURCE LAYER (ingestion):
├── source_reliability: float    # how trustworthy is this source type?
│   # CDR = 0.95, Bank = 0.95, FIR = 0.70, Surveillance = 0.60, Social = 0.50
├── data_quality: float          # how well-formed is the data?
├── data_completeness: float     # how many fields are present?
└── observation_confidence: float # how confident is the source in what it observed?

EXTRACTION LAYER (extraction):
├── extraction_confidence: float # how confident is NER/relation model?
├── entity_match_confidence: float # how confident in entity linking?
└── relation_confidence: float   # how confident in relation extraction?

RESOLUTION LAYER (resolution):
├── merge_confidence: float      # how confident are these the same entity?
├── resolution_confidence: float # how confident in overall resolution?
└── contradiction_severity: float # how severe is this contradiction?

GRAPH LAYER (graph building):
├── edge_confidence: float       # how confident does this edge exist?
├── provenance_depth_confidence: float # confidence decay from provenance depth
└── independence_confidence: float # confidence adjustment for source independence

ANALYTICS LAYER (analytics):
├── anomaly_score: float         # how anomalous is this observation?
├── baseline_confidence: float   # how reliable is this baseline?
├── pattern_confidence: float    # how confident in this pattern match?
└── correlation_confidence: float # how confident in this cross-source correlation?

HYPOTHESIS LAYER (hypothesis):
├── hypothesis_confidence: float # combined confidence in this hypothesis
├── evidence_independence: float # how independent are supporting sources
├── coverage_adjustment: float   # confidence adjustment for data coverage
└── information_gain: float      # expected information gain from this evidence

INTERFACE LAYER (critic/output):
├── report_confidence: float     # confidence in the overall report
├── query_confidence: float      # confidence in this specific answer
└── calibration_delta: float     # how much was confidence adjusted during calibration
```

### Why Generic "confidence" Is Dangerous

```
DANGEROUS:
  "confidence: 0.87"
  → Is this extraction confidence? Hypothesis confidence? Source reliability?
  → Different meanings, different implications

SAFE:
  "extraction_confidence: 0.92"
  "merge_confidence: 0.87"
  "hypothesis_confidence: 0.74"
  "evidence_independence: 0.80"
  → Each value has clear meaning
  → Can be traced back to what produced it
  → Can be compared meaningfully
```

### Confidence Derivation Chain

```
hypothesis_confidence is DERIVED from upstream values:

hypothesis_confidence = f(
  edge_confidences[],           # how confident in each piece of evidence
  evidence_independence,        # how independent are the sources
  source_reliabilities[],       # how reliable is each source
  coverage_adjustment,          # what don't we know
  contradiction_impacts[],      # what contradicts this hypothesis
  provenance_depth_confidence   # how far from raw observation
)

hypothesis_confidence is NOT:
├── copied from edge_confidence
├── copied from extraction_confidence
├── invented by LLM
└── randomly assigned

RULE: hypothesis_confidence must be computable from upstream values.
      If it can't be derived, it's not valid.
```

### Confidence Decomposition

Every confidence value must be explainable. A bare number is not enough.

```
ConfidenceSchema {
  value: float                    // 0-1
  semantic_type: string           // source_reliability | extraction_confidence | merge_confidence | edge_confidence | hypothesis_confidence | anomaly_score
  decomposition: ConfidenceDecomposition
  run_id: string
  model_version: string
  timestamp: datetime
}

ConfidenceDecomposition {
  supporting_factors: Factor[]
  contradicting_factors: Factor[]
  unknown_factors: string[]
}

Factor {
  description: string
  weight: float
  source: string
  reliability: float
}
```

### Why Decomposition Matters

```
BAD:
  Entity match = 0.81

GOOD:
  Entity resolution: 0.81
  
  Supporting:
  + same phone number (weight: 0.3, source: CDR, reliability: 0.95)
  + same address (weight: 0.2, source: FIR, reliability: 0.70)
  + same DOB (weight: 0.2, source: Aadhaar, reliability: 0.95)
  
  Weakening:
  - different photograph (weight: 0.15, source: CCTV, reliability: 0.60)
  - inconsistent employment history (weight: 0.10, source: records, reliability: 0.70)
  
  Unknown:
  - no verified biometric identifier

The investigator can see WHY the system thinks this.
The investigator can evaluate whether the basis is adequate.
A wrong identity merge is one of the most damaging graph errors.
Decomposition makes errors detectable.
```

### Confidence Decomposition Enforcement

```
RULE: Every object with a confidence field must also carry its decomposition.

ExtractedEntity {
  extraction_confidence: ConfidenceDecomposition
  entity_resolution_confidence: ConfidenceDecomposition
}

EvidenceEdge {
  edge_confidence: ConfidenceDecomposition
}

Hypothesis {
  hypothesis_confidence: ConfidenceDecomposition
}

RULE: If an object has confidence but no decomposition, it is incomplete.
      The system must not propagate incomplete confidence objects.
```

### Entity Resolution Pipeline Invariant

```
INVARIANT: No high-impact inference may depend on an unresolved or
weakly resolved identity without explicitly propagating that
identity uncertainty.

This is not a reporting feature. It is a pipeline invariant.

EXAMPLE:
UnknownEntity42
       ↓
resolved_to A (0.81)
       ↓
47 calls
       ↓
financial relationship
       ↓
network centrality
       ↓
H1 = 0.72

INVARIANT REQUIRES:
H1 must report:
├── hypothesis_confidence: 0.72
├── identity_contribution: "UnknownEntity42 resolved to A with 0.81 confidence"
├── identity_impact: "If resolution wrong, H1 drops to 0.18"
└── identity_status: "material_uncertainty"

RULE: If entity_resolution_confidence < 0.90 AND entity is involved in
      high-impact inference:
├── Hypothesis MUST note identity uncertainty
├── Hypothesis MUST report identity impact
├── Identity sensitivity analysis MUST be included
└── Investigator MUST see: "This conclusion depends on identity resolution"

RULE: If entity_resolution_confidence < 0.70:
├── High-impact inferences MUST NOT be treated as established
├── Hypothesis confidence MUST be reduced by identity uncertainty factor
└── System MUST flag: "Identity resolution uncertain, conclusions preliminary"

RULE: Identity uncertainty MUST propagate to hypothesis confidence.

The particular aggregation method is a configurable policy, not a universal law.

Option A — Conservative multiplication (default):
  effective_confidence = hypothesis_confidence × entity_resolution_confidence
  H1 = 0.72 × 0.81 = 0.58

Option B — Bayesian conditional:
  effective_confidence = P(H | Identity=A) × P(Identity=A) + P(H | Identity≠A) × P(Identity≠A)
  Requires: conditional probability estimates for each identity resolution

Option C — Sensitivity bounds:
  confidence_if_correct = P(H | Identity=A)
  confidence_if_wrong = P(H | Identity≠A)
  Report both bounds to investigator

RULE: The invariant is:
  High-impact inference MUST propagate unresolved identity uncertainty.

The aggregation formula is a policy choice:
  ├── Multiplication: simple, conservative, always reduces confidence
  ├── Bayesian: more accurate, requires conditional estimates
  ├── Sensitivity: most transparent, reports bounds
  └── Policy version tracked, not hardcoded

EXAMPLE (multiplication):
  H1 raw confidence: 0.72
  Entity resolution: 0.81
  H1 effective confidence: 0.72 × 0.81 = 0.58

EXAMPLE (sensitivity bounds):
  H1 if Identity=A: 0.72
  H1 if Identity≠A: 0.18
  Investigator sees: "H1 confidence ranges from 0.18 to 0.72 depending on identity resolution"
```

---

## Event Cluster Uncertainty

Events are reconstructed from partial observations. Two observations may represent the same event or two different events. The system must never force a binary decision.

### The Problem With Binary Deduplication

```
DANGEROUS:
  same_event = true

  If wrong:
  ├── Two legitimate meetings merged
  ├── Timeline distorted
  ├── Entity relationships corrupted
  └── Hypothesis built on false foundation

  If right:
  ├── Clean event graph
  └── Good for analysis

But we often can't tell.
```

### Event Cluster Model

```
EventCluster {
  id:                string
  
  // OBSERVATIONS
  observations:      Observation[]     // raw observations that may represent same event
  
  // STATE
  state:             EventClusterState // CONFIRMED / PROBABLE / UNRESOLVED
  
  // LINKAGE
  same_event_probability: float        // 0-1, how likely these are the same event
  linkage_basis:     string[]          // why this probability
  linkage_policy:    string            // which policy version was used
  
  // ALTERNATIVE
  alternative_explanation: string      // what if these are NOT the same event
  
  // CANONICAL EVENT (only if CONFIRMED)
  canonical_event:   CanonicalEvent    // the reconstructed event (if confirmed)
}

EventClusterState:
├── CONFIRMED_EVENT
│   ├── sufficient evidence that observations represent one event
│   ├── canonical_event is populated
│   └── downstream analytics treat as single event
│
├── PROBABLE_EVENT_CLUSTER
│   ├── observations LIKELY represent same event
│   ├── same_event_probability > 0.70
│   ├── BUT insufficient for certainty
│   ├── canonical_event is estimated (with uncertainty)
│   └── downstream analytics MUST note uncertainty
│
└── UNRESOLVED_EVENT_CLUSTER
    ├── observations MAY or MAY NOT represent same event
    ├── same_event_probability between 0.30 and 0.70
    ├── NO canonical event
    ├── downstream analytics must consider BOTH possibilities
    └── investigator must resolve

### Event Linkage Policy

```
The threshold for event linkage is NOT universal.
It depends on event type and must be policy-versioned.

EventLinkagePolicy {
  policy_id:         string
  version:           string          // "v1.0"
  
  // EVENT TYPE
  event_type:        string          // "meeting" / "transaction" / "communication" / "movement"
  
  // THRESHOLDS
  confirmed_threshold: float         // above → CONFIRMED_EVENT (default: 0.90)
  probable_threshold:  float         // above → PROBABLE_EVENT_CLUSTER (default: 0.70)
  
  // BASIS
  basis:             string[]        // why these thresholds
  source:            string          // "expert_consultation" / "empirical_study" / "assumption"
  
  // VALIDATION
  validated:         boolean
  sample_size:       int
  last_validated:    datetime
}

DEFAULT POLICIES:
├── "meeting":
│   ├── confirmed: 0.90 (same time, same location, same people)
│   ├── probable: 0.70
│   └── basis: ["temporal proximity", "location match", "entity match"]
│
├── "transaction":
│   ├── confirmed: 0.95 (exact amount, same accounts, same time)
│   ├── probable: 0.80
│   └── basis: ["exact match", "financial record precision"]
│
├── "communication":
│   ├── confirmed: 0.85 (same participants, similar time)
│   ├── probable: 0.65
│   └── basis: ["CDR precision", "attribution uncertainty"]
│
└── "movement":
    ├── confirmed: 0.80 (same location, similar time)
    ├── probable: 0.60
    └── basis: ["location precision", "identity uncertainty"]

RULE: Different event types have different thresholds.
      Transaction deduplication is stricter than meeting deduplication.
      Thresholds must be policy-versioned and calibrated.
```

### Why Thresholds Differ by Event Type

```
TWO MEETINGS at same hotel, 7 minutes apart:
├── Same event probability: 0.81
├── Event type: "meeting"
├── Threshold: 0.70
├── Result: PROBABLE_EVENT_CLUSTER
└── Correct: Could be separate meetings

TWO TRANSACTIONS of ₹2,00,000 on same day:
├── Same event probability: 0.81
├── Event type: "transaction"
├── Threshold: 0.80
├── Result: PROBABLE_EVENT_CLUSTER
└── Correct: Could be separate transactions (high-value, same day)

TWO PHONE CALLS of 2 minutes each:
├── Same event probability: 0.81
├── Event type: "communication"
├── Threshold: 0.65
├── Result: PROBABLE_EVENT_CLUSTER
└── Correct: Likely same conversation split across calls
```

Observation {
  id:                string
  source_id:         string          // which RawEvidence
  event_time:        datetime        // when event occurred
  event_location:    string          // where event occurred
  entities:          string[]        // who was involved
  description:       string          // what happened
  reliability:       ConfidenceDecomposition
}

CanonicalEvent {
  event_time:        datetime        // estimated time (may be interval)
  event_location:    string          // estimated location
  entities:          string[]        // who was involved
  description:       string          // what happened
  confidence:        ConfidenceDecomposition
}
```

### Event Cluster Decision Rules

```
RULE 1: UNRESOLVED_EVENT_CLUSTER must not be collapsed into canonical event.
        Downstream analytics must consider both possibilities:
        ├── possibility A: one event (with probability)
        └── possibility B: multiple events (with probability)

RULE 2: PROBABLE_EVENT_CLUSTER canonical event carries uncertainty.
        When using canonical event, note: "estimated from cluster, probability 0.81"

RULE 3: CONFIRMED_EVENT can be treated as single event.
        But still carry: "confirmed from cluster, evidence: ..."

RULE 4: Investigator can override cluster state.
        But override must be logged with reason.
```

### Event Cluster in Investigator Interface

```
INVESTIGATOR SEES:

Possible common event:

Observation A: Rakesh at hotel, 15:00 (CDR, reliability: 0.95)
Observation B: Rakesh at hotel, 15:07 (CCTV, reliability: 0.86)

Estimated linkage: 0.81

Alternative:
A and B may represent separate events.
7-minute temporal separation, same location, same participants.
Insufficient independent event marker.

Action needed:
Confirm whether these are same event or separate meetings.
```

---

## Falsifiable Hypotheses

Every major hypothesis must identify what evidence would falsify it. This changes the system from "find supporting evidence" to "find evidence capable of proving the hypothesis wrong."

### Why Falsification Matters

```
DANGEROUS:
  H1: Person A coordinated fraud (confidence: 0.72)
  Supporting: [evidence_1, evidence_2, evidence_3]
  
  System keeps finding more supporting evidence.
  Never looks for disconfirming evidence.
  Confirmation bias builds.

BETTER:
  H1: Person A coordinated fraud (confidence: 0.72)
  Supporting: [evidence_1, evidence_2, evidence_3]
  
  Falsifiers:
  ├── verified device possession by another person
  ├── reliable location evidence excluding A
  ├── independent evidence explaining A-B contact
  
  System actively looks for falsifiers.
  If found → hypothesis weakened or rejected.
  If not found → hypothesis survives (not confirmed, but survives).
```

### Falsifiable Hypothesis Model

```
Hypothesis {
  id:                string
  description:       string
  hypothesis_type:   string      // "entity" / "event" / "relationship" / "causal" / "source_error"
  
  // CONFIDENCE
  confidence:        ConfidenceDecomposition
  
  // SUPPORTING EVIDENCE
  supporting_evidence: string[]  // EvidenceItem IDs
  
  // FALSIFICATION
  falsifiers:        Falsifier[]
  
  // COMPETING HYPOTHESES
  alternatives:      Hypothesis[]
  null_hypothesis:   Hypothesis
  
  // SENSITIVITY
  sensitivity:       SensitivityAnalysis
}

Falsifier {
  id:                string
  description:       string      // what would falsify this hypothesis
  
  // WHAT WOULD WE NEED TO FIND
  required_evidence: string      // description of falsifying evidence
  
  // LIKELIHOOD OF FINDING
  findability:       string      // "likely" / "possible" / "unlikely" / "impossible"
  
  // IF FOUND
  impact:            string      // "reject_hypothesis" / "weaken_hypothesis" / "require_revision"
  
  // CURRENT STATUS
  status:            string      // "not_searched" / "searched_not_found" / "found" / "unavailable"
}

SensitivityAnalysis {
  // What if key assumptions are wrong?
  
  key_assumptions:   Assumption[]
  
  // What if key identities are wrong?
  identity_sensitivity: IdentitySensitivity
}

Assumption {
  assumption:        string      // e.g., "A possessed device D"
  if_false:          string      // e.g., "H1 confidence drops to 0.18"
  testability:       string      // "testable" / "partially_testable" / "untestable"
}

IdentitySensitivity {
  // If UnknownEntity42 is NOT Person A:
  //   H1 confidence: 0.72 → 0.18
  //   H2 confidence: 0.21 → 0.64
  
  entity_id:         string      // which entity
  current_resolution: string     // currently resolved to
  alternative_resolutions: AlternativeResolution[]
}

AlternativeResolution {
  entity:            string      // alternative identity
  impact:            object      // how hypothesis confidences change
  basis:             string      // why this alternative is possible
}
```

---

## Stage 1: Ingestion → Raw Evidence Store

### What It Produces

```
RawEvidence {
  id:                string      // unique ID
  case_id:           string      // case identifier
  source_type:       string      // "fir" / "cdr" / "bank" / "surveillance" / etc.
  file_hash:         string      // SHA-256 of original file
  parsed_text:       string      // extracted text content
  structured_data:   object      // parsed fields (varies by source)
  language:          string      // "en" / "hi" / "mixed"
  reliability:       float       // 0-1, source reliability
  quality:           float       // 0-1, data quality
  completeness:      float       // 0-1, how complete the data is
  confidence:        float       // 0-1, overall processing confidence
  timestamp:         datetime    // when ingested
  metadata:          object      // file size, page count, etc.
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| ExtractionEngine (Stage 2) | parsed_text, structured_data |
| TemporalEngine (Stage 4) | source_type, timestamp |
| CriticEngine (Stage 10) | Everything (audit, quality checks) |

### What It Does NOT Produce

```
Does NOT produce:
├── Entities (that's Stage 2)
├── Relationships (that's Stage 2)
├── Graph nodes (that's Stage 5)
└── Hypotheses (that's Stage 7)
```

---

## Stage 2: Extraction → Extracted Entities + Relations Stores

### What It Produces (Entities)

```
ExtractedEntity {
  id:                string      // unique ID
  case_id:           string      // case identifier
  type:              string      // "person" / "phone" / "vehicle" / "location" / "account" / "organization"
  name:              string      // primary name
  aliases:           string[]    // alternative names
  raw_text:          string      // exact text where extracted from
  source_id:         string      // references RawEvidence
  confidence:        float       // 0-1, extraction confidence
  start_pos:         int         // character position in text
  end_pos:           int         // character position in text
  role:              string      // "accused" / "victim" / "witness" / "complainant" / "associate" (if FIR)
  attributes:        object      // phone, address, vehicle, etc. (if found in text)
}
```

### What It Produces (Relations)

```
ExtractedRelation {
  id:                string      // unique ID
  case_id:           string      // case identifier
  type:              string      // "called" / "met" / "owns" / "transferred" / etc.
  source_entity:     string      // references ExtractedEntity
  target_entity:     string      // references ExtractedEntity
  raw_text:          string      // exact text where extracted from
  source_id:         string      // references RawEvidence
  confidence:        float       // 0-1, extraction confidence
  temporal:          object      // {start, end, precision} if found
  spatial:           object      // {lat, lon, radius} if found
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| ResolutionEngine (Stage 3) | All fields — deduplication, alias resolution |
| GraphBuilderEngine (Stage 5) | type, source_entity, target_entity, temporal, spatial |
| CriticEngine (Stage 10) | Confidence scores, raw_text for audit |

### What It Does NOT Produce

```
Does NOT produce:
├── Deduplicated entities (that's Stage 3)
├── Canonical names (that's Stage 3)
├── Graph edges (that's Stage 5)
└── Provenance chains (that's Stage 5)
```

---

## Stage 3: Resolution → Resolved Entities + Unknown Entities + Contradictions Stores

### What It Produces (Resolved Entity)

```
ResolvedEntity {
  id:                string      // canonical ID (used everywhere after this)
  case_id:           string      // case identifier
  canonical_name:    string      // primary name
  aliases:           string[]    // all known aliases
  phone:             string[]    // all known phone numbers
  vehicle:           string[]    // all known vehicle registrations
  address:           string[]    // all known addresses
  father:            string      // father's name (if known)
  dob:               string      // date of birth (if known)
  merge_confidence:  float       // 0-1, how confident in merge
  source_entities:   string[]    // which ExtractedEntity IDs were merged
  roles:             object[]    // [{event: "FIR_1234", role: "accused"}]
  contradictions:    string[]    // which Contradiction IDs involve this entity
  created_at:        datetime    // when resolved
  updated_at:        datetime    // when last updated
}
```

### What It Produces (Unknown Entity)

```
UnknownEntity {
  id:                string      // unique ID
  case_id:           string      // case identifier
  description:       string      // "unknown male, 30-35, medium build"
  source_entity:     string      // references ExtractedEntity
  source_id:         string      // references RawEvidence
  possible_matches:  string[]    // low-confidence matches to ResolvedEntity
  confidence:        float       // 0-1, how confident in description
  attributes:        object      // partial info (age range, clothing, etc.)
}
```

### What It Produces (Contradiction)

```
Contradiction {
  id:                string      // unique ID
  case_id:           string      // case identifier
  type:              string      // "attribute_conflict" / "timeline_conflict" / "location_conflict"
  entity_id:         string      // which entity has contradiction
  attribute:         string      // "father_name" / "address" / "age"
  values:            string[]    // conflicting values ["Ram Kumar", "Ramesh Kumar"]
  sources:           string[]    // which RawEvidence IDs
  severity:          string      // "low" / "medium" / "high" / "critical"
  resolved:          boolean     // has contradiction been resolved
  resolution_note:   string      // how it was resolved (if resolved)
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| GraphBuilderEngine (Stage 5) | id, canonical_name, phone, vehicle, address, roles |
| AnalyticsEngine (Stage 6) | id, roles (for baseline computation) |
| HypothesisEngine (Stage 7) | id, contradictions (for scoring) |
| ContradictionEngine (Stage 8) | contradictions (for tracking) |
| CriticEngine (Stage 10) | Everything |

### What It Does NOT Produce

```
Does NOT produce:
├── Graph nodes (that's Stage 5)
├── Confidence-adjusted entities (that's downstream)
└── Merged RawEvidence (raw evidence stays separate)
```

---

## Stage 4: Temporal → Temporal + Spatial + Coverage Stores

### What It Produces (Temporal Info)

```
TemporalInfo {
  id:                string      // unique ID
  case_id:           string      // case identifier
  entity_id:         string      // references ResolvedEntity or UnknownEntity
  event_type:        string      // "call" / "meeting" / "transaction" / "location"
  start_time:        datetime    // ISO 8601
  end_time:          datetime    // ISO 8601 (may be same as start for point events)
  precision:         string      // "exact" / "approximate" / "range" / "unknown"
  source_id:         string      // references RawEvidence
  confidence:        float       // 0-1
  edge_id:           string      // references EvidenceEdge (if created)
}
```

### What It Produces (Spatial Info)

```
SpatialInfo {
  id:                string      // unique ID
  case_id:           string      // case identifier
  entity_id:         string      // references ResolvedEntity or UnknownEntity
  event_type:        string      // "location" / "call_origin" / "tower"
  latitude:          float       // decimal degrees
  longitude:         float       // decimal degrees
  radius_km:         float       // precision radius
  precision:         string      // "exact" / "tower" / "city" / "unknown"
  source_id:         string      // references RawEvidence
  confidence:        float       // 0-1
  edge_id:           string      // references EvidenceEdge (if created)
}
```

### What It Produces (Coverage Intervals)

```
CoverageInterval {
  entity_id:         string      // references ResolvedEntity
  case_id:           string      // case identifier
  source_type:       string      // "cdr" / "bank" / "surveillance" / etc.
  start:             date        // coverage start
  end:               date        // coverage end
  status:            string      // "OBSERVED" / "NOT_OBSERVED" / "NOT_SEARCHED" / "UNKNOWN"
  coverage_ratio:    float       // 0-1, what % of time is covered
  gaps:              object[]    // [{start, end, reason}]
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| GraphBuilderEngine (Stage 5) | start_time, end_time, latitude, longitude, radius_km |
| AnalyticsEngine (Stage 6) | coverage_ratio, gaps, temporal patterns |
| HypothesisEngine (Stage 7) | temporal alignment, coverage gaps |
| CriticEngine (Stage 10) | coverage_ratio, gaps (for quality assessment) |

---

## Stage 5: Graph Builder → Evidence Edges + Provenance Stores

### What It Produces (Evidence Edge)

```
EvidenceEdge {
  id:                string      // unique ID
  case_id:           string      // case identifier
  source_id:         string      // references ResolvedEntity or UnknownEntity
  target_id:         string      // references ResolvedEntity or UnknownEntity
  relationship_type: string      // "called" / "met_at" / "owns" / "transferred_to" / etc.
  edge_type:         string      // entrepreneurial, associational, quasi_gov, upperworld
  confidence:        ConfidenceSchema
  supporting_evidence: string[]
  contradicting_evidence: string[]
  temporal_info:     TemporalInfo
  provenance_chain:  string[]
  created_at:        datetime
  updated_at:        datetime
}
```

### What It Produces (Provenance Chain)

```
ProvenanceChain {
  id:                string      // unique ID
  case_id:           string      // case identifier
  node_id:           string      // references any node or edge
  derivation:        object[]    // [{step, type, id}] full derivation chain
  depth:             int         // total steps from raw evidence
  is_independent:    boolean     // independent of other chains?
  dependency_group:  string      // group ID for dependency tracking
  source_evidence:   string[]    // all raw evidence IDs in chain
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| AnalyticsEngine (Stage 6) | source, target, type, temporal, spatial |
| HypothesisEngine (Stage 7) | All fields (for scoring) |
| ContradictionEngine (Stage 8) | source, target, confidence, source_reliability |
| GapDetectionEngine (Stage 9) | id, relationship_type, provenance_chain, source_id, target_id |
| CriticEngine (Stage 10) | Everything |

---

## Stage 6: Analytics → Analytics Results + Behavioral Baselines Stores

### What It Produces (Anomaly Signal)

```
AnomalySignal {
  id:                string      // unique ID
  case_id:           string      // case identifier
  type:              string      // "activity_burst" / "new_contact" / "location_anomaly" / "financial_anomaly"
  entity_id:         string      // references ResolvedEntity
  description:       string      // human-readable description
  baseline:          float       // what's normal
  actual:            float       // what was observed
  deviation:         float       // how many standard deviations
  significance:      string      // "low" / "medium" / "high" / "critical"
  confidence:        float       // 0-1
  time_period:       string      // when anomaly occurred
  related_edges:     string[]    // which EvidenceEdges are involved
}
```

### What It Produces (Community)

```
Community {
  id:                string      // unique ID
  case_id:           string      // case identifier
  members:           string[]    // ResolvedEntity IDs in community
  density:           float       // 0-1, how tightly connected
  internal_edges:    int         // edges within community
  external_edges:    int         // edges to outside
  description:       string      // human-readable description
  detection_method:  string      // "louvain" / "label_propagation" / etc.
}
```

### What It Produces (Centrality Score)

```
CentralityScore {
  entity_id:         string      // references ResolvedEntity
  case_id:           string      // case identifier
  degree:            float       // normalized degree centrality
  betweenness:       float       // normalized betweenness centrality
  eigenvector:       float       // normalized eigenvector centrality
  pagerank:          float       // PageRank score
  rank:              int         // overall rank in network
  
  // SEMANTIC QUALIFICATION — never expose raw centrality without role
  structural_role:   StructuralRole
}

StructuralRole {
  role:              string      // what this centrality MEANS
  
  ROLES:
  ├── "broker"       // high betweenness, bridges communities
  ├── "hub"          // high degree, many connections
  ├── "bridge"       // connects otherwise disconnected groups
  ├── "peripheral"   // low centrality, few connections
  ├── "isolated"     // disconnected from main network
  └── "ambiguous"    // centrality doesn't clearly map to role
  
  // WHY THIS MATTERS
  role_basis:        string[]    // why this role was assigned
  innocent_explanations: string[] // legitimate reasons for this centrality
  suspicious_patterns: string[]   // patterns that suggest criminal role
}
```

### Why Centrality Needs Semantic Qualification

```
DANGEROUS:
  Person A: centrality = 0.91
  Investigator sees: "A is very important!"

BETTER:
  Person A:
  ├── degree: 0.91
  ├── betweenness: 0.85
  ├── structural_role: "hub"
  ├── role_basis: ["connected to 47 people", "high call frequency"]
  ├── innocent_explanations: ["taxi driver", "dispatcher", "hotel employee"]
  └── suspicious_patterns: ["connections include known offenders", "unusual call patterns"]

  Investigator sees: "A is a hub. Could be legitimate (taxi driver) or suspicious (criminal coordinator)."
```

### Centrality Interpretation Rules

```
RULE 1: Never expose raw centrality numbers without structural role.
        "Centrality = 0.91" is meaningless.
        "Hub (connected to 47 people, many known offenders)" is actionable.

RULE 2: Always provide innocent explanations for high centrality.
        Taxi drivers, dispatchers, lawyers, hotel employees, bank employees,
        journalists, and family members can have extremely high centrality
        without criminal involvement.

RULE 3: Suspiciousness ≠ centrality.
        High centrality means structural position, not criminal importance.
        Suspiciousness is a separate score that considers:
        ├── centrality
        ├── connection quality
        ├── temporal patterns
        ├── financial anomalies
        └── other factors

RULE 4: Low centrality is also informative.
        Peripheral or isolated entities may be:
        ├── genuinely uninvolved
        ├── hiding criminal activity
        ├── new to the network
        └── using intermediaries
```

### What It Produces (Behavioral Baseline)

```
BehavioralBaseline {
  id:                string      // unique ID
  case_id:           string      // case identifier
  entity_id:         string      // references ResolvedEntity
  metric:            string      // "calls_per_day" / "avg_call_duration" / "transactions_per_month"
  mean:              float       // average value
  std_dev:           float       // standard deviation
  sample_period:     string      // date range of baseline data
  confidence:        float       // 0-1, how reliable is this baseline
  sample_size:       int         // number of data points
}
```

### What It Produces (Correlation)

```
Correlation {
  id:                string      // unique ID
  case_id:           string      // case identifier
  events:            string[]    // EvidenceEdge IDs that correlate
  event_type:        string      // "meeting" / "communication" / "transaction"
  time_alignment:    datetime    // how well times align
  location_alignment: string     // how well locations align
  confidence:        float       // 0-1
  description:       string      // human-readable
}
```

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| HypothesisEngine (Stage 7) | anomaly signals, communities, correlations, baselines |
| CriticEngine (Stage 10) | Everything (for quality checks, bias detection) |

---

## Stage 7: Hypothesis → Hypotheses Store

**Status:** Implemented (`src/hypothesis/engine.py`, writes `hypotheses.json`).

### What It Produces

One family per community — a primary plus alternatives at all five levels —
plus one always-present null hypothesis (`HYP_NULL`).

```
Hypothesis {
  id:                    string      // deterministic: generate_id("HYP", run:community:level)
  type:                  string      // one of entity | event | relationship | causal | source_error
  description:           string      // human-readable claim
  confidence:            ConfidenceDecomposition  // object, NOT a bare float
  supporting:            string[]    // IDs of the evidence behind the claim
  contradicting:         string[]    // unresolved contradiction IDs touching members
  missing:               string[]    // expected-but-absent relations, "SRC->TGT:REL"
  alternatives:          string[]    // sibling Hypothesis IDs (5 per family)
  null_hypothesis:       string      // always "HYP_NULL"
  falsifiers:            Falsifier[] // RULE 3: every hypothesis has at least one
  sensitivity:           SensitivityAnalysis
  evidence_independence: float       // 0-1
  last_updated:          datetime
  reasoning:             string      // why this level, what qualifies the claim
  pattern_matches:       string[]    // anomaly signal IDs
  generation_basis:      string      // community | community_alternative | null_hypothesis
  community_id:          string      // owning community ("" for the null)
}
```

### Contract notes

* `confidence` is a **ConfidenceDecomposition object**, not a scalar. The
  score is *derived from* the reported factors inside `build_confidence`,
  so `confidence.score == sum(f.value * f.weight)` holds by construction.
  Consumers read `confidence.score`.
* `type` is the **five-level enum** of the Falsifiable Hypothesis Model,
  not a crime taxonomy. Values such as `fraud_ring` require either a
  hand-tuned keyword map or an LLM, neither of which this pipeline has,
  so the structural composition of each community is written into
  `description` / `reasoning` instead.
* `type` on a primary is chosen by **share of one denominator** (the
  community's internal links) under the precedence entity > event >
  relationship. `source_error` and `causal` are challenge levels: always
  generated as alternatives, never as a primary.
* `supporting` holds edge IDs for a relationship primary, timeline event
  IDs for an event alternative, and edge IDs elsewhere — it is "the
  evidence behind this claim", which differs per level.
* Membership tests resolve raw extraction ids (`LOC_`, `DATE_`, `POST_`…)
  through `id_map.json` before comparing against `RES_` community
  members; without that translation nothing ever matches.
* The stage introduces **no detection threshold and no word list**. Scores
  are reported, never used to gate generation.

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| ContradictionEngine (Stage 8) | id, community_id, generation_basis |
| GapDetectionEngine (Stage 9) | id, missing, contradicting, supporting, confidence, generation_basis, community_id |
| CriticEngine (Stage 10) | Everything (for reports, queries) |

---

## Stage 8: Contradiction → Contradictions Store (Updated)

**Status:** Implemented.

Stage 8 does not detect contradictions — Stage 3 does. It adjudicates them
and routes the ones it cannot decide to Stage 9.

### Semantic boundary

`resolved` is true only when, after applying admissible evidence, **exactly
one** asserted value remains standing for the disputed key, and the survivor
plus the evidence that eliminated the others are recorded. All three
conditions are required: single survivor, externally decided, recorded.

Not resolution (explicit negatives): low severity, low impact on a
hypothesis, Stage 3 having merged the entities (the merge *created* the
conflict), a hypothesis absorbing the conflict into its `contradiction_absence`
factor, or `resolvable: false` (the opposite verdict, a different field).

Admissible evidence is a **closed whitelist**. Every entry must be independent
of this contradiction, discriminating on the disputed key, and traceable to a
stable id:

| Rule | Effect |
|------|--------|
| `source_disqualification` | a value whose *every* asserting source is Stage 1 `is_suspicious` loses standing (one clean source keeps it standing) |
| `provenance_absence` | a value with no source record loses standing |

Rejected: the per-source-type reliability matrix (a prior about record
classes, not evidence about this conflict), name similarity, temporal leeway,
amount tolerance (tuned thresholds), corroboration counts (plurality is not
truth and cannot yield a single survivor), `merge_confidence` and hypothesis
confidence (both circular), severity labels (a summary cannot settle what it
summarises), LLM verdicts. Corroboration and reliability may *rank* a
`resolution_suggestion` but never decide survivorship.

`resolvable` is true iff the surviving values span **more than one source
class**: records of one class share one failure mode, so more of them can
only outnumber, never decide; a different class has an independent
relationship to the key. When one class contradicts itself the conflict is
reported as irreducible and Stage 10 must carry it under `limitations`.

Missing extraction provenance is treated as an **input failure**, not as
absence of support: when no entity of the record can be found, nothing is
eliminated and `resolution_evidence.provenance_available` reports `false`.

### What It Produces (extends Stage 3 output)

```
Contradiction {
  // Core fields — Stage 3 output, never rewritten by Stage 8
  id:                        string
  type:                      string
  entity_ids:                string[]
  attribute:                 string
  values:                    string[]
  sources:                   string[]
  severity:                  string   // inherited, never regraded
  run_id:                    string

  // Verdict
  resolved:                  bool     // exactly one survivor under A1/A2
  resolution_note:           string   // survivor + what eliminated the rest
  resolved_by:               string   // admissible rule(s), "|"-joined
  resolvable:                bool     // survivors span >1 source class
  resolution_suggestion:     string   // what record would decide it ("" once resolved)
  resolution_evidence:       object   // standing_values, eliminated_values,
                                      // standing_sources, standing_source_classes,
                                      // admissible_rules, provenance_available

  // Hypothesis linkage (best-overlap community)
  hypothesis_id:             string   // that community's primary hypothesis
  impact_on_hypothesis:      float    // confidence gain if this were resolved

  // Provenance
  description:               string   // derived from the record itself
}
```

`impact_on_hypothesis` is a **recomputed number, not a band label**:
`0.3 * (1 / community_members)`, using Stage 7's own `W_CONTRADICTION`
weight. The four-band `negligible/minor/significant/critical` enum and
`confidence_reduction` are not produced — classifying impact would reintroduce
the thresholds this stage exists to avoid.

### Ordering

Stage 8 runs after Stage 7, so `hypotheses.json` in run N reflects the
contradiction state entering run N. The post-resolution projection travels
inside this stage's own output; Stage 8 never rewrites Stage 7's file.
Verdicts are recomputed each run from a fixed corpus and are therefore
idempotent.

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| GapDetectionEngine (Stage 9) | id, resolved, resolvable, entity_ids, attribute, hypothesis_id, impact_on_hypothesis, resolution_evidence |
| CriticEngine (Stage 10) | Everything (for reports, queries and limitations) |
| Contradiction DB table | entities, description, isResolved, resolvedById, resolvedAt |

---

## Stage 9: Gap Detection → Evidence Gaps Store

**Status:** Implemented.

Stage 9 detects and describes **missing evidence requirements**. It does not
invent evidence and does not resolve the underlying uncertainty — that stays
open and travels to Stage 10.

### Semantic boundary

A gap is **one requirement**, not one occurrence of that requirement inside a
hypothesis:

```
identity = (kind, subject, requirement)
id       = generate_id("GAP", f"{kind}:{subject}:{requirement}")
```

The hypothesis is deliberately excluded from identity. That single decision
*is* the deduplication rule: the seven hypotheses that each cite the same
absent `CALLED` relation collapse into one gap, and every citing hypothesis is
reattached through `affects_hypothesis`, with `reach` reporting its size. The
id carries no `run_id` because a gap is world state, like a `CONTRADICTION` id.

The two producers cannot collide. Four entities appear in both input stores,
but a missing `CALLED` relation between A and B and a disputed `name` record
for A are different requirements: `kind` differs **and** subject cardinality
differs (pair versus entity set). Two contradictions resolving to the same
entity set with the same attribute *do* collapse, because they are the same
requirement.

Gaps are **not** deduplicated on `data_source`: distinct requirements that
happen to be satisfied from the same place to look remain distinct.

### What does NOT become a gap

| Condition | Reason |
|-----------|--------|
| contradiction `resolved: true` | the requirement no longer exists |
| contradiction `resolvable: false` | Stage 8's limitation for Stage 10, not missing evidence |
| `provenance_available: false` | input failure, not absence of evidence |
| malformed record (no requirement, or both endpoints collapsing onto one entity) | describes no requirement |

`resolvable: false` is the one most easily mistaken for a gap. Stage 8 reports
it when records of a single source class contradict each other — nothing can
be *gathered* to settle that; it belongs under Stage 10's `limitations`.

### What It Produces

`evidence_gaps.json` — a list, sorted by `kind` → `subject` → `requirement`:

```
EvidenceGap {
  id:                    string    // generate_id("GAP", ...), stable across runs
  kind:                  string    // "missing_relation" | "unresolved_attribute"
  subject:               string[]  // sorted resolved entity ids (a pair for relations)
  requirement:           string    // expected_relation for relations, attribute for attributes
  description:           string    // factual statement of what is absent and where to look
  affects_hypothesis:    string[]  // hypotheses citing this requirement; may be empty
  feasible:              boolean   // whether any source class remains available
  suggested_action:      string    // derived template: requirement + subject + data_source
  data_source:           string[]  // source classes to consult
  reach:                 int       // len(affects_hypothesis)
  impact_on_hypothesis:  float     // conditional confidence delta on the citing primary
  run_id:                string
}
```

### What it does NOT produce

* **`discrimination` and `information_gain`** — both require a posterior over
  competing hypotheses, and this pipeline has no probabilistic model. They are
  absent from the contract, not zeroed: a placeholder `0.0` would be read
  downstream as a measured quantity.
* **`impact` bands** (`low`/`medium`/`high`) — replaced by `reach` (how many
  hypotheses the requirement touches) and `impact_on_hypothesis` (how far it
  moves one).
* **`InvestigatorAction`** — deferred to a later stage. Its `type` enum maps
  both gap kinds to `collect_records`, and `deadline` / `legal_authority`
  would have to be fabricated.

### `data_source` derivation (structural, no word list)

| Kind | Derivation |
|------|------------|
| `unresolved_attribute` | corpus source classes **minus** the classes that already assert the key (the complement of `standing_source_classes`) |
| `missing_relation` | source classes observed carrying `expected_relation` elsewhere in the graph; when the expected relation is a derived predicate with no carriers of its own (e.g. `SHARED_ASSOCIATE`), falls back to classes observed carrying any edge incident to either subject |

`feasible` is `bool(data_source)`.

### `impact_on_hypothesis`

* **attribute gap** — Stage 8's own recomputation, reused rather than
  re-derived (Stage 8 is frozen).
* **relation gap** — the predicted `missing_edges.confidence` is injected as
  the score the missing record would carry, anchored on the hypothesis's own
  reported score so the invariant a consumer can rely on holds exactly:
  `confidence.score + impact_on_hypothesis == recomputed score with the
  record present`.

  The value may be **negative**: `corroboration` is a mean and the predicted
  confidence sits below this corpus's family means, so a gathered record
  would dilute rather than strengthen. A reported `0.0` is a measurement
  too — it means there is no citing primary, or the missing edge touches the
  community without sitting inside it (Stage 7's `_missing_for` fallback), so
  it could never become internal supporting evidence.

### Ordering

Stage 9 runs after Stage 8 and before Stage 11. It reads
`hypotheses.json`, `contradictions.json` and `missing_edges.json`, and never
writes any of them.

### Who Reads It

| Consumer | What It Uses |
|----------|-------------|
| CriticEngine (Stage 10) | id, kind, subject, requirement, reach, impact_on_hypothesis, description |
| Investigator Interface | description, suggested_action, data_source, feasible |

---

## Stage 10: Critic → Investigator Interface

**Status:** Partially implemented. The current pipeline writes `critic_review.json`
with bounded structural checks and optional LLM findings whose target/evidence
references are validated against supplied IDs. It is read-only and requires
human review. The full `InvestigationReport`, query answering, confidence
calibration, and action recommendation interface below remain design only.

> `recommended_actions` below names `InvestigatorAction` IDs, but
> InvestigatorAction is **deferred** — Stage 9 does not produce it (its `type`
> enum maps both gap kinds to `collect_records`, and `deadline` /
> `legal_authority` would be fabricated). Stage 10 must re-decide whether to
> emit an action store and what shape it takes.

### What It Produces (Investigation Report)

```
InvestigationReport {
  case_id:               string      // case identifier
  run_id:                string      // which pipeline run produced this
  generated_at:          datetime    // when generated
  
  // PRIMARY FINDING (mandatory)
  primary_hypothesis:    string      // Hypothesis ID
  hypothesis_confidence: float       // SEMANTIC: hypothesis confidence
  hypothesis_type:       string      // "fraud_ring" / "drug_trafficking" / etc.
  hypothesis_description: string     // human-readable explanation
  
  // EVIDENCE (mandatory — never omit)
  key_evidence:          string[]    // most important EvidenceEdge IDs
  evidence_summary:      string      // human-readable evidence description
  
  // UNCERTAINTY (mandatory — never omit)
  evidence_independence: float       // how independent are supporting sources
  independent_source_count: int      // how many independent dependency groups
  source_reliability_avg: float      // average source reliability
  coverage_ratio:        float       // what % of expected data do we have
  provenance_depth_avg:  float       // average depth from raw evidence
  
  // ALTERNATIVES (mandatory — never omit)
  alternative_hypotheses: object[]   // [{id, confidence, description}]
  null_hypothesis:       object      // {id, confidence, description}
  
  // CONTRADICTIONS (mandatory — never omit)
  key_contradictions:    string[]    // most important Contradiction IDs
  contradiction_summary: string      // human-readable contradiction description
  
  // GAPS (mandatory — never omit)
  evidence_gaps:         string[]    // most important EvidenceGap IDs
  gap_summary:           string      // human-readable gap description
  
  // ACTIONS (mandatory — never omit)
  recommended_actions:   string[]    // most important InvestigatorAction IDs
  
  // LIMITATIONS (mandatory — never omit)
  limitations:           string[]    // what the system can't determine
  assumptions:           string[]    // what assumptions were made
  
  // BIAS CHECK (mandatory — never omit)
  bias_check: {
    confirmation_bias:   string      // "none_detected" / "possible" / "detected"
    anchoring_bias:      string
    availability_bias:   string
    independence_bias:   string
    investigation_feedback_bias: string
    adversarial_risk:    string
    model_drift_risk:    string
  }
  
  // CALIBRATION (mandatory — never omit)
  calibration: {
    original_confidence: float       // before calibration
    adjusted_confidence: float       // after calibration
    adjustments_made:   string[]     // what was adjusted and why
    calibration_confidence: float    // how confident in the calibration
  }
}
```

### Mandatory Fields Rule

```
RULE: The following fields MUST be present in every InvestigationReport.
      If data is unavailable, field must be present with value "UNKNOWN" + explanation.

MANDATORY:
├── primary_hypothesis
├── hypothesis_confidence
├── key_evidence (may be empty array + explanation)
├── evidence_independence
├── independent_source_count
├── coverage_ratio
├── alternative_hypotheses (may be empty + explanation)
├── null_hypothesis
├── key_contradictions (may be empty array + explanation)
├── evidence_gaps (may be empty array + explanation)
├── recommended_actions (may be empty array + explanation)
├── limitations
├── assumptions
├── bias_check (all subfields)
└── calibration (all subfields)

NEVER OMIT:
├── Don't hide low confidence
├── Don't hide contradictions
├── Don't hide gaps
├── Don't hide limitations
├── Don't hide bias concerns
└── Transparency > politeness
```

### What It Produces (Query Result)

```
QueryResult {
  query:                 string      // original question
  answer:                string      // text answer
  confidence:            float       // 0-1
  supporting_evidence:   string[]    // EvidenceEdge IDs
  contradicting_evidence: string[]   // EvidenceEdge IDs
  limitations:           string[]    // what's not known
  suggested_followup:    string[]    // related questions to ask
}
```

---

## Complete Output Map

```
STAGE 1 (Ingestion)
└── RawEvidence
    └── → raw_evidence_store
        └── Read by: Stage 2, Stage 4, Stage 10

STAGE 2 (Extraction)
├── ExtractedEntity
│   └── → extracted_entities_store
│       └── Read by: Stage 3
└── ExtractedRelation
    └── → extracted_relations_store
        └── Read by: Stage 3, Stage 4, Stage 5

STAGE 3 (Resolution)
├── ResolvedEntity
│   └── → resolved_entities_store
│       └── Read by: Stage 5, Stage 6, Stage 7, Stage 8, Stage 10
├── UnknownEntity
│   └── → unknown_entities_store
│       └── Read by: Stage 5, Stage 10
└── Contradiction
    └── → contradictions_store
        └── Read by: Stage 7, Stage 8, Stage 10

STAGE 4 (Temporal)
├── TemporalInfo
│   └── → temporal_spatial_store
│       └── Read by: Stage 5, Stage 6, Stage 10
├── SpatialInfo
│   └── → temporal_spatial_store
│       └── Read by: Stage 5, Stage 6, Stage 10
└── CoverageInterval
    └── → temporal_spatial_store
        └── Read by: Stage 6, Stage 7, Stage 9, Stage 10

STAGE 5 (Graph Builder)
├── EvidenceEdge
│   └── → evidence_edges_store
│       └── Read by: Stage 6, Stage 7, Stage 8, Stage 9, Stage 10
└── ProvenanceChain
    └── → provenance_store
        └── Read by: Stage 6, Stage 7, Stage 10

STAGE 6 (Analytics)
├── AnomalySignal
│   └── → analytics_results_store
│       └── Read by: Stage 7, Stage 10
├── Community
│   └── → analytics_results_store
│       └── Read by: Stage 7, Stage 10
├── CentralityScore
│   └── → analytics_results_store
│       └── Read by: Stage 7, Stage 10
├── Correlation
│   └── → analytics_results_store
│       └── Read by: Stage 7, Stage 10
├── BehavioralBaseline
│   └── → behavioral_baselines_store
│       └── Read by: Stage 7, Stage 10
├── DeduplicatedEvent
│   └── → deduplicated_events_store
│       └── Read by: Stage 7, Stage 10
├── BackgroundAdjustedAnomaly
│   └── → analytics_results_store
│       └── Read by: Stage 7, Stage 10
└── CausalityFlag
    └── → temporal_spatial_store
        └── Read by: Stage 7, Stage 10

STAGE 7 (Hypothesis)
└── Hypothesis
    └── → hypotheses_store
        └── Read by: Stage 8, Stage 9, Stage 10

STAGE 8 (Contradiction)
└── Contradiction (updated)
    └── → contradictions_store
        └── Read by: Stage 9, Stage 10

STAGE 9 (Gap Detection)
└── EvidenceGap
    └── → evidence_gaps_store
        └── Read by: Stage 10

STAGE 10 (Critic)
├── InvestigationReport
│   └── → investigator_interface
└── QueryResult
    └── → investigator_interface

STAGE 11 (Global Entity Push)
├── GlobalEntity
│   └── → global_entities_store
│       └── Read by: Stage 12
├── GlobalEntityLink
│   └── → global_entity_links_store
│       └── Read by: Stage 12
└── CrossCaseAlert
    └── → cross_case_alerts_store
        └── Read by: Stage 12

STAGE 12 (Scoped Analytics)
└── ScopedAnalytics (on-demand, not stored permanently)
    └── → investigator_interface
```

---

## New Output Types

### Deduplicated Event (Stage 6)

```
DeduplicatedEvent {
  id:                string      // unique ID
  event_type:        string      // "meeting" / "communication" / "transaction"
  participants:      string[]    // ResolvedEntity IDs involved
  time:              object      // {start, end, precision}
  location:          object      // {lat, lon, radius} if known
  evidence_count:    int         // how many observations support this event
  evidence_ids:      string[]    // which EvidenceEdge/TemporalInfo IDs
  is_deduplicated:   boolean     // were multiple observations merged?
  confidence:        float       // 0-1
}
```

### Background-Adjusted Anomaly (Stage 6)

```
BackgroundAdjustedAnomaly {
  id:                string      // unique ID
  entity_id:         string      // references ResolvedEntity
  anomaly_type:      string      // "activity_burst" / "location_anomaly" / etc.
  individual_deviation: float   // how unusual for this person
  population_deviation: float   // how unusual for this environment
  combined_score:    float       // individual × population deviation
  is_significant:    boolean     // is this actually interesting?
  baseline_ids:      string[]    // which baselines were used
}
```

### Causality Flag (Stage 4/6)

```
CausalityFlag {
  id:                string      // unique ID
  event_a:           string      // EvidenceEdge ID
  event_b:           string      // EvidenceEdge ID
  relationship:      string      // "TEMPORAL_PRECEDENCE" / "CAUSAL_RELATION" / "CORRELATION"
  confidence:        float       // 0-1 (causal claims need higher confidence)
  evidence_for_causation: string[] // what supports causal link
  alternative_explanations: string[] // what else could explain sequence
}
```

### Multiplexity Tie (Stage 5)

```
MultiplexityTie {
  id:                string      // unique ID
  entity_a:          string      // ResolvedEntity ID
  entity_b:          string      // ResolvedEntity ID
  tie_types:         string[]    // ["communication", "financial", "social", "criminal"]
  tie_count:         int         // how many different relationship types
  tie_strength:      float       // 0-1, how strong is the multiplex tie
  is_cross_domain:   boolean     // does this cross criminal/personal/legitimate domains?
  domain_mapping:    object      // {criminal: [...], personal: [...], legitimate: [...]}
}
```

### Adversarial Edge Detection (Stage 5/6)

```
AdversarialEdgeScore {
  edge_id:           string      // EvidenceEdge ID
  naturalness_score: float       // 0-1, how natural is this edge?
  temporal_consistency: float    // 0-1, do timestamps make sense?
  source_reliability: float      // 0-1, is source trustworthy?
  network_coherence: float       // 0-1, does edge fit network structure?
  behavioral_consistency: float  // 0-1, do entities behave consistently?
  overall_score:     float       // 0-1, combined adversarial risk
  is_suspicious:     boolean     // should this edge be flagged?
  flags:             string[]    // specific concerns
}
```

---

## Stage 11: Global Entity Push Outputs

**Status:** Implemented.

### global_entities.json
```json
{
  "canonical_id": "uuid",
  "entity_type": "PERSON",
  "canonical_name": "Rakesh Kumar",
  "phones": ["9876543210"],
  "accounts": ["ACC001"],
  "addresses": ["Delhi"],
  "first_seen": "2026-01-01T00:00:00Z",
  "last_seen": "2026-08-31T00:00:00Z",
  "total_cases": 3,
  "total_jurisdictions": 2
}
```

### global_entity_links.json
```json
{
  "global_entity_id": "uuid",
  "case_id": "CASE_001",
  "local_entity_id": "ENTITY_001",
  "jurisdiction_node_id": "JN_DL_001",
  "confidence": 0.95,
  "match_type": "phone_exact"
}
```

### cross_case_alerts.json
```json
{
  "global_entity_id": "uuid",
  "severity": "HIGH",
  "case_ids": ["CASE_001", "CASE_002"],
  "jurisdiction_node_ids": ["JN_DL_001", "JN_MH_001"],
  "recommendation": "Entity appears in 2 jurisdictions. Review for cross-jurisdiction coordination."
}
```

## Stage 12: Scoped Analytics Outputs (On-Demand)

**Status:** Partially implemented for declared multi-case manifests. The
current `scoped_analytics.json` contains per-case entity/relation totals,
shared Stage 11 identities, and cross-case alerts. It does not merge local
graphs or combine evidence or risk scores.

### scoped_analytics.json
Computed on-demand, not stored permanently. Contains centrality, communities, anomaly signals for merged graph across multiple Cases.

---

## Data Counts per Stage

```
STAGE 1: 1 file in → 1 RawEvidence out
STAGE 2: 1 RawEvidence in → N ExtractedEntities + M ExtractedRelations out
STAGE 3: N ExtractedEntities in → N' ResolvedEntities + U UnknownEntities + C Contradictions out
STAGE 4: M ExtractedRelations + N' ResolvedEntities in → T TemporalInfos + S SpatialInfos + COV CoverageIntervals out
STAGE 5: N' ResolvedEntities + M ExtractedRelations in → E EvidenceEdges + P ProvenanceChains out
STAGE 6: E EvidenceEdges + N' ResolvedEntities in → A AnomalySignals + COM Communities + CE CentralityScores + CORR Correlations + B Baselines out
STAGE 7: [implemented] A + COM + CE + CORR + B in → H Hypotheses out
STAGE 8: [implemented] H + E in → C' Contradictions (updated) out
STAGE 9: [implemented] H + C' in → G EvidenceGaps out
STAGE 10: [partial] hypotheses + contradictions + gaps + graph references → critic_review.json (read-only)
STAGE 11: [implemented] ResolvedEntities + ResolvedEntities (cross-case) in → GE GlobalEntities + GEL GlobalEntityLinks + CCA CrossCaseAlerts out
STAGE 12: [partial] declared case set + Stage 11 links → per-case totals + shared identities (no graph merge)
```

---

## FIR Lifecycle (Revision 3+)

FIR has three independent lifecycle dimensions (replaces single `status` field):

```
FIR {
  id:                    string
  firNumber:             string      // jurisdiction-scoped unique: @@unique([firNumber, jurisdictionNodeId])
  caseId:                string      // unique FK — Case ↔ FIR is 1:1
  jurisdictionNodeId:    string      // links to JurisdictionNode

  // THREE LIFECYCLE DIMENSIONS (independent of each other)
  investigation_status:  string      // e.g., OPEN, UNDER_INVESTIGATION, CHARGE_SHEET_FILED, CLOSED
  legal_disposition:     string      // e.g., PENDING, ABETTED, DISMISSED, CONVICTED, ACQUITTED
  record_status:         string      // e.g., ACTIVE, SUPERSEDED, ARCHIVED

  // All other FIR fields...
}
```

FIR lifecycle is independent from CaseRelationship, Workspace, and AnalysisRun.

---

## AnalysisRun (Revision 3+)

AnalysisRun is an immutable historical execution snapshot (separate from PipelineRun).

```
AnalysisRun {
  id:                    string
  run_id:                string      // links to PipelineRun
  case_id:               string
  jurisdiction_node_id:  string
  started_at:            datetime
  completed_at:          datetime
  status:                string      // "completed" / "failed"
  // Input snapshots are NOT stored here — they go in AnalysisRunResult
}

AnalysisRunCase {
  analysis_run_id:       string
  case_id:               string
}

AnalysisRunResult {
  id:                    string
  analysis_run_id:       string      // links to AnalysisRun
  result_type:           string      // what kind of result
  result_data:           object      // the actual result
  input_snapshot:        object      // INPUT SNAPSHOT — captures the state of inputs at execution time
  created_at:            datetime
}

Finding {
  id:                    string
  analysis_run_id:       string
  finding_type:          string
  description:           string
  confidence:            float
  evidence_refs:         string[]
}
```

AnalysisRun is immutable. Input snapshots are stored in AnalysisRunResult, not in AnalysisRun itself. This preserves reproducibility and audit trail.
