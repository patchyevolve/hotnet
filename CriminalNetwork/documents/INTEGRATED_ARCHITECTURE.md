# Integrated Architecture — AI-Powered Criminal Network Analysis System

**SIH26189 | Ministry of Home Affairs | Cybersecurity Theme**

---

## Stage → Model Mapping

The system is built on five analytical models (see SYSTEM_STRUCTURE.md):

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

## 1. Executive Architecture

The system is built on five interacting analytical models (see SYSTEM_STRUCTURE.md).

```
                    ┌─────────────────────┐
                    │     REAL WORLD      │
                    │ FIRs·CDRs·Bank·CCTV │
                    └──────────┬──────────┘
                               │
                         observations
                               ↓
             ┌────────────────────────────────┐
             │   1. EVIDENCE MODEL            │
             │   Stages 1-2: Ingestion+Extr.  │
             │   entities / events / relations │
             └───────────────┬────────────────┘
                             │
             ┌───────────────┴────────────────┐
             ↓                                ↓
┌────────────────────────┐       ┌────────────────────────┐
│ 2. PROVENANCE MODEL    │       │ 3. COVERAGE MODEL      │
│ Stages 3-4: Res.+Temp. │       │ Stages 3-4: Res.+Temp. │
│ where claims came from │       │ what was/wasn't seen   │
└────────────┬───────────┘       └────────────┬───────────┘
             │                                │
             └───────────────┬────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 4. ENTITY STATE      │
                  │ Stage 3: Resolution  │
                  │ + Stage 5: Graph     │
                  │ identity uncertainty │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 5. HYPOTHESIS &      │
                  │ INVESTIGATION MODEL  │
                  │ Stages 5-9:          │
                  │ Graph→Analytics→     │
                  │ Hypothesis→Contr.→   │
                  │ Gap Detection        │
                  │ competing theories   │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │ STAGE 10: CRITIC     │
                  │ Reads ALL models     │
                  │ (read-only)          │
                  │ Independence check   │
                  │ Bias detection       │
                  │ Calibration          │
                  │ "Why this person?"   │
                  └──────────────────────┘
```

---

## 2. Existing Team Playbook Structure

The team's playbook already provides a solid implementation foundation.

### What the Playbook Does Well

| Component | What It Provides | Status |
|-----------|-----------------|--------|
| **Workstream A — Data Ingestion** | Multi-format file parsing (PDF, CSV, Excel, images), OCR for scanned documents, structured data extraction | Solid foundation |
| **Workstream B — NLP Entity Extraction** | Person, location, phone, organization extraction using spaCy + Hugging Face Transformers, Hindi/English support via IndicBERT | Core capability |
| **Workstream C — Graph Database & Backend API** | Neo4j schema design, CRUD API, Cypher queries, entity relationship storage | Core infrastructure |
| **Workstream D — Network Analytics Engine** | Centrality analysis (degree, betweenness, eigenvector), community detection, path finding | Analytical capability |
| **Workstream E — Frontend Dashboard** | Interactive graph visualization (vis.js/D3.js), search, filter, highlight | User interface |
| **Workstream F — Integration & Testing** | End-to-end pipeline testing, demo data creation | Quality assurance |

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend API | NestJS (Node.js/TypeScript) | REST API, business logic |
| Graph Database | Neo4j Community Edition | Entity/relationship storage |
| NLP | spaCy + Hugging Face Transformers | Entity extraction |
| Frontend | React + vis.js / D3.js | Interactive visualization |
| ML Models | TensorFlow.js (browser) + Python microservice | Anomaly detection, entity linking |
| DevOps | Docker Compose | Local deployment |

### Demo Flow (Playbook)

```
Upload 50–100 synthetic crime documents
    → Extract entities via NLP
    → Populate Neo4j graph
    → Display interactive network visualization with centrality highlighting
```

**Assessment:** The playbook provides a functional product pipeline. The team can build, demo, and present this. It covers the "what" of the system.

---

## 3. Identified Investigation Gaps

The playbook focuses on **product implementation** but lacks the **reasoning layer** that prevents investigative errors.

### Gap Analysis

