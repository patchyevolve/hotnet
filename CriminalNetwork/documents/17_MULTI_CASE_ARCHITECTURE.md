# MULTI-CASE / MULTI-JURISDICTION ARCHITECTURE (Revision 3+)

## Canonical Stage Numbering (Scheme A+)

```
Stage 1:  Ingestion              Stage 7:  Hypothesis          [implemented]
Stage 2:  Extraction             Stage 8:  Contradiction       [implemented]
Stage 3:  Resolution             Stage 9:  Gap Detection       [implemented]
Stage 4:  Temporal               Stage 10: Critic              [designed, not implemented]
Stage 5:  Graph Build            Stage 11: Global Entity Push  [implemented]
Stage 6:  Analytics              Stage 12: Scoped Analysis     [designed, not implemented]
```

All documents use this numbering. Legacy docs that numbered Global Entity Push as "Stage 7" and Scoped Analysis as "Stage 8" have been renumbered to Stage 11/12.

## Overview

This document defines the approved Revision 3+ architecture for the AI-Powered Criminal Network Analysis pipeline. It describes a domain-correct, multi-investigator system with jurisdiction hierarchy, global entity identity index, case relationships, investigation workspaces, scoped analysis, FIR lifecycle, and findings/critic.

**Design invariant:** The system may increase the confidence of a hypothesis, but must never upgrade an inference into an observation.

**Important distinction:** This document describes the approved architecture. Reasoning Stages 7–9 (Hypothesis, Contradiction, Gap Detection) and Stage 11 (Global Entity Push) are implemented; Stage 10 (Critic) and Stage 12 (Scoped Analytics) are designed but NOT yet implemented, as are CaseRelationship, InvestigationWorkspace, AnalysisRun, Finding, and FIR lifecycle — see STAGE_REASONERS.md and THE_CRITIC.md.

---

## 1. Core Domain Model

### 1.1 Fundamental Unit

```
FIR ←→ Case
```

One Case has exactly one primary FIR. One FIR belongs to exactly one Case. This is an invariant.

### 1.2 Domain Rule

- One Case has exactly one primary FIR.
- One FIR belongs to exactly one Case.
- FIR identity is immutable.
- FIR number is unique within its jurisdiction, not globally.

Do NOT model multiple FIRs inside one Case merely because several FIRs concern the same incident. Instead, independent Cases/FIRs can be related via CaseRelationship.

### 1.3 Example

```
Case A / FIR A
      │
      │ SAME_INCIDENT
      ▼
Case B / FIR B
```

Both remain independent Cases/FIRs. Neither is deleted or merged.

---

## 2. CaseRelationship Model

### 2.1 What It Represents

CaseRelationship is a first-class entity representing the current relationship assessment between independent Cases. It preserves the evolution of the relationship over time.

### 2.2 Relationship Types

The architecture distinguishes three different meanings:

**Same underlying incident:**
```
Case A ── SAME_INCIDENT ── Case B
```
Separate FIR/Case records that investigators determine concern the same underlying incident.

**Different but substantively related cases:**
```
Case A ── RELATED_CASE ── Case C
```
Example: Murder investigation and a separate drug case connected through the same suspect/network.

**Shared entity observation:**
```
Case A ── SHARED_ENTITY ── Case D
```
The same person/phone/account/etc. appears in both Cases. This is evidence, NOT proof that the Cases are the same incident or substantively related.

### 2.3 Assessment Evolution

```
SHARED_ENTITY (system observation)
    ↓
POSSIBLE_SAME_INCIDENT (system suggestion)
    ↓
SAME_INCIDENT (investigator confirmation)
```

The original system observation is never lost. CaseRelationshipHistory preserves every transition.

### 2.4 CaseRelationship Entity

```
CaseRelationship {
  id: UUID PK
  case_a_id: FK → Case (smaller id, for ordering)
  case_b_id: FK → Case (larger id, for ordering)
  initial_observation: Enum {SHARED_ENTITY}  // immutable
  current_assessment: Enum {
    SHARED_ENTITY, POSSIBLE_SAME_INCIDENT, POSSIBLE_RELATED_CASE,
    SAME_INCIDENT, RELATED_CASE
  }
  confidence: Float (0.0–1.0)
  evidence_summary: Text
  detected_by: Enum {SYSTEM, INVESTIGATOR}
  status: Enum {SUGGESTED, CONFIRMED, REJECTED}
  confirmed_by_id: FK → User (nullable)
  confirmed_at: DateTime (nullable)
  created_at: DateTime
  updated_at: DateTime
  @@unique([case_a_id, case_b_id])
}
```

