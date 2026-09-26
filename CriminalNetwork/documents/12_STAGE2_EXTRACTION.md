# STAGE 2: EXTRACTION ENGINE — Architecture & Implementation

## Overview
Stage 2 takes normalized ingestion output and extracts entities + relations. It supports two modes: code-based (structured data) and LLM-based (unstructured text). Every extraction is epistemically tagged and carries full provenance.

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: EXTRACTION ENGINE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ RawEvidence  │───▶│ File Type    │───▶│  Extraction  │───▶│ Entity   │  │
│  │    []        │    │  Router      │    │    Mode      │    │  List    │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘    └────┬─────┘  │
│                                                 │                  │        │
│                                    ┌────────────┼────────────┐    │        │
│                                    │            │            │    │        │
│                                    ▼            ▼            ▼    │        │
│                              ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│                              │  CODE    │ │   LLM    │ │  HYBRID  │       │
│                              │ (struct) │ │ (unstruc)│ │ (both)   │       │
│                              └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│                                   │            │            │              │
│                                   └────────────┼────────────┘              │
│                                                │                           │
│                                                ▼                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    POST-EXTRACTION                                   │   │
│  │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────┐  │   │
│  │  │ Epistemic  │──▶│ Confidence │──▶│ Dedup      │──▶│ Output    │  │   │
│  │  │ Tagging    │   │ Decompose  │   │ Entities   │   │ Write     │  │   │
│  │  └────────────┘   └────────────┘   └────────────┘   └───────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      OUTPUTS                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │ExtractedEntity│ │ExtractedRelat│ │ ExtractionLog│  │ Run ID  │ │   │
│  │  │    []        │  │    []        │  │    []        │  │         │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Extraction Mode Diagram

```
                    ┌─────────────────────────────────────┐
                    │        RAW EVIDENCE INPUT            │
                    │  (from Stage 1 Ingestion)           │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     FILE TYPE CHECK                  │
                    │  Is it structured (CSV/JSON) or     │
                    │  unstructured (TXT/PDF)?            │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
    ┌─────────────────┐                      ┌─────────────────┐
    │  CODE-BASED     │                      │  LLM-BASED      │
    │  EXTRACTION     │                      │  EXTRACTION     │
    ├─────────────────┤                      ├─────────────────┤
    │ • CSV columns   │                      │ • FIR text      │
    │ • JSON fields   │                      │ • Witness stmt  │
    │ • Pattern match │                      │ • Report text   │
    │ • Regex extract │                      │ • AI parsing    │
    └────────┬────────┘                      └────────┬────────┘
             │                                        │
             └────────────────────┬───────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     NER EXTRACTION                 │
                    │  ┌──────────┐  ┌────────────────┐ │
                    │  │ spaCy    │  │ Hindi NER      │ │
                    │  │ (English)│  │ (Devanagari)   │ │
                    │  └──────────┘  └────────────────┘ │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     ROLE ASSIGNMENT                │
                    │  accused / victim / witness /      │
                    │  complainant                       │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     LOW-CONFIDENCE FILTER          │
                    │  confidence < 0.5 → demoted        │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     ENTITY EXTRACTION              │
                    │  PERSON: name, phone, alias        │
                    │  PHONE: number, carrier            │
                    │  LOCATION: address, city, coords   │
                    │  ACCOUNT: number, bank, holder     │
                    │  ORGANIZATION: name, type          │
                    │  EVENT: case, date, description    │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     RELATION EXTRACTION            │
                    │  CALLED: caller → callee           │
                    │  VISITED: person → location        │
                    │  OWNS_ACCOUNT: person → account    │
                    │  ASSOCIATED_WITH: entity → entity  │
                    │  SUSPECT_OF: person → case         │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     EPISTEMIC TAGGING              │
                    │  observation / inference /         │
                    │  hypothesis                        │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     CONFIDENCE DECOMPOSITION       │
                    │  score × source_reliability ×      │
                    │  derivation_depth                  │
                    └───────────────────────────────────┘
```

---

## Epistemic Tagging

Every entity and relation is tagged with its epistemic category — what kind of knowledge claim it is.