| # | Gap | Playbook Behavior | Why It's Insufficient | Source B Addition | Where It Belongs |
|---|-----|-------------------|----------------------|-------------------|-----------------|
| 1 | **Epistemic ontology** | All data treated as "facts" in graph | Observation ≠ inference ≠ hypothesis. Collapsing them causes errors. | Explicit OBSERVATION → EVIDENCE → INFERENCE → HYPOTHESIS → LEAD taxonomy | Ingestion + NLP + Hypothesis stages |
| 2 | **Provenance vs verification** | No distinction between source origin and verification | "Court record" and "social media post" treated similarly | Separate `provenance_class` and `verification_status` | Ingestion stage |
| 3 | **Source reliability** | CDR = reliable, FIR = less reliable (simple lookup) | Reliability depends on WHAT CLAIM is being made | Contextual `SourceReliabilityMatrix[source_type][claim_type]` with calibration | Ingestion + NLP stages |
| 4 | **Source integrity** | Files ingested without transformation tracking | CCTV.mp4 may be transcoded, filtered, or altered | `EvidenceIntegrity` with chain of custody, hash, transformation history | Ingestion stage |
| 5 | **Dependency DAG** | Each document treated as independent source | FIR witness statement + FIR officer observation share a document but have different sub-sources | Claim-aware `dependency_type` with DAG traversal | NLP + Entity Resolution stages |
| 6 | **Entity resolution uncertainty** | Binary: resolved or not | Wrong merge contaminates entire graph downstream | Pipeline invariant: `effective_confidence = f(hypothesis_confidence, identity_confidence)` | Entity Resolution stage |
| 7 | **Event clustering** | Each observation = one event | Two CCTV frames 7 minutes apart may be same or different event | `UNRESOLVED_EVENT_CLUSTER` / `PROBABLE_EVENT_CLUSTER` / `CONFIRMED_EVENT` with per-type policies | Entity Resolution + Graph stages |
| 8 | **Source conflict resolution** | Contradictions stored, not classified | "CCTV says X, CDR says Y" needs different next actions depending on WHY they conflict | `ContradictionType`: IDENTITY, TEMPORAL, LOCATION, ATTRIBUTION, etc. | Hypothesis + Critic stages |
| 9 | **Centrality semantics** | Centrality score exposed as "importance" | Taxi driver, lawyer, hotel employee can have high centrality without criminal involvement | `StructuralRole`: broker, hub, bridge, peripheral with innocent explanations | Analytics + Dashboard stages |
| 10 | **Negative evidence** | NOT_FOUND = weakens hypothesis | Inadequate search should not become evidence of absence | `CONFIRMED_ABSENCE` vs `UNCONFIRMED_ABSENCE` with search completeness | Hypothesis + Critic stages |
| 11 | **Falsification** | System supports hypothesis, never actively seeks disconfirmation | Confirmation bias builds without falsification | Every hypothesis carries `falsifiers[]` with status | Hypothesis + Critic stages |
| 12 | **Multi-level alternatives** | Only considers graph-level alternatives | Source error, event misidentification, identity wrong are not considered | Five-level alternative generation: entity, event, relationship, causal, source-error | Hypothesis stage |
| 13 | **Investigative attention bias** | Not tracked | More investigation → more evidence → more suspicion (self-reinforcing loop) | `EntityAttention` with attention ratio and evidence来源 | Critic + Dashboard stages |
| 14 | **Information gain** | Simple scoring | Should optimize for uncertainty reduction over hypothesis distribution | Shannon entropy `IG(E) = H(P(H)) - H(P(H|E))` with decision relevance | Critic stage |
| 15 | **Evidence acquisition** | Not modeled | System says "need more evidence" without specifying what, how, urgent | `EvidenceAction` with cost, time, feasibility, preservation risk | Critic + Dashboard stages |

---

## 4. Integrated System Structure

The integrated system preserves the team's pipeline while adding the reasoning layer.

### Module Mapping

The system maps to five analytical models (see SYSTEM_STRUCTURE.md):

