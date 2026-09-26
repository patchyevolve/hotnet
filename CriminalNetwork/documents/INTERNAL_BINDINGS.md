# INTERNAL BINDINGS — How Components Connect

> Every component references something. Every reference has rules. This document defines all connections.

---

## Stage → Model Mapping

Stores serve one or more of the five analytical models (see SYSTEM_STRUCTURE.md):

```
Model 1: Evidence Model
  └── Stores: RAW_EVIDENCE_STORE, EXTRACTED_ENTITIES_STORE, EXTRACTED_RELATIONS_STORE

Model 2: Provenance Model
  └── Stores: PROVENANCE_STORE, CONTRADICTIONS_STORE (derivation tracking)

Model 3: Coverage Model
  └── Stores: TEMPORAL_SPATIAL_STORE (coverage gaps, NOT_SEARCHED vs NOT_OBSERVED)

Model 4: Entity State Model
  └── Stores: RESOLVED_ENTITIES_STORE, UNKNOWN_ENTITIES_STORE

Model 5: Hypothesis & Investigation
  └── Stores: EVIDENCE_EDGES_STORE, ANALYTICS_RESULTS_STORE, HYPOTHESIS_STORE,
              EVIDENCE_GAPS_STORE, INVESTIGATOR_ACTIONS_STORE, BEHAVIORAL_BASELINES_STORE

ML Layer (cross-cutting):
  └── Stores: FEATURE_STORE, GNN_PREDICTIONS_STORE, BN_INFERENCE_STORE,
              TEMPORAL_ANALYSIS_STORE, ADVERSARIAL_ASSESSMENT_STORE,
              INFORMATION_GAIN_STORE, EXPLANATION_STORE

Meta:
  └── Stores: AUDIT_STORE (all stages), INVESTIGATION_FEEDBACK_STORE (Critic)
```

---

## The Core Principle

```
Components NEVER call each other directly.
Components communicate ONLY through stores.

Engine A → writes to Store X → Engine B reads from Store X

This means:
├── Engines are independent
├── Stores are the single source of truth
├── Any engine can be replaced without breaking others
└── All data is traceable through stores
```

---

## Store Connections

### Store → What Writes To It → What Reads From It