### Categories
```python
class EpistemicCategory(Enum):
    OBSERVATION = "OBSERVATION"      # Direct record (CDR entry, bank transaction)
    INFERENCE = "INFERENCE"          # Derived from observations (entity resolution)
    HYPOTHESIS = "HYPOTHESIS"       # Investigator theory (not in graph as fact)
    UNKNOWN_PROVENANCE = "UNKNOWN_PROVENANCE"
```

### Rule
> **The system may increase the confidence of a hypothesis, but must never upgrade an inference into an observation.**

### What This Means in Practice
- CDR record says "Rakesh called Suresh" → **OBSERVATION** (direct sensor record)
- Entity resolution says "Rakesh = Rakesh Kumar" → **INFERENCE** (derived from observations)
- Investigator says "Rakesh is the kingpin" → **HYPOTHESIS** (not yet evidence)
- An observation can never be downgraded to an inference
- An inference can be upgraded to an observation if corroborated by a new direct record

---

## Confidence Decomposition

Confidence is not just a score — it's a structured object with factors.

```python
ConfidenceSchema {
    score:              0.9
    basis:              ["Phone number found in text"]
    source_reliability: 0.8
    derivation_depth:   0
    semantic_type:      "observation"
    run_id:             "run_20260828_175535"
    factors: [
        {
            factor_type: "source_reliability",
            value:       0.8,
            weight:      0.4,
            description: "Source reliability for fir"
        },
        {
            factor_type: "evidence_basis",
            value:       0.9,
            weight:      0.6,
            description: "Phone number found in text"
        }
    ]
}
```

### Factor Types
| Factor Type | Description | Weight |
|-------------|-------------|--------|
| `source_reliability` | How reliable is this source type for this claim? | 0.4 |
| `evidence_basis` | How strong is the evidence for this claim? | 0.6 |
| `corroboration` | Multiple independent sources agree? | 0.3 |
| `temporal_consistency` | Timestamps are consistent? | 0.2 |
| `spatial_consistency` | Locations are consistent? | 0.2 |

### Derivation Depth
```
0 = RAW        → Direct record (CDR, bank, CCTV)
1 = INFERRED   → Derived from raw data (entity resolution, temporal alignment)
2 = DERIVED    → Derived from inferred data (graph analytics, hypothesis)
```

---

## Entity Extraction

### Code-Based Extraction (Structured Data)

For CSV/JSON/Excel files, extraction follows column patterns:

| Data Type | Entity Types | Relation Types |
|-----------|--------------|----------------|
| CDR | PHONE, PERSON, LOCATION | CALLED, MESSED |
| Bank | PERSON, ACCOUNT, AMOUNT | OWNS_ACCOUNT, TRANSFERRED_TO, RECEIVED_FROM |
| CCTV | PERSON, LOCATION, DEVICE | VISITED, ASSOCIATED_WITH |
| Device | PERSON, PHONE, DEVICE | OWNS_ACCOUNT, ASSOCIATED_WITH |
| Social | PERSON, LOCATION, POST | ASSOCIATED_WITH, FRIEND_OF |
| Criminal | PERSON, CASE_NUMBER | SUSPECT_OF, MEMBER_OF |

### LLM-Based Extraction (Unstructured Text)

For text files (FIR, reports, witness statements):

```python
# LLM prompt for extraction
"""
Extract all entities and relationships from this text.
For each entity: type, name, attributes, confidence.
For each relationship: type, source_entity, target_entity, confidence.
"""
```

### Extraction Methods
- `code` — Pattern matching, regex, column mapping
- `llm` — Large language model extraction
- `vision` — Image analysis (requires vision model, currently flagged for future processing)

---

## Hindi NER (Indian-Language NER)

Extracts entities from Devanagari script text using regex patterns. Runs alongside spaCy English NER.

### Detection
Text is classified as Hindi if it contains ≥5 Devanagari characters (U+0900–U+097F).

### Patterns