| Pipeline Stage | Analytical Model | Implementation |
|----------------|-----------------|----------------|
| **Stage 1: Ingestion** | Model 1: Evidence | File parsing, source assessment, ML feature extraction |
| **Stage 2: Extraction** | Model 1: Evidence | NER, relation extraction, role assignment, confidence scoring |
| **Stage 3: Resolution** | Model 2: Provenance + Model 3: Coverage + Model 4: Entity State | Identity resolution, merge decisions, contradiction detection, unknown entities |
| **Stage 4: Temporal** | Model 2: Provenance + Model 3: Coverage | Timestamp standardization, temporal intervals, spatial normalization |
| **Stage 5: Graph Build** | Model 4: Entity State + Model 5: Hypothesis | Edge creation, relationship semantics, provenance chain |
| **Stage 6: Analytics** | Model 5: Hypothesis & Investigation | Structural/temporal/behavioral analysis, ML inference (GNN) |
| **Stage 7: Hypothesis** | Model 5: Hypothesis & Investigation | Falsifiable hypothesis generation, five-level alternatives, sensitivity [implemented] |
| **Stage 8: Contradiction** | Model 5: Hypothesis & Investigation | Admissible elimination, resolvability, hypothesis impact [implemented] |
| **Stage 9: Gap Detection** | Model 5: Hypothesis & Investigation | Missing-evidence requirements, identity deduplication, data-source derivation, conditional impact [implemented] |
| **Stage 10: Critic** | ALL models (read-only) | Independence check, bias detection, calibration, explanations |

### New Modules Added

```
REASONING MODULES (Model 5: Hypothesis & Investigation):
├── Hypothesis Engine
│   ├── Multi-level alternative generation
│   ├── Falsification tracking
│   ├── Confidence computation
│   └── Temporal sensitivity
│
├── Contradiction Engine
│   ├── Conflict type classification
│   ├── Severity assessment
│   └── Resolution recommendations
│
└── Gap Detection Engine
    ├── Evidence gap identification
    ├── Search completeness assessment
    └── Action prioritization

CRITIC MODULE (Stage 10: reads ALL models):
├── Independence checker (DAG-based)
├── Bias detector (attention, confirmation, feedback)
├── Confidence calibrator
├── "Why this person?" explainer
└── Investigative value calculator

INVESTIGATIVE LOOP (feeds back to Model 1):
├── Evidence acquisition planner
├── Preservation risk tracker
├── New evidence ingestion trigger
└── Pipeline re-run orchestration
```

---

## 5. Data / Evidence Model

### Lifecycle

```
Five-Model Lifecycle (see SYSTEM_STRUCTURE.md):

MODEL 1: EVIDENCE (Stages 1-2)
  SOURCE (FIR, CDR, Bank, CCTV, Surveillance, Social Media)
      ↓
  OBSERVATION (direct sensor/person record)
      ↓  ← provenance_class: OBSERVATIONAL
      ↓  ← verification_status: UNVERIFIED
      ↓  ← source_integrity: hash, chain_of_custody
      ↓
  CLAIM (what source asserts is true)
      ↓  ← claim_type: factual / legal / subjective / self_reported / secondhand
      ↓  ← dependency_type: DIRECT_OBSERVATION / DERIVED / QUOTED / SUMMARIZED
      ↓
  EVIDENCE (derived from observation, supports/contradicts proposition)
      ↓  ← provenance_class: DERIVED
      ↓  ← confidence: extraction_confidence / entity_match_confidence / relation_confidence

MODEL 2: PROVENANCE (Stages 3-4)
  ENTITY / EVENT / RELATIONSHIP (extracted and resolved)
      ↓  ← derivation_depth (0=raw, 1=inferred, 2=derived)
      ↓  ← is_independent (unique root source?)

MODEL 3: COVERAGE (Stages 3-4)
      ↓  ← coverage_status: OBSERVED / NOT_OBSERVED / NOT_SEARCHED / UNKNOWN
      ↓  ← search_completeness: what was searched, what was missed

MODEL 4: ENTITY STATE (Stages 3+5)
      ↓  ← entity_resolution_confidence (with decomposition)
      ↓  ← event_cluster_state (CONFIRMED / PROBABLE / UNRESOLVED)

MODEL 5: HYPOTHESIS & INVESTIGATION (Stages 5-9)
  HYPOTHESIS (possible explanation for evidence)
      ↓  ← supporting_evidence, contradicting_evidence
      ↓  ← falsifiers, alternatives, null_hypothesis
      ↓  ← hypothesis_confidence (with decomposition)
      ↓
  INVESTIGATIVE LEAD (actionable recommendation)
      ↓  ← target, feasibility, information_gain, preservation_risk
      ↓
  NEW EVIDENCE (collected by investigator)
      ↓
  RE-INGESTION → REASONING → UPDATED HYPOTHESES
```