### 2.5 CaseRelationshipHistory Entity

```
CaseRelationshipHistory {
  id: UUID PK
  case_relationship_id: FK → CaseRelationship
  previous_assessment: Enum (nullable — null for initial)
  new_assessment: Enum
  previous_status: Enum (nullable)
  new_status: Enum
  previous_confidence: Float (nullable)
  new_confidence: Float
  changed_by_id: FK → User (nullable — null for system)
  change_reason: Text
  created_at: DateTime
  @@index([case_relationship_id])
}
```

### 2.6 Critical Rules

- Stage 11 (SYSTEM) generates SHARED_ENTITY observations and POSSIBLE_SAME_INCIDENT hypotheses.
- Only the investigator can confirm SAME_INCIDENT or RELATED_CASE.
- A phone/person/account match alone must never automatically become "same incident."
- The initial observation is never overwritten.

---

## 3. InvestigationWorkspace Model

### 3.1 What It Represents

A workspace is the set of Cases an investigator/team is currently working together on. Cases are not owned by the workspace. The same Case may exist in multiple workspaces.

### 3.2 Example

```
Geeta Workspace
  ├── Murder Case A
  ├── Same-incident Case B
  └── Related Drug Case C

Samantha Workspace
  ├── Drug Case C
  ├── Drug Case D
  └── Fraud Case E
```

Case C is shared without duplication.

### 3.3 InvestigationWorkspace Entity

```
InvestigationWorkspace {
  id: UUID PK
  name: String
  description: Text (nullable)
  created_by_id: FK → User
  jurisdiction_node_id: FK → JurisdictionNode (nullable)
  status: Enum {ACTIVE, ARCHIVED}
  created_at: DateTime
  updated_at: DateTime
}
```

### 3.4 WorkspaceCase Entity

```
WorkspaceCase {
  id: UUID PK
  workspace_id: FK → InvestigationWorkspace
  case_id: FK → Case
  added_by_id: FK → User
  added_at: DateTime
  @@unique([workspace_id, case_id])
}
```

### 3.5 WorkspaceMember Entity

```
WorkspaceMember {
  id: UUID PK
  workspace_id: FK → InvestigationWorkspace
  user_id: FK → User
  role: Enum {OWNER, MEMBER, VIEWER}
  joined_at: DateTime
  @@unique([workspace_id, user_id])
}
```

### 3.6 NOT Modeled

- FIR Group
- Investigator Graph
- Group-of-groups
- Investigator-to-investigator graph

---

## 4. CaseAccess / Authorization Model

### 4.1 Authorization vs Workspace

CaseAccess determines whether a user is permitted to access a Case. InvestigationWorkspace determines which authorized Cases the investigator is currently working with. These are independent concepts.

Workspace membership organizes work. CaseAccess controls access.

### 4.2 CaseAccess Entity

```
CaseAccess {
  id: UUID PK
  user_id: FK → User
  case_id: FK → Case
  access_level: Enum {READ, WRITE, ADMIN}
  granted_by_id: FK → User
  granted_at: DateTime
  expires_at: DateTime (nullable)
  @@unique([user_id, case_id])
}
```

### 4.3 Relationship to FIR Lifecycle

- FIR lifecycle state (ARCHIVED, QUASHED) does NOT revoke CaseAccess.
- Historical Cases remain accessible according to authorization policy.
- Lifecycle affects what operations are permitted, not whether the record is visible.

---

## 5. Pipeline Architecture

### 5.1 Stages 1–6: Per-Case (CURRENT IMPLEMENTATION)

These stages are implemented and working:

```
Stage 1 — Ingestion
Stage 2 — Extraction
Stage 3 — Resolution
Stage 4 — Temporal
Stage 5 — Graph Build
Stage 6 — Local Analytics
```

Each stage operates independently per Case. Each gains a `case_id` parameter.