| Entity Type | Pattern | Example |
|-------------|---------|---------|
| PERSON | `नाम: X` or name suffixes (सिंह, शर्मा, गुप्ता, यादव, पटेल, कुमार, देवी) | `नाम: राम कुमार` |
| PHONE | 10-digit numbers (same as English) | `9876543210` |
| LOCATION | Hindi locality markers (नगर, पुर, बाग, मंडी, कॉलोनी, गली, मोहल्ला, शहर, जिला, राज्य) | `रामनगर जिला` |

### Confidence
- Hindi NER entities: score = 0.6 (pattern-based, lower than spaCy)
- Basis: `["Hindi text NER pattern"]`

---

## Role Assignment

Detects entity roles from context around mentions. Roles are stored in `entity.attributes["role"]`.

### Role Keyword Patterns

| Role | Patterns | Example Context |
|------|----------|-----------------|
| `accused` | `accused`, `alleged`, `suspect`, `offender`, `प्रतिवादी`, `आरोपी` | `"Rakesh is accused of fraud"` |
| `victim` | `victim`, `complainant`, `deceased`, `मृतक`, `पीड़ित` | `"Suresh was killed"` |
| `witness` | `witness`, `eyewitness`, `साक्षी` | `"Priya witnessed the event"` |
| `complainant` | `complainant`, `reporter`, `शिकायतकर्ता` | `"complaint by Amit"` |

### Pattern Matching
```python
ROLE_PATTERNS = {
    "accused": [
        r'(?:accused|alleged|suspect)\s*[:\s]+([^\n,]+)',
        r'([^\n]+)\s+(?:is accused|was arrested|has been charged)',
    ],
    "victim": [
        r'(?:victim|deceased)\s*[:\s]+([^\n,]+)',
        r'([^\n]+)\s+(?:was killed|was murdered|was attacked)',
    ],
    "witness": [
        r'(?:witness|eyewitness)\s*[:\s]+([^\n,]+)',
        r'([^\n]+)\s+(?:witnessed|saw|observed|testified)',
    ],
    "complainant": [
        r'(?:complainant|reporter)\s*[:\s]+([^\n,]+)',
        r'complaint\s+(?:by|filed by)\s+([^\n,]+)',
    ],
}
```

### Entity Matching
1. Extract name from pattern match
2. Find entity by exact name match
3. Fall back to partial name match (name.lower() in entity.name.lower())
4. Set `entity.attributes["role"] = role`

---

## Low-Confidence Filter

PERSON entities with confidence < 0.5 are demoted — they're too uncertain to be treated as real person entities.

```python
def _apply_low_confidence_filter(entities: list) -> Tuple[list, list]:
    """Convert entities with confidence < 0.5 to UnknownEntity — per docs."""
    kept = []
    demoted = []
    for entity in entities:
        conf = entity.confidence.score if entity.confidence else 0.0
        if conf < 0.5 and entity.entity_type.value == "PERSON":
            demoted.append(entity)
        else:
            kept.append(entity)
    return kept, demoted
```