### Key Distinction

The playbook's graph stores **entities and relationships**. The integrated system adds **provenance, uncertainty, and epistemic status** alongside them.

```
PLAYBOOK GRAPH:
  (Person A) -[:CALLED]-> (Person B)

INTEGRATED GRAPH:
  (Person A) -[:CALLED {confidence: 0.95, source_reliability: 0.95,
                        provenance: "CDR", integrity: "verified",
                        dependency: "DIRECT_OBSERVATION"}]-> (Person B)
```

---

## 6. Multi-Case Architecture

### 6.1 Three-Layer Design

The system supports multi-case, multi-jurisdiction processing through three layers:

1. **Jurisdiction Hierarchy** — JurisdictionNode tree (replaces flat PoliceStation)
2. **Global Entity Identity Index** — cross-case entity linking (identity only, not a graph)
3. **Scoped Analytical Graphs** — computed on-demand from local graphs + global identity links

### 6.2 Jurisdiction Hierarchy

- JurisdictionNode: configurable tree with extensible node types (NATION → STATE_UT → COMMISSIONERATE → RANGE → DISTRICT → CITY → ZONE → DIVISION → SUB_DIVISION → POLICE_STATION → OUT_POST)
- Level derived at query time, not stored
- GeographicJurisdiction: separate from organizational hierarchy
- UnresolvedJurisdiction: parser outputs for human resolution
- Historical jurisdiction: valid_to on reorganization, cases stay linked to originals

### 6.3 Global Entity Identity Index

- GlobalEntity: canonical entity across all Cases
- GlobalEntityLink: links global entity to local entity in a Case
- CrossCaseAlert: alerts for multi-jurisdiction entities
- Identity/linking only — NOT a graph

### 6.4 Scoped Analytical Graphs

- Local Graphs: built per Case, stored permanently
- Scoped Graphs: computed on-demand, not stored
- Merge process: GlobalEntity identity links for same-entity matching
- Provenance: source_case_ids on merged edges

### 6.5 Case-FIR Invariant

- Case and FIR have a 1:1 relationship. FIR.caseId is unique. One Case maps to exactly one FIR.
- FIR holds case_id (required FK)
- Case does NOT hold fir_id
- FIR number uniqueness is jurisdiction-scoped: `@@unique([firNumber, jurisdictionNodeId])`
- FIR has three independent lifecycle dimensions (replaces single `status` field): investigation_status, legal_disposition, record_status
- FIR lifecycle is independent from CaseRelationship, Workspace, and AnalysisRun

### 6.6 Designed-But-Not-Implemented Entities (Revision 3+)

The following entities are designed but not yet implemented:

- **CaseRelationship** / **CaseRelationshipHistory**: Links related cases; history tracks relationship changes over time. CaseRelationship is designed but not implemented.
- **CaseAccess**: Authorization model controlling who can access a Case
- **InvestigationWorkspace** / **WorkspaceCase** / **WorkspaceMember**: Organizes investigative work; workspace members are assigned cases
- **AnalysisRun** / **AnalysisRunCase** / **AnalysisRunResult**: AnalysisRun is an immutable historical execution (separate from PipelineRun). Input snapshots are stored in AnalysisRunResult. AnalysisRunCase links runs to cases.
- **Finding**: Structured findings from analysis runs
- **FIRLifecycleHistory**: Audit trail of FIR lifecycle dimension changes

---

## 7. Graph Model

### What Remains in the Graph