### 5.2 Stage 11: Global Entity Push + Case Relationship (DESIGNED, NOT IMPLEMENTED)

After local pipeline completes for a Case:
1. Extract identity signals from local entities (phones, accounts, names)
2. Match against Global Entity Identity Index
3. Create/update GlobalEntity records
4. Create GlobalEntityLinks (local entity → global entity)
5. Generate CrossCaseAlerts when entity appears in multiple Cases/jurisdictions
6. Generate CaseRelationship observations (SHARED_ENTITY) and suggestions (POSSIBLE_SAME_INCIDENT)

Stage 11 must NOT automatically assert SAME_INCIDENT as an established fact.

### 5.3 Stage 12: Scoped Analysis (DESIGNED, NOT IMPLEMENTED)

Runs over investigator-selected Cases via AnalysisRun:

1. Take a set of Case IDs (same jurisdiction or cross-jurisdiction)
2. Fetch local graphs for each Case
3. Merge using GlobalEntity identity links
4. Compute analytics and ML on the merged graph (GNN, Bayesian Networks, community detection, centrality, anomaly detection)
5. Store results permanently as AnalysisRun + AnalysisRunResult

---

## 6. PipelineRun vs AnalysisRun

### 6.1 PipelineRun

PipelineRun = execution of the Case processing pipeline. Per-Case. Tracks processing state.

### 6.2 AnalysisRun

AnalysisRun = analytical computation over a fixed Case scope. Tracks analytical state.

### 6.3 Do NOT Merge

PipelineRun and AnalysisRun are separate concepts. Do not solve scoped-analysis persistence by turning PipelineRun into a generic analysis container.

---

## 7. AnalysisRun Persistence and Immutability

### 7.1 AnalysisRun Entity

```
AnalysisRun {
  id: UUID PK
  workspace_id: FK → InvestigationWorkspace (nullable)
  created_by_id: FK → User
  scope_type: Enum {LOCAL, SCOPED}
  description: Text (nullable)
  pipeline_version: String
  model_versions: JSON
  status: Enum {RUNNING, COMPLETED, FAILED}
  started_at: DateTime
  completed_at: DateTime (nullable)
  created_at: DateTime
}
```

### 7.2 AnalysisRunCase Entity

```
AnalysisRunCase {
  id: UUID PK
  analysis_run_id: FK → AnalysisRun
  case_id: FK → Case
  @@unique([analysis_run_id, case_id])
}
```

### 7.3 AnalysisRunResult Entity

```
AnalysisRunResult {
  id: UUID PK
  analysis_run_id: FK → AnalysisRun (unique)
  // Input snapshots — written once at completion, never updated
  case_relationships_snapshot: JSON
  global_entity_links_snapshot: JSON
  // Derived outputs — NOT authoritative source
  merged_graph_nodes: JSON
  merged_graph_edges: JSON
  analytics: JSON
  ml_outputs: JSON
  created_at: DateTime
}
```

### 7.4 Authority Model

| Data | Authoritative Source | AnalysisRunResult |
|------|---------------------|-------------------|
| Case / FIR | Case, FIR tables | — |
| Evidence | Evidence, EvidenceFile tables | — |
| Entities | ResolvedEntity, GlobalEntity tables | — |
| Case Relationships | CaseRelationship table | case_relationships_snapshot (frozen at execution) |
| Global Entity Links | GlobalEntityLink table | global_entity_links_snapshot (frozen at execution) |
| Merged Graph | — | merged_graph_nodes / merged_graph_edges |
| Analytics | — | analytics |
| ML Outputs | — | ml_outputs |

### 7.5 Immutability

- Input snapshots are written once at completion, never updated.
- A completed AnalysisRun's meaning is fixed.
- Later changes to CaseRelationship or GlobalEntityLink affect future analyses, not completed ones.
- AnalysisRunResult is a derived historical artifact, not authoritative source for Case/FIR/Entity data.

---

## 8. Finding / Critic Model

### 8.1 Finding Entity