```
RAW_EVIDENCE_STORE
├── Written by: IngestionEngine (Stage 1)
├── Read by: ExtractionEngine (Stage 2)
├── Read by: TemporalEngine (Stage 4)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Original data, never modified after write

EXTRACTED_ENTITIES_STORE
├── Written by: ExtractionEngine (Stage 2)
├── Read by: ResolutionEngine (Stage 3)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Raw NER output before deduplication

EXTRACTED_RELATIONS_STORE
├── Written by: ExtractionEngine (Stage 2)
├── Read by: ResolutionEngine (Stage 3)
├── Read by: TemporalEngine (Stage 4)
├── Read by: GraphBuilderEngine (Stage 5)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Raw relation extraction before deduplication

RESOLVED_ENTITIES_STORE
├── Written by: ResolutionEngine (Stage 3)
├── Read by: GraphBuilderEngine (Stage 5)
├── Read by: AnalyticsEngine (Stage 6)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: ContradictionEngine (Stage 8)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Deduplicated entities with canonical IDs

UNKNOWN_ENTITIES_STORE
├── Written by: ResolutionEngine (Stage 3)
├── Read by: GraphBuilderEngine (Stage 5)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Unresolved entities preserved as nodes

CONTRADICTIONS_STORE
├── Written by: ResolutionEngine (Stage 3)
├── Written by: ContradictionEngine (Stage 8)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
├── Purpose: All contradictions (attribute + evidence)
└── Semantics: Append-only with run_id versioning. Never overwrite previous run data.

TEMPORAL_SPATIAL_STORE
├── Written by: TemporalEngine (Stage 4)
├── Read by: GraphBuilderEngine (Stage 5)
├── Read by: AnalyticsEngine (Stage 6)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Normalized time and location data

EVIDENCE_EDGES_STORE
├── Written by: GraphBuilderEngine (Stage 5)
├── Read by: AnalyticsEngine (Stage 6)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: ContradictionEngine (Stage 8)
├── Read by: GapDetectionEngine (Stage 9)
├── Read by: CriticEngine (Stage 10)
└── Purpose: The graph itself (nodes + edges)

PROVENANCE_STORE
├── Written by: GraphBuilderEngine (Stage 5)
├── Read by: AnalyticsEngine (Stage 6)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
└── Purpose: How each node/edge was derived

ANALYTICS_RESULTS_STORE
├── Written by: AnalyticsEngine (Stage 6)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Computed metrics, anomalies, patterns

BEHAVIORAL_BASELINES_STORE
├── Written by: AnalyticsEngine (Stage 6)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
└── Purpose: What "normal" looks like per entity

HYPOTHESES_STORE
├── Written by: HypothesisEngine (Stage 7)
├── Read by: ContradictionEngine (Stage 8)
├── Read by: GapDetectionEngine (Stage 9)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Competing explanations with scores

EVIDENCE_GAPS_STORE
├── Written by: GapDetectionEngine (Stage 9)
├── Read by: CriticEngine (Stage 10)
└── Purpose: What's missing and why it matters

INVESTIGATOR_ACTIONS_STORE
├── Written by: GapDetectionEngine (Stage 9)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Recommended next steps

AUDIT_STORE
├── Written by: ALL stages
├── Read by: CriticEngine (Stage 10)
└── Purpose: Complete audit trail

FEATURE_STORE
├── Written by: IngestionEngine (Stage 1)
├── Read by: GNNEngine (Stage 6 sub-stage)
├── Read by: BNEngine (Stage 7)
├── Read by: TemporalEngine (Stage 6 sub-stage)
├── Read by: AdversarialEngine (Stage 8)
└── Purpose: ML features with uncertainty metadata

GNN_PREDICTIONS_STORE
├── Written by: GNNEngine (Stage 6 sub-stage)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
└── Purpose: GNN predictions with uncertainty intervals

BN_INFERENCE_STORE
├── Written by: BNEngine (Stage 7)
├── Read by: GapDetectionEngine (Stage 9)
├── Read by: CriticEngine (Stage 10)
└── Purpose: BN inference results with posterior distributions

TEMPORAL_ANALYSIS_STORE
├── Written by: TemporalEngine (Stage 6 sub-stage)
├── Read by: HypothesisEngine (Stage 7)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Temporal analysis with change metrics

ADVERSARIAL_ASSESSMENT_STORE
├── Written by: AdversarialEngine (Stage 8)
├── Read by: CriticEngine (Stage 10)
└── Purpose: Threat assessments with confidence

INFORMATION_GAIN_STORE
├── Written by: BNEngine (Stage 7)
├── Read by: GapDetectionEngine (Stage 9)
└── Purpose: Ranked evidence to obtain with investigative value scores

EXPLANATION_STORE
├── Written by: GNNEngine, BNEngine, TemporalEngine, AdversarialEngine
├── Read by: CriticEngine (Stage 10)
└── Purpose: Human-readable explanations for ML predictions
```

---

## Global Entity Store Bindings

### GlobalEntityStore
- Writes: Stage 11 (Global Entity Push)
- Reads: Stage 12 (Scoped Analytics), all stages (for context)
- Fields: canonical_id, entity_type, canonical_name, phones, accounts, addresses, first_seen, last_seen, total_cases, total_jurisdictions

### GlobalEntityLinkStore
- Writes: Stage 11 (Global Entity Push)
- Reads: Stage 12 (Scoped Analytics)
- Fields: global_entity_id, case_id, local_entity_id, jurisdiction_node_id, confidence, match_type

### CrossCaseAlertStore
- Writes: Stage 11 (Global Entity Push)
- Reads: Human review queue
- Fields: global_entity_id, severity, case_ids, jurisdiction_node_ids, recommendation

