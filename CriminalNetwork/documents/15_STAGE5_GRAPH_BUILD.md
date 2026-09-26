# STAGE 5: GRAPH BUILDER — Architecture & Implementation

## Overview
Stage 5 creates the evidence graph from resolved entities, relations, temporal data, and unknown entities. It implements the full architecture per STAGE_REASONERS.md, DATA_FLOW.md, INTERNAL_BINDINGS.md, and OUTPUTS.md.

**Key features:**
- Confidence propagation (min of source, target, extraction) per STAGE_REASONERS.md
- Confidence threshold filtering (edges < 0.5 rejected)
- ConfidenceSchema on edges (structured decomposition, not bare float)
- Contradicting evidence tracking
- Step-by-step provenance derivation chains
- Adversarial edge detection
- Missing edge tracking
- 4 semantic categories (entrepreneurial, associational, quasi-governmental, upperworld_bridge)
- Independence logic based on dependency groups
- UnknownEntity node creation
- Temporal spatial store consumption
- created_at/updated_at timestamps

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

**Note:** The local graph is built **per Case** (not per pipeline run). All graph nodes and edges carry a `case_id` to scope them to the specific case being processed.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 5: GRAPH BUILDER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INPUTS (5 stores per INTERNAL_BINDINGS.md):                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐          │
│  │ ResolvedEnt  │ │ UnknownEnt   │ │ Relations    │ │ Temporal │          │
│  │  (67)        │ │  (0)         │ │  (195)       │ │ (215)    │          │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────┬─────┘          │
│         └────────────────┼────────────────┼───────────────┘                │
│                          │                │                                 │
│                          ▼                ▼                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 1: CREATE NODES (resolved + unknown)                           │   │
│  │  STEP 2: CREATE EDGES with confidence propagation + threshold        │   │
│  │  STEP 3: SEMANTIC CLASSIFICATION (4 categories)                      │   │
│  │  STEP 4: PROVENANCE CHAINS (step-by-step derivation)                 │   │
│  │  STEP 5: DEPENDENCY CHECK (independence logic)                       │   │
│  │  STEP 6: ADVERSARIAL DETECTION                                       │   │
│  │  STEP 7: MISSING EDGE TRACKING                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│                          ▼                                                  │
│  OUTPUTS:                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐          │
│  │ GraphNode    │ │ GraphEdge    │ │ Provenance   │ │Missing   │          │
│  │    (67)      │ │    (45)      │ │ Chains (112) │ │Edges (1) │          │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Processing Pipeline Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │     INPUT: All Pipeline Data                         │
                    │  • Resolved Entities (67)                            │
                    │  • Unknown Entities (0)                              │
                    │  • Raw Entities (152)                                │
                    │  • Relations (195)                                   │
                    │  • Temporal Infos (215)                              │
                    │  • Spatial Infos (14)                                │
                    │  • Contradictions (24)                               │
                    │  • Dependency Groups (7)                             │
                    └──────────────┬──────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 1: CREATE ENTITY NODES         │
                    │  • Resolved entities → 67 nodes      │
                    │  • Unknown entities → 0 nodes        │
                    │  • Build provenance chains            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 2: CREATE RELATIONSHIP EDGES   │
                    │  • Group by (source, target, type)   │
                    │  • Confidence propagation:           │
                    │    min(source, target, extraction)   │
                    │  • Threshold filter: reject < 0.5    │
                    │  • Deduplicate edges                 │
                    │  • 195 → 45 edges                    │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 3: SEMANTIC CLASSIFICATION      │
                    │  4 categories:                        │
                    │  ├── entrepreneurial (4)              │
                    │  ├── associational (39)               │
                    │  ├── quasi-governmental (2)           │
                    │  └── upperworld_bridge (0)            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 4: PROVENANCE CHAINS            │
                    │  • Step-by-step derivation chain      │
                    │  • RawEvidence → Extracted → Resolved │
                    │  • 112 chains (67 nodes + 45 edges)  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 5: DEPENDENCY CHECK             │
                    │  • Same group → NOT independent       │
                    │  • Different groups → independent     │
                    │  • 5 independent, 40 dependent        │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 6: ADVERSARIAL DETECTION        │
                    │  • Hub pattern detection              │
                    │  • Weak relation high confidence      │
                    │  • Missing temporal info               │
                    │  • Self-loop detection                 │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  STEP 7: MISSING EDGE TRACKING        │
                    │  • Shared phone → expected edge       │
                    │  • 1 missing edge detected            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  OUTPUTS                              │
                    │  graph_nodes.json (67)                │
                    │  graph_edges.json (45)                │
                    │  provenance_chains.json (112)         │
                    │  missing_edges.json (1)               │
                    │  rejected_edges.json (0)              │
                    │  graph_log.json                       │
                    └─────────────────────────────────────┘