```
Finding {
  id: UUID PK
  analysis_run_id: FK → AnalysisRun
  finding_type: Enum {HYPOTHESIS, ANOMALY, PATTERN, CRITIC_VERDICT}
  title: String
  description: Text
  confidence: Float (0.0–1.0)
  supporting_case_ids: JSON
  supporting_entity_ids: JSON
  supporting_edge_descriptions: JSON
  supporting_evidence_ids: JSON
  critic_status: Enum {PENDING, CORROBORATED, REFUTED, INCONCLUSIVE}
  critic_notes: Text (nullable)
  critic_confidence: Float (nullable)
  created_by_id: FK → User (nullable — null means system-generated)
  created_at: DateTime
  updated_at: DateTime
  @@index([analysis_run_id])
  @@index([finding_type])
  @@index([critic_status])
}
```

### 8.2 Semantics

- Findings are persistent objects associated with an AnalysisRun.
- System-generated findings (created_by_id = null): HYPOTHESIS, ANOMALY, PATTERN.
- Investigator-created findings have created_by_id set.
- Critic evaluates persisted AnalysisRun/findings, not a temporary session.
- Supporting references use stable IDs (case_ids, entity_ids, evidence_ids).
- Critic evaluation does not delete or modify the original finding.

---

## 9. FIR Lifecycle / Disposition Model

### 9.1 Three Independent Dimensions

**Investigation Status** (police operational lifecycle):
```
REGISTERED → UNDER_INVESTIGATION → CHARGE_SHEETED → FINAL_REPORT → CLOSED
```

**Legal Disposition** (court/legal state):
```
NONE → CANCELLED / QUASHED / DISPOSED / CONVICTED / ACQUITTED
```

**Record Status** (administrative/archive state):
```
ACTIVE → ARCHIVED / SEALED
```

These are independent dimensions. Examples:
- REGISTERED + NONE + ACTIVE
- UNDER_INVESTIGATION + NONE + ACTIVE
- CHARGE_SHEETED + NONE + ACTIVE
- CLOSED + QUASHED + ARCHIVED

### 9.2 FIR Entity (Modified)

```
FIR {
  id: UUID PK
  case_id: FK → Case (unique — one FIR per Case)
  fir_number: String
  jurisdiction_node_id: FK → JurisdictionNode
  description: Text
  filed_by_id: FK → User
  fir_document_r2_key: String (nullable)
  filed_at: DateTime (nullable)
  // Lifecycle fields (mutable, authorization-controlled)
  investigation_status: String (default: "REGISTERED")
  legal_disposition: String (default: "NONE")
  record_status: String (default: "ACTIVE")
  created_at: DateTime
  updated_at: DateTime
  @@unique([fir_number, jurisdiction_node_id])
}
```

### 9.3 FIRLifecycleHistory Entity

```
FIRLifecycleHistory {
  id: UUID PK
  fir_id: FK → FIR
  dimension: Enum {INVESTIGATION_STATUS, LEGAL_DISPOSITION, RECORD_STATUS}
  previous_value: String (nullable — null for initial)
  new_value: String
  changed_by_id: FK → User
  changed_at: DateTime
  reason: Text
  authority_reference: Text (nullable)
  created_at: DateTime
  @@index([fir_id])
  @@index([dimension])
  @@index([changed_at])
}
```

### 9.4 Authorization

Lifecycle transitions are explicit actions, not arbitrary field edits. Authorization is configurable via policy. The system defines demonstrative roles:

- INVESTIGATOR → normal investigation-status transitions
- SENIOR_OFFICER → administrative closure/archive, some legal transitions
- LEGAL_AUTHORITY → legal disposition transitions
- ADMIN → system administration

Sensitive transitions (legal disposition, sealing) require appropriate authorization and an auditable authority reference.

### 9.5 Lifecycle Semantics

| Aspect | ARCHIVED | CLOSED | QUASHED |
|--------|----------|--------|---------|
| Queryable | Yes | Yes | Yes |
| Historical analysis | Available | Available | Available |
| New evidence upload | Blocked | Blocked | Blocked |
| New AnalysisRun | Blocked | Blocked | Blocked (special auth) |
| Workspace participation | Can remain | Can remain | Can remain |
| CaseRelationships | Visible | Visible | Visible, legal status displayed |
| Findings | Referencable | Referencable | Referencable |

### 9.6 Key Rule

Lifecycle state affects how the system presents/permits operations, not whether the underlying record exists. No data is ever deleted due to lifecycle state.