### JurisdictionNodeStore
- Writes: Migration scripts, human admin
- Reads: All stages (for jurisdiction context)
- Fields: id, name, node_type, parent_id, status, code, valid_from, valid_to

### UnresolvedJurisdictionStore
- Writes: Stage 1 (Ingestion) — parser outputs
- Reads: Human resolution queue
- Fields: raw_text, source_file, source_type, confidence, status

### CaseJurisdictionLinkStore
- Writes: Stage 1 (when case created), Stage 11 (transfers)
- Reads: Stage 12 (scoped analytics), human review
- Fields: case_id, jurisdiction_node_id, link_type, description

---

## Entity ID Bindings

### The Canonical ID System

```
Every entity gets ONE canonical ID at resolution stage.
This ID is used everywhere after resolution.

LIFECYCLE:
1. Raw text → ExtractedEntity (ext_001, ext_002, ...)
2. Deduplication → ResolvedEntity (res_001, res_002, ...)
3. All downstream use res_* IDs
4. ext_* IDs preserved in provenance for traceability

ADDITIONAL ID SCOPE:
- global_canonical_id: assigned by Stage 11 (Global Entity Push), stable across all Cases
- local_entity_id: scoped to a Case, assigned by Stage 3 (Resolution)
```

### Cross-Store References

```
RESOLVED_ENTITIES_STORE
├── id: "res_001"
├── source_entities: ["ext_001", "ext_005", "ext_012"]
│   └── These reference EXTRACTED_ENTITIES_STORE
├── roles: [{event: "FIR_1234", role: "accused"}]
│   └── event references RAW_EVIDENCE_STORE
└── This entity is referenced by:
    ├── EVIDENCE_EDGES_STORE (as source or target)
    ├── ANALYTICS_RESULTS_STORE (in anomaly signals)
    ├── HYPOTHESES_STORE (in supporting/contradicting)
    └── PROVENANCE_STORE (in derivation chains)
```

### Edge ID Bindings

```
EVIDENCE_EDGES_STORE
├── id: "edge_001"
├── source: "res_001"
│   └── References RESOLVED_ENTITIES_STORE
├── target: "res_002"
│   └── References RESOLVED_ENTITIES_STORE
├── derived_from: ["raw_002"]
│   └── References RAW_EVIDENCE_STORE
└── This edge is referenced by:
    ├── ANALYTICS_RESULTS_STORE (in patterns)
    ├── HYPOTHESES_STORE (in supporting/contradicting)
    ├── CONTRADICTIONS_STORE (in evidence_for/against)
    └── EVIDENCE_GAPS_STORE (in what's missing)
```

### Unknown Entity Bindings

```
UNKNOWN_ENTITIES_STORE
├── id: "unk_001"
├── source_entity: "ext_008"
│   └── References EXTRACTED_ENTITIES_STORE
├── source_id: "raw_004"
│   └── References RAW_EVIDENCE_STORE
├── possible_matches: ["res_003"]
│   └── References RESOLVED_ENTITIES_STORE (low confidence)
└── This unknown is referenced by:
    ├── EVIDENCE_EDGES_STORE (as source or target)
    └── HYPOTHESES_STORE (as missing identity)
```

---

## Provenance Bindings

### The Derivation Chain

```
Every node/edge traces back to raw evidence.

CHAIN:
RawEvidence → ExtractedEntity → ResolvedEntity → EvidenceEdge → Hypothesis
    ↓              ↓                ↓                ↓             ↓
  raw_001       ext_001          res_001          edge_001      hyp_001

PROVENANCE RECORD:
{
  node_id: "hyp_001",
  derivation: [
    {step: 1, type: "raw_evidence", id: "raw_001"},
    {step: 2, type: "extracted_entity", id: "ext_001"},
    {step: 3, type: "resolved_entity", id: "res_001"},
    {step: 4, type: "evidence_edge", id: "edge_001"},
    {step: 5, type: "hypothesis", id: "hyp_001"}
  ],
  depth: 5,
  is_independent: true
}
```

### Dependency Group Bindings