```

---

## Confidence Propagation (per STAGE_REASONERS.md)

Every edge gets a full `ConfidenceSchema` (not bare float):

```
edge_confidence = min(source_entity_confidence, target_entity_confidence, extraction_confidence)
```

**Additional adjustments:**
- **Corroboration boost:** +0.02 per additional supporting source (max +0.1)
- **Contradiction penalty:** -0.1 per contradicting source (max -0.3)
- **Provenance decay:** × 0.85 per depth step beyond depth 5

**Example:**
```
Source entity confidence: 0.50
Target entity confidence: 0.50
Extraction confidence:    0.70
→ edge_confidence = min(0.50, 0.50, 0.70) = 0.50
```

**ConfidenceSchema structure:**
```json
{
  "score": 0.52,
  "basis": ["min(source=0.50, target=0.50, extraction=0.70)"],
  "supporting_count": 2,
  "contradicting_count": 0,
  "source_reliability": 0.5,
  "derivation_depth": 0,
  "is_independent": true,
  "semantic_type": "inference",
  "factors": [
    {"factor_type": "source_reliability", "value": 0.5, "weight": 0.4},
    {"factor_type": "entity_resolution", "value": 0.5, "weight": 0.3},
    {"factor_type": "extraction_confidence", "value": 0.7, "weight": 0.3}
  ]
}
```

---

## Confidence Threshold Filtering

Edges with confidence < 0.50 are **rejected** and not added to the graph.

```python
if confidence_schema.score < MIN_EDGE_CONFIDENCE:
    rejected_edges.append({...})
    continue  # Don't create this edge
```

Rejected edges are saved to `rejected_edges.json` for investigator review.

---

## Adversarial Edge Detection (per STAGE_REASONERS.md)

Every edge is checked for adversarial patterns:

| Check | Score | Condition |
|-------|-------|-----------|
| Hub pattern | +0.2 | Source has > 10 outgoing edges |
| Weak relation high confidence | +0.3 | confidence > 0.95 on ASSOCIATED_WITH/MESSED |
| Missing temporal | +0.1 | CALLED/TRANSFERRED_TO without timestamp |
| Self-loop | +0.5 | source_id == target_id |

Edges with `adversarial_score > 0.3` are flagged in the summary.

---

## Missing Edge Tracking (per STAGE_REASONERS.md Step 5)

The system reasons about **expected-but-absent** relationships:

- If entity A and entity B share a phone number, they should have an ASSOCIATED_WITH edge
- Missing edges are saved to `missing_edges.json`

**Demo result:** 1 missing edge detected (two entities sharing phone 9111223344).

---

## Independence Logic

Edges in the same `dependency_group` are marked as **NOT independent**:

```python
if edge.dependency_group:
    same_group = count edges with same dependency_group
    edge.is_independent = (same_group == 0)