---

## 10. Jurisdiction Model

### 10.1 JurisdictionNode

Configurable police organizational hierarchy tree. Different states and territories use different structures, so the hierarchy is extensible.

**Node types (extensible):**
- NATION, STATE_UT, COMMISSIONERATE, RANGE, DISTRICT, CITY, ZONE, DIVISION, SUB_DIVISION, POLICE_STATION, OUT_POST

**Key properties:**
- parent_id — self-referential FK forms the tree
- status — ACTIVE, INACTIVE, MERGED, SPLIT
- valid_from / valid_to — temporal validity for reorganizations

### 10.2 GeographicJurisdiction

Geographic areas are separate from organizational hierarchy. A single police station may serve multiple geographic areas.

### 10.3 UnresolvedJurisdiction

Parser output that couldn't be matched to a JurisdictionNode. Surfaced for human resolution. Parser NEVER auto-creates authoritative nodes.

### 10.4 CaseJurisdictionLink

Additional jurisdiction relationships on a case (ASSIST, TRANSFER, LINKED). Primary jurisdiction is on Case.jurisdiction_node_id.

### 10.5 JurisdictionHistory

Audit trail for jurisdiction changes (renamed, merged, split, reorganized).

---

## 11. Global Entity Model

### 11.1 What It Is

The Global Entity Identity Index is an identity/linking index ONLY. It is NOT a graph. It does NOT store edges or analytics.

### 11.2 GlobalEntity

Each real-world entity gets one GlobalEntity record with canonical_id, canonical_name, phones, accounts, addresses, total_cases, total_jurisdictions, first_seen, last_seen.

### 11.3 GlobalEntityLink

Links a global entity to a local entity in a specific Case. Includes confidence and match_type.

### 11.4 CrossCaseAlert

Generated when an entity appears in multiple Cases across jurisdictions. Severity based on jurisdiction spread.

---

## 12. Persistence Layers

```
AUTHORITATIVE DOMAIN DATA
 ├── FIR / Case
 ├── Evidence
 ├── Jurisdiction
 ├── Entities
 ├── CaseRelationship
 ├── CaseAccess
 └── FIR Lifecycle History

INVESTIGATION CONTEXT
 ├── InvestigationWorkspace
 ├── WorkspaceCase
 └── WorkspaceMember

ANALYTICAL EXECUTION
 ├── PipelineRun (processing)
 ├── AnalysisRun (analysis)
 ├── AnalysisRunCase
 └── AnalysisRunResult

INTERPRETATION
 ├── Finding
 └── Critic evaluation

AUDIT
 ├── AuditLog
 ├── FIRLifecycleHistory
 └── CaseRelationshipHistory
```

---

## 13. Complete Investigator Workflow

```
LOGIN (session-based)
  ↓
CREATE / OPEN CASE + FIR
  ├── FIR details (number, jurisdiction, description)
  ├── Investigator identity
  └── Jurisdiction context
  ↓
UPLOAD FIR + EVIDENCE
  ├── Each file: uploaded_by, uploaded_at, jurisdiction, integrity
  └── Provenance chain established
  ↓
CURRENT AUTOMATIC PIPELINE (Stages 1–6)
  ├── Stage 1: Ingestion
  ├── Stage 2: Extraction
  ├── Stage 3: Resolution
  ├── Stage 4: Temporal
  ├── Stage 5: Graph Build
  └── Stage 6: Local Analytics
  ↓
FUTURE: Stage 11: Global Entity Push
  ├── GlobalEntity / GlobalEntityLink created
  ├── CaseRelationship created (SHARED_ENTITY)
  └── CrossCaseAlert generated
  ↓
CASE READY
  ↓
INVESTIGATION SESSION
  ↓
OPEN CASE
  ├── Local graph
  ├── Local analytics
  ├── Evidence
  └── Suggested CaseRelationships
  ↓
REVIEW CONNECTIONS
  ├── System shows: "Phone X also appears in Case Y"
  ├── Investigator reviews evidence
  └── Confirm / Reject / Ignore
  ↓
CREATE / OPEN INVESTIGATION WORKSPACE
  ├── Add authorized Cases to workspace
  └── Invite other investigators (optional)
  ↓
FUTURE: RUN SCOPED ANALYSIS (AnalysisRun)
  ├── Select Cases to analyze together
  ├── System merges local graphs using GlobalEntity links
  ├── System runs ML (GNN, BN, community detection, etc.)
  ├── Results stored permanently as AnalysisRun + AnalysisRunResult
  └── System generates Findings
  ↓
FUTURE: CRITIC EVALUATES FINDINGS
  ├── CORROBORATED / REFUTED / INCONCLUSIVE
  └── Notes and confidence
  ↓
INVESTIGATOR VERIFIES FINDINGS
  ↓
FIR LIFECYCLE TRANSITIONS (as needed)
  ├── UNDER_INVESTIGATION → CHARGE_SHEETED
  ├── Legal disposition changes
  └── Record archival
  ↓
REPORT
  ├── References Cases
  ├── References AnalysisRuns
  └── References Findings
```