| Graph Element | Source A | Source B Addition |
|---------------|----------|-------------------|
| **Nodes** | Person, Location, Phone, Organization | + Event, Hypothesis, EvidenceItem |
| **Edges** | CALLED, LOCATED_AT, MEMBER_OF | + SUPPORTS, CONTRADICTS, DERIVED_FROM, TEMPORAL_ORDER |
| **Node Properties** | name, type, confidence | + provenance_class, verification_status, entity_resolution_confidence, structural_role |
| **Edge Properties** | weight, timestamp | + source_reliability, edge_confidence, dependency_type, integrity_status |

### What Exists Outside the Simple Graph

| Concept | Why Outside | Store |
|---------|-------------|-------|
| Dependency DAG | Tracks claim-level lineage, not just entity relationships | `PROVENANCE_STORE` |
| Event Clusters | Observations may or may not represent same event | `DEDUPLICATED_EVENTS_STORE` |
| Hypotheses | Competing explanations, not graph facts | `HYPOTHESIS_STORE` |
| Contradictions | Source conflicts requiring classification | `CONTRADICTIONS_STORE` |
| Evidence Gaps | What we don't know | `EVIDENCE_GAPS_STORE` |
| Investigative Actions | What the investigator should do | `INVESTIGATOR_ACTIONS_STORE` |
| Audit Trail | What the system did and why | `AUDIT_STORE` |

---

## 8. Reasoning Model

### Uncertainty

Every confidence value carries a `ConfidenceDecomposition`:

```
confidence: 0.72
basis: ["same phone number", "same address", "same DOB"]
supporting_factors: [{description, weight, source, reliability}]
contradicting_factors: [{description, weight, source, reliability}]
unknown_factors: ["no verified biometric identifier"]
```

### Dependencies

The dependency DAG is authoritative. Source comparison is a heuristic fallback.

```
DAG traversal:
  EvidenceItem → source_id → claim_id → derived_from[] → root sources

Independence calculation:
  Count unique root sources, not evidence items.
  3 items from same root = 1 independent source.
```

### Source Reliability

Contextual, not global:

```
ReliabilityPolicy {
  value: 0.95
  basis: ["automated", "timestamp verified"]
  source: "empirical_study"
  version: "v1.0"
  empirical_validation: {validated, sample_size, accuracy, last_validated}
}
```

### Integrity

Separate from reliability:

```
EvidenceIntegrity {
  acquisition_method: "direct_provider_export"
  chain_of_custody: [...]
  hash: "sha256:..."
  transformation_history: [...]
  integrity_status: "verified" | "suspect" | "compromised" | "unknown"
}
```

### Contradictions

Classified by type, not just stored:

```
ContradictionType:
  IDENTITY_CONFLICT → verify identity
  TEMPORAL_CONFLICT → verify timestamps
  LOCATION_CONFLICT → verify locations
  ATTRIBUTION_CONFLICT → verify who did what
  SOURCE_CONTENT_CONFLICT → verify source accuracy
```

### Temporal Reasoning

```
TemporalRelation:
  BEFORE / AFTER / OVERLAPS / CONTAINS / DURING / SIMULTANEOUS
  + possible_relations[] (when uncertain)
  + temporal_falsifiers[] (what timing would disprove hypothesis)
```

### Hypotheses

Every major hypothesis carries:

```
Hypothesis {
  supporting_evidence: []
  contradicting_evidence: []
  falsifiers: [{description, status, impact}]
  alternatives: [Hypothesis]  // multi-level: entity, event, relationship, causal, source-error
  null_hypothesis: Hypothesis
  sensitivity: {identity_sensitivity, temporal_sensitivity}
  confidence: ConfidenceDecomposition
}
```

### Falsification

The system actively seeks evidence that would prove hypotheses wrong:

```
Falsifier {
  description: "verified device possession by another person"
  status: "not_searched" | "searched_not_found" | "found" | "unavailable"
  impact: "reject_hypothesis" | "weaken_hypothesis"
  search_quality: "comprehensive" | "partial" | "minimal"
}
```

Hypotheses that survive falsification attempts are stronger than those never tested.

---

## 9. ML Role

### Clear Separation