```
DEPENDENCY GROUPS:
Entities derived from the same raw evidence belong to the same group.

Example:
FIR #1234 mentions Rakesh, Suresh, and a phone call.
├── ext_001 (Rakesh) → group_A
├── ext_002 (Suresh) → group_A
├── ext_003 (phone)  → group_A
└── All derived from raw_001 (FIR #1234)

RULE: Evidence from group_A cannot corroborate other evidence from group_A.
      They share the same source, so they're dependent.
```

---

## Temporal Bindings

### Event Timeline Connections

```
TEMPORAL_SPATIAL_STORE
├── id: "temp_001"
├── entity_id: "res_001"
│   └── References RESOLVED_ENTITIES_STORE
├── event_type: "call"
└── Connected to:
    ├── EVIDENCE_EDGES_STORE edge_001 (the call edge)
    ├── EVIDENCE_EDGES_STORE edge_005 (another call)
    └── ANALYTICS_RESULTS_STORE (temporal patterns)

TEMPORAL ALIGNMENT:
All events aligned to UTC timeline.
├── FIR date: "15/03/2024" → 2024-03-15T00:00:00Z to 2024-03-15T23:59:59Z
├── CDR time: "14:32:00" → 2024-03-15T14:32:00Z
├── Surveillance: "14:30 to 16:45" → 2024-03-15T14:30:00Z to 2024-03-15T16:45:00Z
└── Bank: "2024-02-20 14:32:00" → 2024-02-20T14:32:00Z
```

### Coverage Interval Connections

```
COVERAGE MODEL (in TEMPORAL_SPATIAL_STORE):
Per entity, per source, track intervals.

For res_001 (Rakesh):
├── CDR coverage:
│   ├── 2024-01-01 to 2024-03-20: OBSERVED
│   ├── 2023-10-01 to 2023-12-31: NOT_OBSERVED (data expired)
│   └── 2024-03-21 to present: NOT_SEARCHED
├── Bank coverage:
│   ├── 2024-01-01 to 2024-03-20: OBSERVED
│   └── Before 2024-01-01: NOT_OBSERVED
└── Surveillance coverage:
    ├── 2024-02-15 to 2024-03-15: OBSERVED (3 sightings)
    └── Before 2024-02-15: NOT_OBSERVED
```

---

## Analytics Bindings

### Baseline → Anomaly Connections

```
BEHAVIORAL_BASELINES_STORE
├── id: "base_001"
├── entity_id: "res_001"
│   └── References RESOLVED_ENTITIES_STORE
├── metric: "calls_per_day"
├── mean: 5.2
└── Connected to:
    └── ANALYTICS_RESULTS_STORE anomaly_001
        ├── entity_id: "res_001"
        ├── baseline_id: "base_001"
        ├── metric: "calls_per_day"
        ├── actual: 15
        └── deviation: 3.0

BINDING RULE:
Anomaly always references its baseline.
Baseline always references its entity.
This creates the chain: anomaly → baseline → entity.
```

### Pattern → Hypothesis Connections

```
ANALYTICS_RESULTS_STORE
├── id: "pattern_001"
├── type: "communication_burst"
├── entities: ["res_001", "res_002"]
└── Connected to:
    └── HYPOTHESES_STORE hyp_001
        ├── supporting: ["edge_001", "edge_005", "ano_001"]
        └── pattern_match: "pattern_001"

BINDING RULE:
Hypothesis references the patterns that support it.
Pattern references the entities involved.
This creates the chain: hypothesis → pattern → entities.
```

---

## Contradiction Bindings

### The Three-Way Contradiction Reference

```
CONTRADICTIONS_STORE
├── id: "con_001"
├── type: "location_conflict"
├── hypothesis_id: "hyp_001"
│   └── References HYPOTHESES_STORE
├── evidence_for: "edge_002"
│   └── References EVIDENCE_EDGES_STORE
├── evidence_against: "edge_004"
│   └── References EVIDENCE_EDGES_STORE
└── source_reliability:
    ├── for: 0.7 (FIR = manual)
    └── against: 0.95 (CDR = automated)

BINDING RULE:
Contradiction always references:
1. Which hypothesis it affects
2. What evidence supports the hypothesis
3. What evidence contradicts the hypothesis
4. Reliability of each source
```