---

## 14. Multi-Investigator Example

```
CaseAccess:
  Geeta → Case A (WRITE)
  Geeta → Case B (WRITE)
  Geeta → Case C (WRITE)
  Samantha → Case C (WRITE)
  Samantha → Case D (WRITE)
  Samantha → Case E (WRITE)

Geeta's Workspace G:
  ├── Case A (Murder)
  ├── Case B (Same-incident FIR)
  └── Case C (Drug case)

Samantha's Workspace S:
  ├── Case C (Drug case)
  ├── Case D (Another drug case)
  └── Case E (Financial fraud)

Case C is in both workspaces.
Both investigators have CaseAccess for Case C.
Each investigator organizes their own workspace independently.

Geeta's AnalysisRun #1001: Cases [A, B, C]
Samantha's AnalysisRun #1002: Cases [C, D, E]
These are independent analysis runs.

Geeta's Findings reference AnalysisRun #1001.
Samantha's Findings reference AnalysisRun #1002.
No investigator graph.
No shared workspace required.
Access comes from CaseAccess, not workspace membership.
```

---

## 15. Murder / Same-Incident Example

```
Case A (FIR 101/2026, Delhi PS)
  └── Murder of X

Case B (FIR 55/2025, Karol Bagh PS)
  └── Related report about same incident

CaseRelationship {
  case_a_id: Case A
  case_b_id: Case B
  initial_observation: SHARED_ENTITY
  current_assessment: SAME_INCIDENT
  confidence: 0.95
  evidence_summary: "Same victim name, same location, overlapping event time, witness testimony"
  detected_by: SYSTEM
  status: CONFIRMED
  confirmed_by_id: Geeta
}

CaseRelationshipHistory [
  { previous: null → SHARED_ENTITY (system: phone match) },
  { previous: SHARED_ENTITY → POSSIBLE_SAME_INCIDENT (system: same victim, location) },
  { previous: POSSIBLE_SAME_INCIDENT → SAME_INCIDENT (Geeta: confirmed) }
]

Geeta's Workspace G: {A, B}

AnalysisRun #1001:
  Cases: [A, B]
  Scope: SCOPED
  Results: Merged graph showing victim, suspects, timeline across both FIRs
  Findings: [HYPOTHESIS: "Common suspect Rakesh Kumar appears in both FIRs"]

FIR 101/2026 lifecycle:
  REGISTERED → UNDER_INVESTIGATION → CHARGE_SHEETED

FIR 55/2025 lifecycle:
  REGISTERED → UNDER_INVESTIGATION → CLOSED

Both FIRs remain stored.
Both Cases remain stored.
All evidence, graphs, analysis, findings remain referencable.
```

---

## 16. Drug-Related Cross-Case Example