| ML Function | What It Does | What It Does NOT Do |
|-------------|-------------|---------------------|
| **Entity Extraction** | Identify people, locations, phones, orgs from text | Make legal conclusions |
| **Entity Resolution** | Link "Rakesh" in FIR to "Rakesh Kumar" in CDR | Decide guilt |
| **Anomaly Detection** | Flag unusual patterns (activity bursts, new contacts) | Accuse anyone |
| **Community Detection** | Find clusters in network | Call them "criminal cells" |
| **Hypothesis Generation** | Propose possible explanations | Present as conclusions |
| **Information Gain** | Rank which evidence would most reduce uncertainty | Decide what to investigate |

**Note:** ML operates on both local graphs (per-Case) and scoped graphs (cross-case). Each Case has its own local graph built by Stage 5, where ML runs as part of the pipeline (Stage 6). Scoped graphs (computed on-demand by Stage 12) merge local graphs using global entity identity links and support the same ML algorithms — GNN, Bayesian Networks, community detection, centrality, anomaly detection — for city-wide or cross-jurisdiction analysis. Scoped graph ML results carry `source_case_ids` for traceability back to originating Cases.

### ML Must Not Become Automatic Accusation

```
RULE: ML produces hypotheses and investigative leads, not conclusions.

BAD:
  "Person A — Suspiciousness Score: 0.87"

GOOD:
  "Person A:
   ├── Network position: hub (connected to 47 people)
   ├── Anomaly: activity burst detected (3σ above baseline)
   ├── Identity: resolved from 'Rakesh' with 0.81 confidence
   ├── Falsifiers: 2 of 3 searched, none found
   ├── Confidence: 0.58 (adjusted for identity uncertainty)
   └── Recommended next action: obtain bank statement"
```

---

## 10. The Critic

### Where It Sits

The Critic is NOT a pipeline stage. It is a reasoning engine that reads from ALL stores and answers investigator questions.

```
PIPELINE STAGES (write to stores):
  Ingestion → NLP → Resolution → Temporal → Graph Building → Analytics → Hypothesis → Contradiction → Gap Detection

CRITIC (reads from all stores):
  Reads: RawEvidence, ExtractedEntities, ResolvedEntities,
         EvidenceEdges, Anomalies, Hypotheses, Contradictions,
         Gaps, Actions, AuditTrail

  Writes: ONLY to audit_store and investigator_actions_store
```

### What the Critic Is Responsible For

```
1. INDEPENDENCE CHECK
   └── Are supporting evidence items truly independent?
   └── Uses DAG, not source counting

2. BIAS DETECTION
   └── Confirmation bias
   └── Investigative attention bias
   └── Feedback loop detection
   └── Label provenance tracking

3. CALIBRATION
   └── Does confidence match evidence strength?
   └── Overconfidence detection
   └── Underconfidence detection

4. FALSIFICATION STATUS
   └── What would disprove each hypothesis?
   └── What has been searched?
   └── What remains unsearched?

5. "WHY THIS PERSON?" EXPLANATION
   └── Complete causal chain
   └── Reasoning steps with vulnerabilities
   └── Assumptions that could be wrong
   └── What would falsify the conclusion

6. INVESTIGATIVE VALUE
   └── EIG × decision_relevance × feasibility × timeliness
   └── Preservation risk as urgency modifier
   └── Not raw information gain alone

7. ATTENTION DISTRIBUTION
   └── How much effort each entity received
   └── Observation vs investigation-generated evidence
   └── Flagging when confidence reflects unequal attention
```

---