```

**Demo result:** 5 independent edges, 40 dependent edges (from 7 dependency groups).

---

## Semantic Edge Classification (4 categories)

| Category | Description | Demo Count |
|----------|-------------|------------|
| `entrepreneurial` | Business/profit relations | 4 |
| `associational` | Social/bonding relations | 39 |
| `quasi-governmental` | Enforcement relations | 2 |
| `upperworld_bridge` | Corrupt officials, legitimate fronts | 0 |

---

## Provenance Derivation Chain (step-by-step)

Every edge has a step-by-step derivation chain:

```json
[
  {"step": 0, "type": "RawEvidence", "id": "02_CDR_Rakesh.csv"},
  {"step": 1, "type": "ExtractedEntity", "id": "REL_c6b516410fa59605"},
  {"step": 2, "type": "ResolvedEntity", "id": "RES_7619ee8cea49187f"}
]
```

---

## Semantic Edge Classification Diagram

```
    ┌──────────────────────────────────────────────────────────────┐
    │              SEMANTIC EDGE CLASSIFICATION (4 TYPES)            │
    ├──────────────────────────────────────────────────────────────┤
    │                                                              │
    │  ENTREPRENEURIAL (business/profit)                          │
    │  • TRANSFERRED_TO, RECEIVED_FROM, OWNS_ACCOUNT, WORKS_WITH │
    │  Count: 4 edges                                              │
    │                                                              │
    │  ASSOCIATIONAL (social/bonding)                              │
    │  • CALLED, MESSED, ASSOCIATED_WITH, FAMILY_OF, FRIEND_OF   │
    │  • ASSOCIATE_OF, VISITED, MEMBER_OF                         │
    │  Count: 39 edges                                             │
    │                                                              │
    │  QUASI-GOVERNMENTAL (enforcement)                            │
    │  • SUSPECT_OF, VICTIM_OF, WITNESS_OF, LIVES_AT, WORKS_AT  │
    │  Count: 2 edges                                              │
    │                                                              │
    │  UPPERWORLD_BRIDGE (corrupt officials, legitimate fronts)   │
    │  • REGISTERED_OWNER, ACTUAL_USER, DRIVER, PURCHASER        │
    │  • INSURER, PASSENGER                                        │
    │  Count: 0 edges (none in demo data)                          │
    └──────────────────────────────────────────────────────────────┘
```

---

## Pipeline

```
1. CREATE ENTITY NODES
   └── From ResolvedEntity[]
   └── Create graph nodes with attributes

2. CREATE RELATIONSHIP EDGES
   └── From ExtractedRelation[]
   └── Map to resolved entity IDs

3. ASSIGN RELATIONSHIP SEMANTICS
   └── Classify into four functions:
       ├── Entrepreneurial (business/profit)
       ├── Associational (social/bonding)
       ├── Quasi-governmental (governance/enforcement)
       └── Upperworld bridge (corrupt officials, legitimate fronts)

4. CREATE PROVENANCE CHAINS
   └── Trace back to raw evidence
   └── Track derivation depth

5. CHECK DEPENDENCY
   └── Check if derived from same source
   └── Flag dependent evidence