---

## Gap Detection Bindings

### Gap → Hypothesis → Evidence Chain

```
EVIDENCE_GAPS_STORE
├── id: "gap_001"
├── description: "No bank statement for Suresh"
├── affects_hypothesis: "hyp_001"
│   └── References HYPOTHESES_STORE
├── discrimination: 0.8
│   └── How much this would distinguish H1 from H2
└── Connected to:
    └── INVESTIGATOR_ACTIONS_STORE act_001
        ├── type: "collect_records"
        ├── addresses_gap: "gap_001"
        │   └── References EVIDENCE_GAPS_STORE
        └── priority: 1

BINDING RULE:
Gap references the hypothesis it affects.
Action references the gap it addresses.
This creates the chain: action → gap → hypothesis.
```

---

## The Critic's Bindings

### The Critic Reads Everything

```
CRITIC_ENGINE
├── Reads from ALL stores
├── Never writes to processing stores
├── Only writes to:
│   ├── INVESTIGATOR_ACTIONS_STORE (recommended actions)
│   └── AUDIT_STORE (audit trail)
└── This ensures the critic doesn't contaminate the data

BINDING RULE:
Critic is read-only on all analytical stores.
This prevents feedback loops.
```

---

## The Audit Trail

### Every Operation Logged

```
AUDIT_STORE
├── Every stage writes here
├── Records:
│   ├── stage_id: which stage
│   ├── operation: what was done
│   ├── input: what was read
│   ├── output: what was written
│   ├── timestamp: when
│   ├── confidence: any scores assigned
│   ├── provenance: derivation chain
│   ├── jurisdiction_node_id: jurisdiction context for the operation
│   └── case_id: case scope for the operation
└── Purpose: Complete traceability

BINDING RULE:
Every write to any store also writes to audit store.
Audit store is append-only (never modified).
```

---

## Dependency Groups — First-Class Identifier

Every piece of evidence belongs to a dependency group. This is not optional metadata — it is a first-class identifier that affects all downstream reasoning.

### What Is a Dependency Group

```
A dependency group is a set of evidence items that share a common root source.

EXAMPLE:
Root source: FIR #1234 (raw_001)
├── raw_001: FIR text (dependency_group = "grp_001")
├── raw_002: News article about FIR (dependency_group = "grp_001")
├── raw_003: Social media post about news (dependency_group = "grp_001")
├── ext_001: Entity "Rakesh" extracted from FIR (dependency_group = "grp_001")
├── ext_002: Entity "Suresh" extracted from FIR (dependency_group = "grp_001")
├── ext_003: Entity "Rakesh" extracted from news (dependency_group = "grp_001")
└── edge_001: Relationship "Rakesh called Suresh" from FIR (dependency_group = "grp_001")

ALL of these share dependency_group = "grp_001"
ALL are derived from the same root: FIR #1234
```

### Dependency Group Rules

```
RULE 1: Evidence from same dependency_group cannot corroborate each other.
        They share the same root source, so they're dependent.

RULE 2: Confidence is based on INDEPENDENT dependency groups, not item count.
        3 items from grp_001 + 1 item from grp_002 = 2 independent sources, not 4.

RULE 3: Dependency group is assigned at ingestion, never changes.
        Inherited from root source.

RULE 4: Dependency group propagates through entire pipeline.
        Stage 2 extraction, Stage 3 resolution, Stage 5 graph building
        all check dependency_group before treating evidence as independent.
```

### Dependency Group in Stores