## 11. Investigative Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    FIVE-MODEL ANALYSIS                       │
│  Model 1: Evidence (Ingestion + Extraction)                  │
│  Model 2: Provenance (Resolution + Temporal)                 │
│  Model 3: Coverage (Resolution + Temporal)                   │
│  Model 4: Entity State (Resolution + Graph)                  │
│  Model 5: Hypothesis & Investigation (Analytics → Gaps)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   CRITIC    │
                    │  (reads ALL │
                    │   models)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    GAP      │
                    │ IDENTIFIED  │
                    │             │
                    │ "Need bank  │
                    │  statement  │
                    │  for Suresh"│
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │  EVIDENCE ACQUISITION   │
              │                         │
              │  Target: bank_statement │
              │  Source: State Bank     │
              │  Method: legal_request  │
              │  Feasibility: 0.8       │
              │  Time: 3-5 days         │
              │  Preservation: LOW      │
              │  Info gain: 0.39 bits   │
              │  Decision relevant: YES │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │ INVESTIGATOR│
                    │   DECISION  │
                    │             │
                    │ (human      │
                    │  chooses    │
                    │  what to    │
                    │  pursue)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ NEW EVIDENCE│
                    │             │
                    │ (bank       │
                    │  statement  │
                    │  obtained)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ RE-INGESTION│
                    │             │
                    │ (same       │
                    │  pipeline   │
                    │  re-runs)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  UPDATED    │
                    │ HYPOTHESES  │
                    │             │
                    │ H1: 0.72→0.74│
                    │ H2: 0.15→0.12│
                    │ H3: 0.08→0.08│
                    └─────────────┘
```

---

## 12. Outputs

### What Investigators Receive

```
InvestigationReport {
  // FINDINGS
  primary_hypothesis: Hypothesis
  hypothesis_confidence: ConfidenceDecomposition
  alternative_hypotheses: Hypothesis[]
  null_hypothesis: Hypothesis

  // EVIDENCE
  key_evidence: EvidenceEdge[]
  evidence_summary: string

  // UNCERTAINTY
  evidence_independence: float
  independent_source_count: int
  coverage_ratio: float
  entity_resolution_impact: string

  // CONTRADICTIONS
  key_contradictions: Contradiction[]
  contradiction_types: string[]

  // FALSIFICATION
  falsifiers_searched: int
  falsifiers_found: int
  falsifiers_remaining: int

  // GAPS
  evidence_gaps: EvidenceGap[]
  search_completeness: SearchCompleteness[]

  // LEADS
  recommended_actions: InvestigatorAction[]

  // EXPLANATIONS
  why_this_person: PersonExplanation
  attention_distribution: EntityAttention[]
  bias_check: BiasCheck

  // LIMITATIONS
  limitations: string[]
  assumptions: string[]
}
```

---

## 13. Implementation Mapping

### Technology Mapping

| Architecture Concept | Technology | Module |
|---------------------|-----------|--------|
| Data Ingestion | FastAPI + Python parsers | Workstream A |
| OCR | PaddleOCR / EasyOCR | Workstream A |
| NLP Extraction | spaCy + IndicBERT | Workstream B |
| Entity Resolution | TF-IDF + cosine similarity + rules | Workstream C |
| Graph Storage | Neo4j (Cypher queries) | Workstream C |
| Network Analytics | NetworkX + Neo4j GDS | Workstream D |
| Dashboard | React + vis.js / D3.js | Workstream E |
| Dependency DAG | Neo4j graph + custom traversal | New: Reasoning Layer |
| Hypothesis Engine | Python service (FastAPI) | New: Reasoning Layer |
| Critic | Python service (FastAPI) | New: Critic Layer |
| Evidence Acquisition | Python service + investigator UI | New: Investigative Loop |
| Confidence Decomposition | TypeScript objects (shared schema) | All modules |
| Audit Trail | Neo4j append-only log | All modules |

### Docker Compose Structure

```yaml
services:
  # Source A modules
  api:          # NestJS backend (Workstream C)
  neo4j:        # Graph database
  nlp:          # Python NLP service (Workstream B)
  frontend:     # React dashboard (Workstream E)

  # Source B additions
  reasoning:    # Python reasoning service (hypothesis, contradictions, gaps)
  critic:       # Python critic service (independence, bias, calibration)
  ingestion:    # Python ingestion service (provenance, integrity, reliability)