### What Happens to Demoted Entities
- `entity.attributes["demoted_reason"] = "low_confidence"`
- `entity.attributes["original_type"] = "PERSON"`
- Entity is removed from the main entity list
- Entity is NOT added to the entity index (won't be used in resolution)

### Threshold Rationale
- < 0.5: Too uncertain to be a real person (could be noise from pattern matching)
- ≥ 0.5: Kept as entity (may be weak but still useful for resolution)

---

## Source Metadata

Every entity and relation carries full source metadata:

```python
SourceMetadata {
    source_type:              "fir"
    file_name:                "01_FIR.txt"
    file_hash:                "sha256:51120d879626b21e..."
    ingestion_time:           "2026-08-28T17:55:35"
    provenance:               "OBSERVATIONAL"
    verification:             "UNVERIFIED"
    reliability_occurrence:   0.8
    reliability_identity:     0.7
    reliability_intent:       0.6
    reliability_location:     0.75
    reliability_timing:       0.7
}
```

### Why Multiple Reliability Scores?
A CDR record has:
- occurrence=0.95 (the call happened)
- identity=0.60 (caller might not be SIM owner)
- location=0.80 (tower-based, not GPS)
- timing=0.95 (network timestamp reliable)

So: "The call happened" is reliable, "Rakesh made the call" is less reliable.

---

## Deduplication

### Intra-File Dedup
Same entity appearing multiple times in one file is merged:
- Same phone number → keep first occurrence
- Same name → merge aliases

### Inter-File Dedup (Post-Extraction)
The `resolve_dangling_references()` method fixes ID mismatches:
- Social media uses username-based IDs
- Person entities use display-name-based IDs
- Maps username → display_name and rewrites relation IDs

---

## Relation Extraction

### Relation Types
```python
class RelationType(Enum):
    # Communication
    CALLED = "CALLED"
    MESSED = "MESSED"
    ASSOCIATED_WITH = "ASSOCIATED_WITH"
    # Financial
    TRANSFERRED_TO = "TRANSFERRED_TO"
    RECEIVED_FROM = "RECEIVED_FROM"
    OWNS_ACCOUNT = "OWNS_ACCOUNT"
    # Personal
    FAMILY_OF = "FAMILY_OF"
    FRIEND_OF = "FRIEND_OF"
    ASSOCIATE_OF = "ASSOCIATE_OF"
    WORKS_WITH = "WORKS_WITH"
    # Location
    LIVES_AT = "LIVES_AT"
    WORKS_AT = "WORKS_AT"
    VISITED = "VISITED"
    # Event
    SUSPECT_OF = "SUSPECT_OF"
    VICTIM_OF = "VICTIM_OF"
    WITNESS_OF = "WITNESS_OF"
    # Organization
    MEMBER_OF = "MEMBER_OF"
    # Provenance
    EXTRACTED_FROM = "EXTRACTED_FROM"
    DERIVED_FROM = "DERIVED_FROM"
    # Identity
    POSSIBLE_IDENTITY = "POSSIBLE_IDENTITY"
    SAME_AS = "SAME_AS"
```

### Semantic Edge Types
```python
class SemanticEdgeType(Enum):
    ENTREPRENEURIAL = "entrepreneurial"      # business/profit
    ASSOCIATIONAL = "associational"          # social/bonding
    QUASI_GOVERNMENTAL = "quasi-governmental"  # governance/enforcement
```

---

## Implementation

### Files
- `system/src/extraction/engine.py` — Main extraction engine
- `system/src/ai/caller.py` — LLM caller with retry logic
- `system/src/ai/prompts/registry.py` — LLM prompts

### Key Functions
- `ExtractionEngine.extract_from_file(case_id, file)` — Extract entities and relations from a file, scoped to a case
- `ExtractionEngine.extract_all(case_id, raw_evidence)` — Extract from all ingested files for a case
- `ExtractionEngine.resolve_dangling_references()` — Fix ID mismatches
- `make_confidence()` — Create ConfidenceSchema with factors
- `_extract_cdr()` — Extract from CDR data
- `_extract_bank()` — Extract from bank data
- `_extract_cctv()` — Extract from CCTV data
- `_extract_text()` — Extract from text (FIR, reports)

### Output
- `output/extraction_output.json` — Entities and relations with full metadata
- `output/entity_index.json` — Entity lookup index
- `output/relations.json` — Relation list for graph building

---

## Verification Checklist

After every pipeline run, verify:
- [ ] All entities have `source_id` pointing to source file
- [ ] All entities have `epistemic_category` (observation/inference/hypothesis)
- [ ] All entities have `derivation_depth` (0/1/2)
- [ ] All entities have `run_id` matching pipeline run
- [ ] All confidence schemas have `factors` array
- [ ] All confidence schemas have `semantic_type`
- [ ] All confidence schemas have `source_reliability` from matrix
- [ ] No dangling references (entity IDs exist)
- [ ] No empty attributes (skip instead of fabricate)
- [ ] Hindi text entities extracted with `extracted_from: hindi_ner`
- [ ] Role attributes set on entities (accused/victim/witness/complainant)
- [ ] Low-confidence PERSON entities (< 0.5) demoted from entity list
- [ ] spaCy NER entities tagged with `spacy_label` and position info