```

---

## Semantic Edge Classification

Every relationship is classified into one of four semantic types:

### Entrepreneurial (business/profit)
```python
{
    "TRANSFERRED_TO": "entrepreneurial",
    "RECEIVED_FROM": "entrepreneurial",
    "OWNS_ACCOUNT": "entrepreneurial",
    "WORKS_WITH": "entrepreneurial",
}
```

### Associational (social/bonding)
```python
{
    "CALLED": "associational",
    "MESSED": "associational",
    "ASSOCIATED_WITH": "associational",
    "FAMILY_OF": "associational",
    "FRIEND_OF": "associational",
    "ASSOCIATE_OF": "associational",
    "VISITED": "associational",
    "MEMBER_OF": "associational",
}
```

### Quasi-governmental (governance/enforcement)
```python
{
    "SUSPECT_OF": "quasi-governmental",
    "VICTIM_OF": "quasi-governmental",
    "WITNESS_OF": "quasi-governmental",
    "LIVES_AT": "quasi-governmental",
    "WORKS_AT": "quasi-governmental",
}
```

---

## Graph Nodes

Each resolved entity becomes a graph node:

```json
{
    "id": "RES_10f7b52d",
    "node_type": "person",
    "name": "Amit Sharma",
    "case_id": "CASE_001",
    "attributes": {
        "phone": "9988776655",
        "criminal_score": 0.8,
        "previous_cases": 2
    },
    "confidence": 0.95,
    "epistemic_status": "inference",
    "derivation_depth": 1,
    "source_entities": ["PERSON_8d55d20c", "PERSON_10f7b52d"],
    "provenance_chain": ["08_Device_Rakesh.json", "07_Bank_Amit.csv"],
    "effective_confidence": 0.85,
    "run_id": "run_20260828_181328"
}
```

### Node Types
| Type | Description | Count |
|------|-------------|-------|
| `person` | Individual person | 54 |
| `phone` | Phone number | 3 |
| `vehicle` | Vehicle | 2 |
| `location` | Location | 3 |
| `account` | Bank account | 1 |
| `organization` | Organization | 2 |
| `case` | Criminal case / FIR | 35 |
| `crime` | Crime type | 2 |

---

## Graph Edges

Each extracted relationship becomes a graph edge with full ConfidenceSchema:

```json
{
    "id": "EDGE_06bdad1856aba774",
    "source_id": "RES_7619ee8cea49187f",
    "target_id": "RES_1684227b5846732f",
    "relation_type": "VISITED",
    "edge_type": "associational",
    "case_id": "CASE_001",
    "confidence": {
        "score": 0.52,
        "basis": ["min(source=0.50, target=0.50, extraction=0.70)"],
        "supporting_count": 2,
        "contradicting_count": 0,
        "source_reliability": 0.5,
        "derivation_depth": 0,
        "is_independent": true,
        "semantic_type": "inference",
        "factors": [
            {"factor_type": "source_reliability", "value": 0.5, "weight": 0.4},
            {"factor_type": "entity_resolution", "value": 0.5, "weight": 0.3},
            {"factor_type": "extraction_confidence", "value": 0.7, "weight": 0.3}
        ]
    },
    "supporting_evidence": ["02_CDR_Rakesh.csv", "12_WEIRD_CDR.csv"],
    "contradicting_evidence": [],
    "derivation": [
        {"step": 0, "type": "RawEvidence", "id": "02_CDR_Rakesh.csv"},
        {"step": 1, "type": "ExtractedEntity", "id": "REL_c6b516410fa59605"}
    ],
    "temporal_info": {"precision": "unknown", "confidence": 0.0},
    "dependency_group": "grp_cdr_2",
    "is_independent": false,
    "adversarial_score": 0.0,
    "epistemic_status": "observation",
    "derivation_depth": 0,
    "created_at": "2026-08-29T15:52:39.375568",
    "updated_at": "2026-08-29T15:52:39.375568",
    "run_id": "run_20260829_155238"
}
```

---

## Provenance Chains

Every node and edge traces back to raw evidence:

```python
ProvenanceChain {
    id:                 "PROV_abc123"
    node_id:            "RES_10f7b52d"
    derivation_type:    "inferred"
    depth:              1
    source_evidence:    ["08_Device_Rakesh.json", "07_Bank_Amit.csv"]
    is_independent:     true
    dependency_group:   ""
}
```

### Derivation Depth
```
0 = RAW        → Direct record (CDR, bank, CCTV)
1 = INFERRED   → Merged from raw data (entity resolution)
2 = DERIVED    → Derived from inferred data (graph analytics)
```

---

## Dependency Checking

Edges are checked for shared sub-sources:

```python
# Same FIR → dependent
edge1.dependency_group = "grp_fir_0"
edge2.dependency_group = "grp_fir_0"
# These edges are DEPENDENT — do not multiply confidence