```

---

## 14. MVP Boundary

### Must-Have for SIH MVP

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Data ingestion (multi-format) | P0 | Core requirement |
| NLP entity extraction (Hindi/English) | P0 | Core requirement |
| Neo4j graph population | P0 | Core requirement |
| Basic network visualization | P0 | Demo requirement |
| Centrality analysis | P0 | Demo requirement |
| Confidence decomposition | P0 | Prevents misleading scores |
| Provenance tracking | P0 | Prevents epistemic errors |
| Basic falsification tracking | P0 | Prevents confirmation bias |
| Contradiction classification | P1 | Improves investigation quality |
| Evidence gap detection | P1 | Actionable for investigator |
| Search completeness tracking | P1 | Prevents false absence conclusions |

### Useful But Optional

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Evidence acquisition planning | P1 | Adds investigation loop |
| Investigative attention tracking | P1 | Prevents feedback loops |
| Information gain formalization | P1 | Better action prioritization |
| Multi-level alternatives | P1 | Deeper reasoning |
| Identity sensitivity analysis | P1 | Critical for high-stakes cases |
| Event clustering policies | P2 | Refines event reconstruction |
| Temporal reasoning | P2 | Improves timeline analysis |

### Research / Future Work

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Game-theoretic adversarial reasoning | P2 | Research-level complexity |
| Adaptive adversarial behavior | P2 | Requires ongoing research |
| Full Bayesian hypothesis updating | P2 | Complex to implement correctly |
| Cross-case ML contamination prevention | P2 | Requires production data |

---

## 15. Final Comparison

| Dimension | Team Playbook | My Architecture | Integrated Architecture |
|-----------|---------------|-----------------|------------------------|
| **Purpose** | Build a demo-able product | Reason correctly about evidence | Build AND reason correctly |
| **Data model** | Entities + relationships | Observations + claims + evidence + hypotheses | Both, with epistemic metadata |
| **Graph model** | Simple property graph | Provenance-aware, uncertainty-carrying graph | Property graph + metadata stores |
| **Uncertainty** | Binary (resolved or not) | Continuous (confidence with decomposition) | Continuous with decomposition |
| **Provenance** | Not tracked | Full DAG with integrity | Full DAG with integrity |
| **Evidence dependency** | Each document = independent | Claim-level DAG, independence via root sources | DAG as authority, source as heuristic |
| **ML** | Extraction + anomaly detection | Extraction + anomaly + hypothesis generation | Same, with clear separation from conclusions |
| **Reasoning** | Not modeled | Hypotheses, contradictions, falsification, alternatives | Full reasoning layer |
| **Falsification** | Not considered | Every hypothesis has falsifiers | Integrated into hypothesis model |
| **Investigator workflow** | Dashboard viewing | Analysis → gap → acquisition → re-analysis | Dashboard + investigative loop |
| **Explainability** | Centrality scores | "Why this person?" with causal chain | Scores + explanations |
| **Feedback loops** | Not tracked | Attention distribution, label provenance | Tracked and flagged |
| **Evidence acquisition** | Not modeled | Full acquisition planning with preservation risk | Integrated into loop |

---

## 16. Proposal to the Team

I have prepared this integrated architecture as a deeper reasoning/evidence layer around the existing playbook. I am not suggesting that we discard the current structure. The playbook provides a solid product pipeline that can be demoed and presented.

What the investigation-specific gaps analysis revealed is that a normal graph/ML pipeline can miss problems that matter in real investigations:

- Treating all sources as equally reliable regardless of what claim they support
- Not tracking whether evidence was actually searched for adequately
- Allowing a wrong identity merge to silently contaminate the entire graph
- Building confidence scores that reflect investigation effort rather than independent evidence
- Never asking "what would disprove this hypothesis?"

The seven detailed architecture documents I prepared cover these gaps at the conceptual and schema level. The integrated architecture above shows where each addition fits into the existing workstream structure.

If the team thinks these additions are technically appropriate for the problem statement, I can share the complete architecture documents so we can review what should actually be adopted into the implementation. The MVP boundary above suggests a phased approach — start with the core pipeline and add reasoning capabilities incrementally.

The goal is not to make the system perfect on day one. The goal is to make sure the architecture can grow into something that an investigator would actually trust.

---

**Deprecation Note:** PoliceStation has been replaced by JurisdictionNode (configurable hierarchy tree). All `police_station_id` references in the schema have been replaced with `jurisdiction_node_id`. See `documents/17_MULTI_CASE_ARCHITECTURE.md` for the full multi-case architecture specification.