```
Case A (Murder)
  └── Suspect: Rakesh Kumar (phone 9876543210)

Case C (Drug Trafficking)
  └── Suspect: Rakesh Kumar (phone 9876543210)

CaseRelationship {
  case_a_id: Case A
  case_b_id: Case C
  initial_observation: SHARED_ENTITY
  current_assessment: RELATED_CASE
  confidence: 0.87
  evidence_summary: "Same resolved person 'Rakesh Kumar' with same phone number"
  detected_by: SYSTEM
  status: CONFIRMED
  confirmed_by_id: Geeta
}

Case A lifecycle: REGISTERED → UNDER_INVESTIGATION
Case C lifecycle: REGISTERED → UNDER_INVESTIGATION

Geeta's Workspace G: {A, B, C}
Samantha's Workspace S: {C, D, E}

Case C is in both workspaces.

Geeta's AnalysisRun #1001: Cases [A, B, C]
  Findings: [
    HYPOTHESIS: "Rakesh Kumar connects murder and drug networks",
    ANOMALY: "Activity burst in drug case coincides with murder timeline"
  ]

Samantha's AnalysisRun #1002: Cases [C, D, E]
  Findings: [
    PATTERN: "Drug distribution network spans 3 jurisdictions"
  ]

Each AnalysisRun is independent.
Each Finding references its AnalysisRun.
Critic evaluates each Finding independently.
Reports reference Cases, AnalysisRuns, and Findings.
```

---

## 17. Entity Summary

### 17.1 New Entities (11)

| # | Entity | Purpose |
|---|--------|---------|
| 1 | CaseRelationship | Current assessment between two Cases |
| 2 | CaseRelationshipHistory | Audit trail of relationship evolution |
| 3 | CaseAccess | Authorization: who may access which Cases |
| 4 | InvestigationWorkspace | Investigator's working context |
| 5 | WorkspaceCase | Junction: workspace ↔ Case |
| 6 | WorkspaceMember | Junction: workspace ↔ User |
| 7 | AnalysisRun | Immutable analytical computation |
| 8 | AnalysisRunCase | Junction: analysis run ↔ Case |
| 9 | AnalysisRunResult | Derived historical artifact + input snapshots |
| 10 | Finding | Conclusions/hypotheses/critic output |
| 11 | FIRLifecycleHistory | FIR lifecycle audit trail |

### 17.2 Modified Entity (1)

| Entity | Modification |
|--------|-------------|
| FIR | Replace `status` with `investigation_status`, `legal_disposition`, `record_status`; add lifecycle fields |

### 17.3 Removed Entity (1)

| Entity | Reason |
|--------|--------|
| FirStatus | Replaced by three independent lifecycle dimensions |
| PoliceStation | Replaced by JurisdictionNode hierarchy |

---

## 18. Architectural Decisions

### 18.1 Case/FIR Schema Cardinality
FIR holds `case_id` (required, unique). Case does NOT hold `fir_id`. This avoids circular dependencies.

### 18.2 FIR Uniqueness Constraint
`@@unique([firNumber, jurisdictionNodeId])` — jurisdiction-scoped, not global.

### 18.3 Three Lifecycle Dimensions
Separated investigation_status, legal_disposition, record_status for independent lifecycle management. Configurable policies replace hard-coded legal claims.

### 18.4 CaseRelationship Separation
SHARED_ENTITY is an observation. POSSIBLE_SAME_INCIDENT is a hypothesis. SAME_INCIDENT is investigator-confirmed. The system never collapses these meanings.

### 18.5 AnalysisRun Immutability
Input snapshots stored in AnalysisRunResult, written once at completion. Completed AnalysisRun meaning is fixed.

### 18.6 Authorization Separate from Workspace
CaseAccess determines access. Workspace organizes work. These are independent.

### 18.7 No FIR Groups
Independent Cases are related via CaseRelationship, not grouped.

### 18.8 No Investigator Graph
Multi-investigator support via CaseAccess + Workspaces, not investigator-to-investigator graph.

---

## 19. Migration Notes

### 19.1 Schema Changes Applied
- PoliceStation → JurisdictionNode (completed)
- FIR lifecycle fields added (completed)
- 11 new entities added (completed)

### 19.2 Pipeline Code Not Yet Rewired
The pipeline code still references PoliceStation in some places (`connection.py`, `graph_schema.py`, `prompts/registry.py`). These will be updated during the pipeline rewiring phase.

### 19.3 Pipeline Behavior Not Yet Implemented
Stages 7–10 (reasoning), Stages 11–12 (Global Entity Push, Scoped Analysis), CaseRelationship generation, InvestigationWorkspace runtime, AnalysisRun execution, Finding generation, and FIR lifecycle transitions are designed but NOT implemented. The current working pipeline covers Stages 1–6 only.