# Different sources → independent
edge1.dependency_group = "grp_cdr_0"
edge2.dependency_group = "grp_bank_1"
# These edges are INDEPENDENT — can multiply confidence
```

---

## Implementation

### Files
- `system/src/graph/__init__.py` — Module export
- `system/src/graph/builder.py` — Main graph builder (all features: confidence propagation, threshold, adversarial, missing edges, provenance chains, 4-category semantic)
- `system/src/resolution/graph_schema.py` — DEPRECATED: Original Playbook V4 schema (retained for reference only, not used by pipeline)

### Key Functions
- `GraphBuilder.build(case_id)` — Full 7-step graph build pipeline for a case
- `create_entity_nodes(case_id, resolved, unknown)` — Resolved + unknown entities → nodes, scoped to case
- `create_relationship_edges(case_id, relations, resolved)` — Deduplication + confidence propagation + threshold filter, scoped to case
- `propagate_confidence()` — min(source, target, extraction) with decay + corroboration
- `detect_adversarial_edge()` — Hub pattern, weak relation, missing temporal, self-loop
- `detect_missing_edges()` — Shared phone → expected ASSOCIATED_WITH
- `build_derivation_chain()` — Step-by-step: RawEvidence → Extracted → Resolved
- `classify_semantic_edge()` — 4 categories: entrepreneurial/associational/quasi-governmental/upperworld_bridge
- `check_dependencies()` — Independence logic based on dependency groups

### Output Files
- `output/graph_nodes.json` — Graph nodes (67)
- `output/graph_edges.json` — Graph edges (45, with ConfidenceSchema)
- `output/provenance_chains.json` — Provenance chains (112, step-by-step derivation)
- `output/missing_edges.json` — Missing/expected edges (1)
- `output/rejected_edges.json` — Edges rejected by confidence threshold (0)
- `output/graph_log.json` — Graph build summary with all stats

---

## Verification Checklist

After every pipeline run, verify:
- [ ] All resolved entities have graph nodes (67 nodes)
- [ ] Unknown entities have graph nodes (0 in demo)
- [ ] All edges have ConfidenceSchema (not bare float)
- [ ] All edges have semantic classification (4 categories)
- [ ] All edges have step-by-step derivation chain
- [ ] All edges have contradicting_evidence field
- [ ] All edges have adversarial_score
- [ ] All edges have created_at/updated_at
- [ ] Confidence < 0.5 edges are rejected
- [ ] Independence logic applied (dependency groups)
- [ ] Missing edges detected and saved
- [ ] All nodes/edges have provenance chains
- [ ] No self-loops in edges
- [ ] Source IDs mapped to resolved entity IDs
- [ ] Temporal spatial store consumed for edge enrichment

---

## Knowledge Graph Schema

In addition to the main evidence graph, the resolution engine produces a knowledge graph with a richer schema.

### 8 Node Types

| Type | Description | Example |
|------|-------------|---------|
| `person` | Person (individual) | "Amit Sharma" |
| `phone` | Phone number | "9988776655" |
| `vehicle` | Vehicle (car, bike) | "MP04A1234" |
| `location` | Location (address, city) | "Hotel Taj, Guna" |
| `account` | Bank account | "HDFC-50100..." |
| `case` | Criminal case / FIR | "FIR 123/2024" |
| `organization` | Organization / company | "Bajrang Dal" |
| `crime` | Crime type | "Murder" |

### 7 Edge Types

| Type | Category | Description |
|------|----------|-------------|
| `ASSOCIATED_WITH` | associational | General association |
| `LOCATED_AT` | associational | Person at location |
| `TRANSACTION_WITH` | entrepreneurial | Financial transaction |
| `INVOLVED_IN` | quasi-governmental | Involvement in case |
| `HAS_PHONE` | associational | Ownership of phone |
| `OWNS_VEHICLE` | entrepreneurial | Vehicle ownership |
| `COMMITS` | quasi-governmental | Committing a crime |

### Knowledge Graph Counts (Demo Data)

| Metric | Count |
|--------|-------|
| Nodes | 102 |
| Edges | 195 |
| Node types | person (54), case (35), location (3), crime (2), account (1), organization (2), vehicle (2), phone (3) |
| Edge type | ASSOCIATED_WITH (195) |

---

## Two Graph Outputs

The pipeline produces two graph outputs:

| Output | Source | Nodes | Edges | Purpose |
|--------|--------|-------|-------|---------|
| `graph_nodes.json` / `graph_edges.json` | Graph Builder (Stage 5) | 67 | 45 | Main evidence graph — deduplicated, merged entities, semantic classification |
| `knowledge_graph_nodes.json` / `knowledge_graph_edges.json` | Resolution Engine (Stage 3) | 102 | 195 | Raw knowledge graph — all resolved entities, 8 node types, 7 edge types |

The main graph is a deduplicated view (67 entities from 152 raw). The knowledge graph preserves all resolved entities with the richer schema for the dashboard and analytics.

---

## Results on Demo Data

### Input
- 152 entities (from Stage 2 extraction)
- 67 resolved entities (from Stage 3)
- 215 temporal infos (from Stage 4)
- 14 spatial infos (from Stage 4)
- 24 contradictions (from Stage 3)
- 195 relations (from Stage 2)

### Output
| Metric | Count |
|--------|-------|
| Graph nodes | 67 (from 152 raw, all resolved) |
| Graph edges | 45 (from 195 raw, deduplicated) |
| Missing edges | 1 (shared phone detection) |
| Rejected edges | 0 (all above threshold) |
| Provenance chains | 112 (67 nodes + 45 edges) |
| Independent edges | 5 |
| Dependent edges | 40 |
| Adversarial flagged | 0 |

### Edge Types (4 categories)
| Category | Count |
|----------|-------|
| associational | 39 |
| entrepreneurial | 4 |
| quasi-governmental | 2 |
| upperworld_bridge | 0 |

### Confidence Stats
| Metric | Value |
|--------|-------|
| Min | 0.500 |
| Max | 0.540 |
| Avg | 0.505 |
| Threshold | 0.500 |