```
RAW_EVIDENCE_STORE:
├── raw_001: dependency_group = "grp_001"
├── raw_002: dependency_group = "grp_001"
├── raw_003: dependency_group = "grp_002"  (different root source)
└── raw_004: dependency_group = "grp_002"

EXTRACTED_ENTITIES_STORE:
├── ext_001: dependency_group = "grp_001" (from raw_001)
├── ext_002: dependency_group = "grp_001" (from raw_001)
├── ext_003: dependency_group = "grp_002" (from raw_003)
└── ext_004: dependency_group = "grp_002" (from raw_004)

EVIDENCE_EDGES_STORE:
├── edge_001: dependency_group = "grp_001" (from FIR)
├── edge_002: dependency_group = "grp_002" (from CDR)
└── edge_003: dependency_group = "grp_003" (from bank)

HYPOTHESIS SUPPORT:
H1 supported by: [edge_001, edge_002, edge_003]
├── edge_001: grp_001
├── edge_002: grp_002
├── edge_003: grp_003
└── INDEPENDENT SOURCES: 3 (grp_001, grp_002, grp_003)

H2 supported by: [edge_001, edge_004, edge_005]
├── edge_001: grp_001
├── edge_004: grp_001  (same group as edge_001!)
├── edge_005: grp_002
└── INDEPENDENT SOURCES: 2 (grp_001, grp_002) — not 3!
```

### Independent Evidence Count

```
FUNCTION: count_independent_sources(evidence_ids[])
├── input: list of evidence IDs
├── process: group by dependency_group
├── output: count of unique dependency groups
└── this is the TRUE independent source count

EXAMPLE:
Input: [edge_001(grp_001), edge_002(grp_002), edge_003(grp_001), edge_004(grp_003)]
Groups: {grp_001: [edge_001, edge_003], grp_002: [edge_002], grp_003: [edge_004]}
Independent count: 3 (not 4)

RULE: Hypothesis confidence uses independent_count, not total evidence count.
```

---

## Pipeline Run Versioning

```
                    ┌─────────────────────┐
                    │   RAW DATA INPUT    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  RAW_EVIDENCE_STORE │◄── IngestionEngine
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
    │EXTRACTED_       │ │EXTRACTED_    │ │TEMPORAL_     │
    │ENTITIES_STORE   │ │RELATIONS_    │ │SPATIAL_STORE │
    │                 │ │STORE         │ │              │
    └────────┬────────┘ └──────┬───────┘ └──────┬───────┘
             │                 │                │
             ▼                 │                │
    ┌─────────────────┐       │                │
    │RESOLVED_        │       │                │
    │ENTITIES_STORE   │       │                │
    └────────┬────────┘       │                │
             │                │                │
             │    ┌───────────┘                │
             │    │                            │
             ▼    ▼                            ▼
    ┌──────────────────────────────────────────────┐
    │           EVIDENCE_EDGES_STORE               │◄── GraphBuilderEngine
    └──────────────────────┬───────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ANALYTICS_   │ │HYPOTHESES_  │ │CONTRADICTIONS│
    │RESULTS_     │ │STORE        │ │_STORE        │
    │STORE        │ │             │ │              │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           ▼               ▼               ▼
    ┌──────────────────────────────────────────────┐
    │         EVIDENCE_GAPS_STORE                  │◄── GapDetectionEngine
    └──────────────────────┬───────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │      INVESTIGATOR_ACTIONS_STORE              │
    └──────────────────────┬───────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │           CRITIC ENGINE                      │
    │           (reads all, writes audit)          │
    └──────────────────────┬───────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │         INVESTIGATOR INTERFACE               │
    └──────────────────────────────────────────────┘
```

### Versioned Store State

```
Every store write is tagged with run_id.

RAW_EVIDENCE_STORE:
├── raw_001: {data..., run_id: "run_001"}
├── raw_002: {data..., run_id: "run_001"}
└── raw_003: {data..., run_id: "run_002"}  (new evidence)

EVIDENCE_EDGES_STORE:
├── edge_001: {data..., run_id: "run_001"}
├── edge_002: {data..., run_id: "run_001"}
└── edge_003: {data..., run_id: "run_002"}  (new edge from new evidence)

HYPOTHESES_STORE:
├── hyp_001: {confidence: 0.61, run_id: "run_001"}
└── hyp_001: {confidence: 0.74, run_id: "run_002"}  (updated confidence)

RULE: Never overwrite previous run data.
      Each run adds to stores, tagged with run_id.
      Historical data preserved for comparison and audit.
```

---

## Summary: The Binding Map

### Evidence Graph ↔ Provenance Graph

```
Every node in Evidence Graph has a corresponding node in Provenance Graph.

EvidenceGraph.res_001 ←→ ProvenanceGraph.prov_001
├── EvidenceGraph stores: what we know about Rakesh
├── ProvenanceGraph stores: how we know about Rakesh
└── Binding: prov_001.node_id = "res_001"

RULE: Never access EvidenceGraph without checking ProvenanceGraph.
      Always know WHERE a claim came from.
```

### Evidence Graph ↔ Coverage Model

```
Every entity in Evidence Graph has coverage intervals in Coverage Model.

EvidenceGraph.res_001 ←→ CoverageModel.cov_001
├── EvidenceGraph stores: Rakesh's relationships
├── CoverageModel stores: what time periods have data for Rakesh
└── Binding: cov_001.entity_id = "res_001"

RULE: Never interpret absence of edges as absence of relationships.
      Check coverage model first.
```

### Evidence Graph ↔ Entity State Model

```
Every entity in Evidence Graph has uncertainty info in Entity State Model.

EvidenceGraph.res_001 ←→ EntityState.es_001
├── EvidenceGraph stores: Rakesh's connections
├── EntityState stores: how confident we are in Rakesh's identity
└── Binding: es_001.entity_id = "res_001"

RULE: When traversing from uncertain entity, reduce confidence of all downstream.
      Never treat uncertain identity as certain.
```

### Hypothesis Layer ↔ All Other Graphs

```
Hypotheses reference Evidence, Provenance, Coverage, and EntityState.

Hypothesis.hyp_001
├── supporting: [EvidenceGraph.edge_001, edge_005]
├── contradicting: [EvidenceGraph.edge_003]
├── provenance_check: [ProvenanceGraph.prov_001] (are sources independent?)
├── coverage_check: [CoverageModel.cov_001] (what don't we know?)
└── entity_uncertainty: [EntityState.es_001] (how confident in identities?)

RULE: Hypotheses must account for all four graph dimensions.
      Not just evidence count, but source independence, coverage, and uncertainty.
```

---

## Investigation Feedback Loop Tracking

### Data Origin Tracking

```
Every piece of evidence has an origin flag:

EVIDENCE ORIGIN:
├── observational: Collected independently of system output
│   ├── FIR filed before system existed
│   ├── CDR from carrier (automated)
│   └── Bank records (automated)
├── investigation-generated: Collected because system recommended it
│   ├── System recommended checking Suresh's bank records
│   ├── Investigator obtained records
│   └── Records fed back into system
└── unknown: Origin unclear
    └── Flag for review

RULE: Track origin. Don't let investigation-generated evidence
      artificially strengthen hypotheses that recommended the investigation.
```

### Feedback Loop Detection

```
FEEDBACK LOOP PATTERN:
1. System flags Entity A (confidence 0.6)
2. Investigators focus on A
3. More evidence found for A
4. System raises A's confidence to 0.85
5. Investigators focus more on A
6. Even more evidence found
7. System raises confidence to 0.95

THIS IS A SELF-REINFORCING LOOP.

DETECTION:
├── Track which evidence was found after system recommendation
├── Compare confidence before/after investigation focus
├── Flag entities where confidence increase correlates with investigation focus
└── Separate observational evidence from investigation-generated evidence

RULE: When reporting confidence, note:
      ├── observational_evidence_count
      ├── investigation_generated_evidence_count
      └── confidence_with_investigation_focus vs confidence_without
```

---

## Label Provenance

Investigator-generated labels must not silently become ground truth for ML models.

### The Problem

```
DANGEROUS PATTERN:
1. Investigator labels Person X as "suspicious"
2. This label enters training data
3. ML model learns pattern from X
4. Model flags Person Y as similar to X
5. Y gets investigated
6. Y gets labeled "suspicious"
7. Pattern reinforced

THE INVESTIGATOR'S HYPOTHESIS BECAME STATISTICAL EVIDENCE.
This is epistemic contamination.
```

### Label Provenance Model

```
TrainingLabel {
  id:                string
  entity_id:         string      // which entity this label applies to
  label:             string      // "suspicious" / "confirmed_criminal" / "innocent" / etc.
  
  // PROVENANCE
  origin:            LabelOrigin
  basis:             string      // why this label was assigned
  confidence:        ConfidenceDecomposition
  
  // OUTCOME
  confirmed_outcome: string      // "confirmed" / "disconfirmed" / "unknown"
  confirmation_source: string    // what confirmed/disconfirmed
}

LabelOrigin:
├── OBSERVATIONAL
│   ├── based on independent evidence
│   ├── not influenced by system output
│   └── highest quality label
│
├── INVESTIGATION_FEEDBACK
│   ├── based on investigation process
│   ├── may be influenced by system output
│   ├── CANNOT be used as training truth without confirmation
│   └── must be tracked separately
│
├── MODEL_GENERATED
│   ├── produced by ML or reasoning system
│   ├── must not be used as training truth
│   └── must be validated by human
│
└── GROUND_TRUTH
    ├── confirmed by authoritative source
    ├── court verdict, verified confession, etc.
    └── highest quality label
```

### Label Provenance Rules

```
RULE 1: INVESTIGATION_FEEDBACK labels cannot automatically become training truth.
        They must be confirmed by OBSERVATIONAL or GROUND_TRUTH evidence.

RULE 2: MODEL_GENERATED labels cannot be used as training data.
        They must be validated by human investigator.

RULE 3: Every training dataset must track label provenance.
        Don't train on mixed provenance without noting it.

RULE 4: When reporting model performance, note label provenance.
        "Model accuracy 85%" means different things if labels are
        OBSERVATIONAL vs INVESTIGATION_FEEDBACK.

RULE 5: Investigator hypotheses must not become labels.
        "H1: X is involved" is a hypothesis, not a label.
        Only confirmed outcomes become labels.
```

---

## Investigative Attention Tracking

The system must track how much investigative effort each entity receives, to detect attention bias.

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

### Attention Tracking Model

```
EntityAttention {
  entity_id:         string
  
  // ATTENTION METRICS
  investigation_effort: float     // 0-1, how much attention this entity received
  evidence_count:    int         // how many evidence items involve this entity
  evidence_age_days: float       // average age of evidence
  
  // COMPARISON
  attention_rank:    int         // rank among all entities (1 = most attention)
  attention_ratio:   float       // this entity's attention / total attention
  
  // FEEDBACK
  evidence_after_recommendation: int   // evidence found after system recommendation
  evidence_before_recommendation: int  // evidence found independently
}
```

### Attention Bias Detection

```
FUNCTION: detect_attention_bias(entities[])
├── input: all entities in case
├── process:
│   ├── Calculate attention_ratio for each entity
│   ├── Flag entities with attention_ratio > 0.50 (dominant focus)
│   ├── Flag entities with evidence_after_recommendation / evidence_count > 0.70
│   └── Compare confidence with/without investigation-generated evidence
├── output: AttentionBiasReport

AttentionBiasReport {
  dominant_entities: string[]    // entities receiving >50% attention
  attention_distribution: object // {entity_id: attention_ratio}
  feedback_loop_risk: string[]   // entities where confidence may be investigation-driven
  recommendation: string         // "increase attention to X" / "no bias detected"
}
```

### Attention Bias in Critic Output

```
RULE: The Critic must report attention distribution in every investigation report.

INVESTIGATOR SEES:

Attention Distribution:
├── Person A: 74% of investigative effort (32 evidence items)
├── Person B: 9% of investigative effort (4 evidence items)
├── Person C: 8% of investigative effort (3 evidence items)
└── Others: 9% combined

Warning: Person A's high confidence may partly reflect
unequal investigation effort. Consider increasing
attention to Person B and Person C.
```
