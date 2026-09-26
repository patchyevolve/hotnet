# Stage 3: Entity Resolution — Architecture & System Design

## 1. Purpose

Stage 3 resolves identity uncertainty across extracted entities. After Stage 2 produces 80 entities from 20 evidence files, many represent the same real-world person/thing under different names, formats, or partial descriptions. Stage 3 merges these into canonical entities while preserving uncertainty where resolution is ambiguous.

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

**The One Rule still applies:**
> "The system may increase the confidence of a hypothesis, but it must never upgrade an inference into an observation."

Entity resolution is probabilistic. Never merge with 100% certainty unless government ID match.

All resolution operations are scoped to a `case_id`.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: ENTITY RESOLUTION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ ExtractedEnt │───▶│  Rule Pass   │───▶│  LLM Pass    │───▶│ Merger   │  │
│  │  (80 items)  │    │ (exact+fuzzy)│    │  (5-signal)  │    │          │  │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘  │
│                             │                    │                  │        │
│                    ┌────────▼────────┐   ┌───────▼───────┐  ┌──────▼─────┐  │
│                    │  Auto-Merge     │   │  LLM Verdict  │  │  Union-Find│  │
│                    │  Candidates     │   │  (merge/rej)  │  │  Grouping  │  │
│                    └─────────────────┘   └───────────────┘  └──────┬─────┘  │
│                                                                    │        │
│                                                                    ▼        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    MERGE + UNKNOWN + CONTRADICTION                   │   │
│  │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────┐  │   │
│  │  │  Identity  │──▶│  Effective │──▶│ Contradict │──▶│ Output    │  │   │
│  │  │  Uncertain │   │  Confidence│   │ Detection  │   │ Write     │  │   │
│  │  │            │   │            │   │ (8 types)  │   │           │  │   │
│  │  └────────────┘   └────────────┘   └────────────┘   └───────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      OUTPUTS                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │ResolvedEntity│  │UnknownEntity │  │ Contradiction│  │Resolution│ │   │
│  │  │    (67)      │  │    (0)       │  │    (24)      │  │ History │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resolution Pipeline Diagram

```
                    ┌─────────────────────────────────────┐
                    │     EXTRACTED ENTITIES (152)         │
                    │  from Stage 2 Extraction             │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 1: BUILD FUZZY INDEX        │
                    │  Inverted index + Trie autocomplete  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 2: RULE PASS                │
                    │  (fast, free, obvious)               │
                    │  Exact phone, account, name match    │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  Exact Phone    │  │  Exact Account  │  │  Jaro-Winkler   │
    │  Match          │  │  Match          │  │  Fuzzy Name     │
    │  → auto-merge   │  │  → auto-merge   │  │  → merge candid │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 3: PHONETIC MATCHING      │
                    │  Soundex + Metaphone + Indian      │
                    │  transliteration (50+ variants)    │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 4: FUZZY INDEX SEARCH     │
                    │  ~ operator (max edit distance 2)  │
                    │  Trie prefix autocomplete           │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 5: MULTI-SIGNAL DISAMBIG  │
                    │  Phone + Vehicle + DOB + Location  │
                    │  + Case overlap signals            │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 6: GROUP SIMILAR          │
                    │  (find candidates for LLM)         │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 7: LLM EVALUATE           │
                    │  (intelligent judgment)             │
                    │  5-signal scoring:                 │
                    │  • Name similarity                 │
                    │  • Phone match                     │
                    │  • Location correlation            │
                    │  • Temporal overlap                │
                    │  • Context consistency             │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 8: RANKED CANDIDATES      │
                    │  "Did you mean..." + confirm gate  │
                    └─────────────┬─────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 9: MERGE                  │
                    │  (union-find + identity uncertain) │
                    │  + Resolution History Tracking     │
                    │  + Role Consolidation              │
                    └─────────────┬─────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  ResolvedEntity │  │  UnknownEntity  │  │  Contradiction  │
    │  (67)           │  │  (0)            │  │  (24, 8 types)  │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │     STEP 10: KNOWLEDGE GRAPH       │
                    │  8 node types + 7 edge types       │
                    └───────────────────────────────────┘
```

---

## Identity Uncertainty Propagation

```
    ┌──────────────────────────────────────────────────────────────┐
    │              EFFECTIVE CONFIDENCE CALCULATION                │
    ├──────────────────────────────────────────────────────────────┤
    │                                                              │
    │  Source A: Suresh (CDR)                                      │
    │  ┌─────────────────────────────────────────────────────────┐ │
    │  │  confidence.score = 0.95                                │ │
    │  │  source.reliability_occurrence = 0.95                   │ │
    │  │  source.reliability_identity = 0.60                     │ │
    │  └─────────────────────────────────────────────────────────┘ │
    │                           │                                  │
    │                           ▼                                  │
    │  Source B: Suresh Kumar (Bank)                               │
    │  ┌─────────────────────────────────────────────────────────┐ │
    │  │  confidence.score = 0.98                                │ │
    │  │  source.reliability_occurrence = 0.98                   │ │
    │  │  source.reliability_identity = 0.85                     │ │
    │  └─────────────────────────────────────────────────────────┘ │
    │                           │                                  │
    │                           ▼                                  │
    │  MERGE: effective_confidence =                               │
    │  merge_confidence × avg(source_identity_confidence)          │
    │                                                              │
    │  = 0.9 × (0.60 + 0.85) / 2                                  │
    │  = 0.9 × 0.725                                               │
    │  = 0.6525                                                     │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
```

---

## Pipeline Position

```
Stage 1: Ingestion     → RawEvidence[]
Stage 2: Extraction    → ExtractedEntity[], ExtractedRelation[]
                        ↓
Stage 3: Resolution    → ResolvedEntity[], UnknownEntity[], Contradiction[]
                        ↓
Stage 4: Temporal      → TemporalInfo per entity
Stage 5: Graph Build   → EvidenceEdge[] with canonical IDs
Stage 6: Analytics     → Patterns, communities, anomalies
Stage 7: Hypothesis    → Competing explanations
Stage 8: Contradiction → Conflict analysis
Stage 9: Gap Detection → Missing evidence
Stage 10: Critic       → Quality audit
```

Stage 3 reads from `EXTRACTED_ENTITIES_STORE` and `EXTRACTED_RELATIONS_STORE`.
Stage 3 writes to `RESOLVED_ENTITIES_STORE`, `UNKNOWN_ENTITIES_STORE`, and `CONTRADICTIONS_STORE`.

---

## 3. Input Format

Stage 3 consumes the output of Stage 2:

```json
// extraction_output.json
{
  "entities": [
    {
      "id": "PERSON_bac015e7",
      "entity_type": "PERSON",
      "name": "Suresh",
      "aliases": ["Suresh"],
      "attributes": {"phone": "9123456789"},
      "confidence": {"score": 0.8},
      "source": {"file_name": "03_CDR_Suresh.csv"}
    },
    {
      "id": "PERSON_773b8a4b",
      "entity_type": "PERSON",
      "name": "Suresh Kumar",
      "aliases": ["Suresh Kumar"],
      "attributes": {"account_holder": "Suresh Kumar", "phone": "9123456789"},
      "confidence": {"score": 1.0},
      "source": {"file_name": "06_Bank_Suresh.csv"}
    }
  ],
  "relations": [...]
}
```

### Current Demo Data (53 entities)

| Type | Count | Examples |
|------|-------|---------|
| PERSON | 10 | Suresh, Suresh Kumar, Amit Sharma, Amit Bhai, Priya, Priya Mehta |
| PHONE | 11 | 9876543210, 9123456789, 9988776655 |
| LOCATION | 14 | Dwarka New Delhi, Goa India, Noida UP |
| ACCOUNT | 3 | Account 1234, 1235, 9876 |
| ORGANIZATION | 2 | Rajesh Electronics, Airtel Office |
| EVENT | 8 | Case_2022_089, Case_2021_234 |
| AMOUNT | 2 | transaction amounts |
| DATE | 2 | dates |
| DEVICE | 1 | Samsung Galaxy M34 |

### Known Resolution Targets

| Entity A | Entity B | Expected Resolution |
|----------|----------|---------------------|
| `Suresh` | `Suresh Kumar` | Merge → "Suresh Kumar" |
| `Amit Sharma` | `Amit Bhai` | Merge → "Amit Sharma" |
| `Amit Sharma` (caed6d23) | `Amit Sharma` (10f7b52d) | Merge (same name, different sources) |
| `Priya` | `Priya Mehta` | Merge → "Priya Mehta" |
| `rakesh_rocky` | — | Keep as alias of Rakesh Kumar |
| `Unknown (caller claimed to be from SBI)` | — | UnknownEntity |

---

## 4. Processing Pipeline

```
extraction_output.json
      │
      ▼
┌─────────────────────────────────────────────────┐
│  STEP 1: RULE PASS (fast, free, obvious)        │
│  ├── Exact phone match → auto-merge             │
│  ├── Exact account match → auto-merge           │
│  └── Exact name match (normalized) → auto-merge │
└──────────────────┬──────────────────────────────┘
                   │ remaining entities (no auto-merge)
                   ▼
┌─────────────────────────────────────────────────┐
│  STEP 2: GROUP SIMILAR (find candidates)        │
│  ├── First-name match                           │
│  ├── Partial name containment                   │
│  ├── Shared phone number                        │
│  ├── Shared account number                      │
│  └── Attribute overlap > threshold              │
└──────────────────┬──────────────────────────────┘
                   │ candidate groups
                   ▼
┌─────────────────────────────────────────────────┐
│  STEP 3: LLM EVALUATE (intelligent judgment)    │
│  ├── Send each group to LLM                     │
│  ├── LLM evaluates 5 signals                    │
│  ├── Returns structured verdict                 │
│  └── Reasoning trail for audit                  │
└──────────────────┬──────────────────────────────┘
                   │ merge candidates + verdicts
                   ▼
┌─────────────────────────────────────────────────┐
│  STEP 4: CROSS-SIGNAL VALIDATE                  │
│  ├── LLM + rules agree → high confidence        │
│  ├── LLM + rules disagree → flag for review     │
│  └── LLM uncertain → flag for review            │
└──────────────────┬──────────────────────────────┘
                   │ confirmed merges + review flags
                   ▼
┌─────────────────────────────────────────────────┐
│  STEP 5: MERGE + UNKNOWN + CONTRADICTION        │
│  ├── Create ResolvedEntities (canonical IDs)    │
│  ├── Create UnknownEntities (unresolved)        │
│  └── Flag Contradictions (attribute conflicts)  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
resolved_entities.json
unknown_entities.json
contradictions.json
resolution_log.json
```

---

## 5. Step-by-Step Design

### Step 1: Rule Pass

Fast, zero-cost matching for obvious cases. Includes Jaro-Winkler fuzzy matching.

```python
def rule_pass(entities: List[dict]) -> List[MergeCandidate]:
    """
    Find obvious merges using exact matching and Jaro-Winkler fuzzy matching.
    Returns merge candidates that can be auto-merged.
    """
    auto_merges = []

    # Phone exact match
    phone_groups = group_by(entities, "phone")
    for phone, group in phone_groups.items():
        if len(group) > 1:
            auto_merges.append(MergeCandidate(
                entities=group,
                reason="exact_phone_match",
                confidence=1.0
            ))

    # Account exact match
    account_groups = group_by(entities, "account_number")
    for account, group in account_groups.items():
        if len(group) > 1:
            auto_merges.append(MergeCandidate(
                entities=group,
                reason="exact_account_match",
                confidence=1.0
            ))

    # Normalized name exact match
    name_groups = group_by_normalized_name(entities)
    for name, group in name_groups.items():
        if len(group) > 1:
            auto_merges.append(MergeCandidate(
                entities=group,
                reason="exact_name_match",
                confidence=0.95
            ))

    # Jaro-Winkler fuzzy name match (NEW)
    fuzzy_matches = find_fuzzy_name_matches(entities, threshold=0.85)
    auto_merges.extend(fuzzy_matches)

    return auto_merges
```

**Jaro-Winkler Similarity:**
```python
def jaro_winkler(s1, s2, p=0.1):
    """
    Compute Jaro-Winkler similarity between two strings.
    Returns 0.0 (no match) to 1.0 (exact match).
    """
```

| Similarity | Action |
|-----------|--------|
| 1.0 | Exact match → auto-merge |
| 0.85-0.99 | Fuzzy match → merge candidate |
| 0.70-0.84 | Possible match → LLM evaluation |
| < 0.70 | Different entities |

**Rules:**
- Phone numbers normalize to 10 digits (strip country code)
- Names normalize to lowercase, strip whitespace
- Account numbers match exactly

### Step 2: Group Similar

Find candidate groups for LLM evaluation. Uses multiple signals to identify entities that *might* be the same.

```python
def group_similar(entities: List[dict]) -> List[ResolutionGroup]:
    """
    Find groups of entities that might be the same real-world entity.
    Uses multiple similarity signals.
    """
    groups = []

    # Signal 1: First-name match (Suresh + Suresh Kumar)
    first_name_groups = group_by_first_name(entities)
    for fn, group in first_name_groups.items():
        if len(group) > 1:
            groups.append(ResolutionGroup(
                entities=group,
                signal="first_name_match",
                description=f"Same first name: {fn}"
            ))

    # Signal 2: Partial name containment (Amit + Amit Sharma)
    for e1 in entities:
        for e2 in entities:
            if e1.id != e2.id and is_partial_name_match(e1.name, e2.name):
                groups.append(ResolutionGroup(
                    entities=[e1, e2],
                    signal="partial_name_match",
                    description=f"'{e1.name}' is partial of '{e2.name}'"
                ))

    # Signal 3: Shared phone
    phone_groups = group_by_shared_phone(entities)
    for phone, group in phone_groups.items():
        if len(group) > 1:
            groups.append(ResolutionGroup(
                entities=group,
                signal="shared_phone",
                description=f"Shared phone: {phone}"
            ))

    # Signal 4: Shared attributes
    attribute_groups = group_by_shared_attributes(entities)
    for attr_key, group in attribute_groups.items():
        if len(group) > 1:
            groups.append(ResolutionGroup(
                entities=group,
                signal="shared_attribute",
                description=f"Shared attribute: {attr_key}"
            ))

    # Deduplicate groups (same entity pair in multiple groups)
    return deduplicate_groups(groups)
```

**Grouping criteria:**
- First name match (after normalization)
- Partial name containment (Amit ⊂ Amit Sharma)
- Shared phone number
- Shared account number
- Attribute overlap > 50%

### Step 3: LLM Evaluate

Send each candidate group to the LLM for intelligent evaluation. This is where the heavy lifting happens.

```python
def llm_pass(groups: List[ResolutionGroup], ai_caller: AICaller) -> List[LLMVerdict]:
    """
    Send candidate groups to LLM for evaluation.
    LLM returns structured verdict with reasoning.
    """
    verdicts = []

    for group in groups:
        prompt = build_resolution_prompt(group)
        response = ai_caller.call(prompt, tier=ModelTier.BALANCED)
        verdict = parse_llm_verdict(response)
        verdicts.append(verdict)

    return verdicts
```

#### LLM Prompt Template

```
SYSTEM: You are an investigation entity resolver for Indian criminal
investigation data. Your job is to determine if groups of extracted
entities refer to the same real-world person or organization.

For each group, evaluate these 5 signals:
1. NAME_SIMILARITY: First name, last name, nicknames, handles
2. SHARED_ATTRIBUTES: Phones, accounts, addresses, IDs
3. CONTEXT_ALIGNMENT: Same case, same timeline, same location
4. CONTRADICTIONS: Conflicting attributes (different father, different age)
5. CULTURAL_KNOWLEDGE: Indian naming patterns, honorifics, surnames

IMPORTANT CULTURAL CONTEXT:
- "Kumar" is a common middle/surname often omitted in casual use
- "Bhai" is an honorific (like "brother"), not part of legal name
- "Ji" is a respectful suffix, not part of legal name
- Social media handles (rakesh_rocky) map to real names
- "Electronics", "Office", "Store" in a name → organization, not person
- Father's name conflict → likely different people with same name
- Same phone number → very strong merge signal (possible dual SIM)

RULES:
- If confidence > 0.9 → merge_type: "auto"
- If confidence 0.7-0.9 → merge_type: "review"
- If confidence < 0.7 → merge_type: "reject"
- If father names conflict → merge_type: "reject" regardless of name match
- Never merge organizations with persons

INPUT: Group of entities with their attributes.

OUTPUT: JSON with verdict for each group.

Example output:
{
  "groups": [
    {
      "entity_ids": ["PERSON_bac015e7", "PERSON_773b8a4b"],
      "merge": true,
      "confidence": 0.92,
      "canonical_name": "Suresh Kumar",
      "reasoning": "First name 'Suresh' matches. 'Kumar' is a common surname often omitted. Same phone 9123456789 appears in both sources. Same case context.",
      "signals": {
        "name_similarity": 0.80,
        "shared_attributes": 1.00,
        "context_alignment": 0.90,
        "contradictions": 1.00,
        "cultural_knowledge": 0.95
      },
      "merge_type": "auto",
      "contradictions": []
    }
  ]
}
```

#### Multi-Signal Scoring

```
Signal 1: NAME_SIMILARITY (0.0 - 1.0)
  1.0 = exact match
  0.8 = first name match, last name unknown
  0.6 = partial match (Amit ⊂ Amit Sharma)
  0.3 = similar but different (Rakesh vs Rajesh)
  0.0 = completely different

Signal 2: SHARED_ATTRIBUTES (0.0 - 1.0)
  1.0 = exact phone + account match
  0.8 = exact phone match
  0.6 = shared location or other attribute
  0.3 = some attribute overlap
  0.0 = no shared attributes

Signal 3: CONTEXT_ALIGNMENT (0.0 - 1.0)
  1.0 = same case, same timeline, same location
  0.7 = same case, different timeline
  0.4 = same location, different case
  0.0 = no context overlap

Signal 4: CONTRADICTIONS (0.0 - 1.0)
  1.0 = no contradictions
  0.5 = minor contradictions (e.g., age off by 2 years)
  0.0 = major contradictions (e.g., different father name)

Signal 5: CULTURAL_KNOWLEDGE (0.0 - 1.0)
  0.95 = known pattern (Kumar dropped, Bhai honorific)
  0.70 = plausible pattern
  0.30 = unusual but possible
  0.0 = contradicts cultural norms

combined = weighted_average(signals, weights=[0.25, 0.30, 0.15, 0.15, 0.15])
```

### Step 4: Cross-Signal Validate

Validate LLM verdicts against rule-based findings. Resolve conflicts.

```python
def cross_signal_validate(
    verdicts: List[LLMVerdict],
    rule_merges: List[MergeCandidate]
) -> List[ValidatedMerge]:
    """
    Validate LLM verdicts against rule-based matches.
    Assign final confidence based on agreement.
    """
    validated = []

    for verdict in verdicts:
        rule_match = find_rule_match(verdict.entity_ids, rule_merges)

        if verdict.merge and rule_match:
            # LLM and rules agree → high confidence
            final_confidence = min(verdict.confidence * 1.05, 1.0)
            merge_type = "auto"

        elif verdict.merge and not rule_match:
            # LLM says merge, rules didn't catch it → medium confidence
            final_confidence = verdict.confidence * 0.95
            merge_type = verdict.merge_type

        elif not verdict.merge and rule_match:
            # Conflict: rules say merge, LLM says no → flag for review
            final_confidence = verdict.confidence
            merge_type = "review"

        else:
            # Both say no merge
            final_confidence = verdict.confidence
            merge_type = "reject"

        validated.append(ValidatedMerge(
            entity_ids=verdict.entity_ids,
            merge=verdict.merge,
            confidence=final_confidence,
            canonical_name=verdict.canonical_name,
            merge_type=merge_type,
            reasoning=verdict.reasoning,
            signals=verdict.signals,
            llm_reasoning=verdict.reasoning,
            rule_match=rule_match is not None,
        ))

    return validated
```

### Step 5: Merge + Unknown + Contradiction

Create final output structures with identity uncertainty propagation.

#### Merge Logic (with Identity Uncertainty Propagation)

```python
def merge_entities(
    validated_merges: List[ValidatedMerge],
    entities: Dict[str, dict]
) -> Tuple[List[ResolvedEntity], List[Contradiction]]:
    """
    Create ResolvedEntities from validated merges.
    Implements identity uncertainty propagation:
    effective_confidence = merge_confidence × source_identity_confidence
    """
    resolved = []
    contradictions = []
    merged_ids = set()

    for merge in validated_merges:
        if not merge.merge:
            continue

        # Collect all source entities
        source_entities = [entities[eid] for eid in merge.entity_ids]

        # Detect contradictions (full taxonomy)
        merge_contradictions = detect_contradictions(source_entities)
        contradictions.extend(merge_contradictions)

        # Merge attributes
        merged_attributes = merge_attributes(source_entities)

        # Calculate effective_confidence (identity uncertainty propagation)
        source_identity_confs = []
        for se in source_entities:
            conf = se.get("confidence", {})
            if isinstance(conf, dict):
                source_identity_confs.append(conf.get("source_reliability", 0.5))
        avg_identity_conf = sum(source_identity_confs) / len(source_identity_confs) if source_identity_confs else 0.5
        effective_confidence = merge.confidence * avg_identity_conf

        # Build provenance chain
        provenance_chain = []
        for se in source_entities:
            source_file = se.get("source", {}).get("file_name", "")
            if source_file and source_file not in provenance_chain:
                provenance_chain.append(source_file)

        # Create resolved entity
        res_id = generate_id("RES", merge.canonical_name)
        resolved.append(ResolvedEntity(
            id=res_id,
            canonical_name=merge.canonical_name,
            aliases=collect_aliases(source_entities),
            entity_type=source_entities[0]["entity_type"],
            phones=collect_phones(source_entities),
            accounts=collect_accounts(source_entities),
            addresses=collect_addresses(source_entities),
            attributes=merged_attributes,
            merge_confidence=merge.confidence,
            merge_type=merge.merge_type,
            source_entities=merge.entity_ids,
            source_relations=find_relations_for(merge.entity_ids),
            llm_reasoning=merge.llm_reasoning,
            signals=merge.signals,
            contradictions=[c.id for c in merge_contradictions],
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
            epistemic_status="inference",  # Merged = inference
            derivation_depth=1,
            provenance_chain=provenance_chain,
            effective_confidence=effective_confidence,
        ))

        merged_ids.update(merge.entity_ids)

    return resolved, contradictions
```

#### Contradiction Detection (Full 8-Type Taxonomy)

```python
class ContradictionType(Enum):
    """Full contradiction taxonomy — per SYSTEM_STRUCTURE.md"""
    IDENTITY = "identity"           # Same person, different identity (phone, name, DOB conflict)
    TEMPORAL = "temporal"           # Conflicting timestamps
    LOCATION = "location"           # Conflicting locations/addresses
    ATTRIBUTION = "attribution"     # Different source claims different owner
    SOURCE_CONTENT = "source_content"  # Same fact described differently across sources
    EVENT_IDENTITY = "event_identity"  # Same event described as different events
    DERIVATION = "derivation"       # Derived claim contradicts its source observations
    UNKNOWN = "unknown"             # Cannot classify the contradiction type
```

### Detection Rules (Implemented)

| Type | What It Detects | Severity | Example |
|------|----------------|----------|---------|
| `identity` | Different phones for same entity | high | CDR says 9876543210, bank says 9988776655 |
| `identity` | Different names for same entity | medium | "Rakesh" vs "Rakesh Kumar" |
| `identity` | Different DOBs for same entity | high | DOB 1985-01-01 vs 1987-03-15 |
| `temporal` | Conflicting timestamps | medium | Event at 10:00 vs 14:00 |
| `location` | Different addresses/locations | medium | "Delhi" vs "Mumbai" |
| `attribution` | Different account numbers | high | Account 1234 vs 5678 |
| `source_content` | Different descriptions of same fact | low | "blue car" vs "red car" |
| `event_identity` | Same event described differently | medium | "robbery" vs "theft" |
| `derivation` | Derived contradicts source observations | low | Inference depth 0 vs 1 |
| `attribute` | Different father names | medium | Father: "Ram" vs "Shyam" |
| `role` | Same person, different role | medium | "accused" vs "witness" |

### Detection Code

```python
def detect_contradictions(entities: List[dict], run_id: str = "") -> List[Contradiction]:
    """
    Detect all 8 contradiction types — per SYSTEM_STRUCTURE.md taxonomy.
    """
    contradictions = []

    # 1. IDENTITY: phone, name, DOB conflicts
    phones = {e.get("attributes", {}).get("phone_number", "") for e in entities}
    phones.discard("")
    if len(phones) > 1:
        contradictions.append(Contradiction(type="identity", attribute="phone", ...))

    names = {e.get("name", "") for e in entities}
    if len(names) > 1:
        contradictions.append(Contradiction(type="identity", attribute="name", ...))

    dobs = {e.get("attributes", {}).get("dob", "") for e in entities}
    dobs.discard("")
    if len(dobs) > 1:
        contradictions.append(Contradiction(type="identity", attribute="dob", ...))

    # 2. TEMPORAL: conflicting timestamps
    timestamps = {str(e.get("attributes", {}).get("timestamp", "")) for e in entities}
    timestamps.discard("")
    if len(timestamps) > 1:
        contradictions.append(Contradiction(type="temporal", ...))

    # 3. LOCATION: conflicting addresses
    addresses = {e.get("attributes", {}).get("address", "") for e in entities}
    addresses.discard("")
    if len(addresses) > 1:
        contradictions.append(Contradiction(type="location", ...))

    # 4. ATTRIBUTION: different account numbers
    accounts = {e.get("attributes", {}).get("account_number", "") for e in entities}
    accounts.discard("")
    if len(accounts) > 1:
        contradictions.append(Contradiction(type="attribution", ...))

    # 5. SOURCE_CONTENT: different descriptions across sources
    # Compare unique_words ratio across source descriptions
    # If avg_len > 3 and unique_words > avg_len × 1.5 → flag

    # 6. EVENT_IDENTITY: same event described differently
    # If entity_type == EVENT and multiple different descriptions → flag

    # 7. DERIVATION: derived contradicts source observations
    # If derivation_depth varies (0 vs 1) within same group → flag

    # 8. UNKNOWN: catch-all for unclassifiable contradictions

    # Additional: father name conflicts (attribute type)
    # Additional: role conflicts (role type)

    return contradictions
```

### Current Demo Data Results

| Type | Count | Example |
|------|-------|---------|
| `identity` | 20 | Phone/name/DOB conflicts across merged entities |
| `event_identity` | 2 | Same event described differently |
| `attribution` | 1 | Different account owners |
| `source_content` | 1 | Different descriptions of same fact |
| **Total** | **24** | |

#### Unknown Entity Creation

```python
def create_unknown_entities(
    entities: Dict[str, dict],
    merged_ids: set
) -> List[UnknownEntity]:
    """
    Create UnknownEntity nodes for entities that couldn't be resolved.
    """
    unknowns = []

    for eid, entity in entities.items():
        if eid in merged_ids:
            continue

        # Check if entity is truly unknown or just unmerged
        if is_unknown_entity(entity):
            unknowns.append(UnknownEntity(
                id=generate_id("UNK", eid),
                description=entity["name"],
                entity_type=entity["entity_type"],
                source_entity=eid,
                attributes=entity.get("attributes", {}),
                possible_matches=find_possible_matches(entity, entities, merged_ids),
                confidence=entity.get("confidence", {}).get("score", 0.0),
            ))

    return unknowns
```

---

## Resolution History Tracking

Every resolution decision is tracked in `resolution_history.json` for full audit trail.

### ResolutionHistory Model

```python
@dataclass
class ResolutionHistory:
    entity_id: str              # "RES_3ddb159f5e7dacfa"
    resolution_type: str        # "merge", "split", "reject", "unknown"
    merged_with: List[str]      # ["PERSON_bac015e7", "PERSON_773b8a4b"]
    confidence: float           # 0.92
    method: str                 # "rule", "phonetic", "fuzzy", "multi_signal", "llm"
    signals: dict               # {"name_similarity": 0.8, "phone_match": 1.0, ...}
    timestamp: str              # "2026-08-29T15:23:37"
    run_id: str                 # "run_20260829_152337"
    previous_state: str         # What the entity was before this resolution
```

### What Gets Tracked

| Event | resolution_type | When |
|-------|----------------|------|
| Entities merged | `merge` | After union-find grouping + LLM/rule approval |
| Merge rejected | `reject` | LLM or rules say don't merge |
| Entity split | `split` | Manual or correction (future) |
| Standalone entity | `single` | No merge candidates found |

### Output Format (resolution_history.json)

```json
{
  "RES_3ddb159f5e7dacfa": {
    "entity_id": "RES_3ddb159f5e7dacfa",
    "resolution_type": "merge",
    "merged_with": ["PERSON_bac015e7", "PERSON_773b8a4b"],
    "confidence": 1.0,
    "method": "llm",
    "signals": {"method": "llm", "rule_based": 1.0},
    "timestamp": "2026-08-29T15:23:37",
    "run_id": "run_20260829_152337",
    "previous_state": "['PERSON_bac015e7', 'PERSON_773b8a4b']"
  }
}
```

### Current Results
- **19 resolution history entries** tracked
- Methods: `llm` (LLM-evaluated), `rule` (rule-based), `phonetic`, `fuzzy`, `multi_signal`

---

## Role Consolidation

When the same person appears across multiple FIRs or evidence sources, their role is consolidated.

### Logic

```python
def consolidate_roles(resolved_entities: List[ResolvedEntity]) -> Dict[str, str]:
    """
    Role consolidation — when same person appears across multiple FIRs,
    consolidate their roles. Per docs: accused in multiple FIRs stays accused.
    """
    role_counts: Dict[str, Dict[str, int]] = {}  # canonical_name → {role: count}
    for r in resolved_entities:
        name = r.canonical_name
        role = r.attributes.get("role", "")
        if role:
            role_counts[name][role] = role_counts[name].get(role, 0) + 1

    consolidated = {}
    for name, roles in role_counts.items():
        # Pick role with highest count; tie-break: accused > complainant > witness > victim
        priority = {"accused": 3, "complainant": 2, "witness": 1, "victim": 0}
        best_role = max(roles.keys(), key=lambda r: (roles[r], priority.get(r, -1)))
        consolidated[name] = best_role
        # Set back on resolved entities
        for r in resolved_entities:
            if r.canonical_name == name:
                r.attributes["consolidated_role"] = best_role
                r.attributes["role_source_count"] = roles[best_role]

    return consolidated
```

### Role Priority (Tie-Breaking)
1. `accused` (priority 3) — Most serious, stays if majority
2. `complainant` (priority 2)
3. `witness` (priority 1)
4. `victim` (priority 0)

### Example
```
Rakesh appears in:
  - FIR_001: role = "accused" (from source 1)
  - FIR_002: role = "accused" (from source 2)
  - Witness statement: role = "witness" (from source 3)

Consolidated role: "accused" (count=2, highest priority)
```

---

## 6. Output Formats

### resolved_entities.json

```json
{
  "RES_suresh_kumar": {
    "id": "RES_suresh_kumar",
    "canonical_name": "Suresh Kumar",
    "aliases": ["Suresh"],
    "entity_type": "PERSON",
    "phones": ["9123456789"],
    "accounts": ["1235"],
    "addresses": [],
    "attributes": {
      "account_holder": "Suresh Kumar",
      "account_number": "12345678901235"
    },
    "merge_confidence": 0.92,
    "merge_type": "auto",
    "source_entities": ["PERSON_bac015e7", "PERSON_773b8a4b"],
    "source_relations": ["REL_...", "REL_..."],
    "llm_reasoning": "First name 'Suresh' matches. 'Kumar' is a common surname often omitted. Same phone 9123456789 appears in CDR and bank records.",
    "signals": {
      "name_similarity": 0.80,
      "shared_attributes": 1.00,
      "context_alignment": 0.90,
      "contradictions": 1.00,
      "cultural_knowledge": 0.95
    },
    "contradictions": [],
    "created_at": "2026-08-27T20:30:00",
    "updated_at": "2026-08-27T20:30:00"
  }
}
```

### unknown_entities.json

```json
{
  "UNK_001": {
    "id": "UNK_001",
    "description": "Unknown (caller claimed to be from SBI)",
    "entity_type": "PERSON",
    "source_entity": "PERSON_a5bfa34d",
    "attributes": {
      "mentioned_in_fir": true,
      "claimed_affiliation": "SBI"
    },
    "possible_matches": [],
    "confidence": 0.3
  }
}
```

### contradictions.json

```json
{
  "CON_001": {
    "id": "CON_001",
    "type": "identity",
    "entity_ids": ["PERSON_xxx", "PERSON_yyy"],
    "attribute": "phone",
    "values": ["9111223344", "9999888877"],
    "sources": ["02_CDR_Rakesh.csv", "09_Social_Amit.json"],
    "severity": "high",
    "resolved": false,
    "resolution_note": "",
    "run_id": "run_20260829_152337"
  }
}
```

### resolution_history.json

```json
{
  "RES_3ddb159f5e7dacfa": {
    "entity_id": "RES_3ddb159f5e7dacfa",
    "resolution_type": "merge",
    "merged_with": ["PERSON_bac015e7", "PERSON_773b8a4b"],
    "confidence": 1.0,
    "method": "llm",
    "signals": {"method": "llm"},
    "timestamp": "2026-08-29T15:23:37",
    "run_id": "run_20260829_152337",
    "previous_state": "['PERSON_bac015e7', 'PERSON_773b8a4b']"
  }
}
```

### resolution_log.json

```json
{
  "run_id": "run_20260829_152337",
  "pipeline_resolution_run_id": "res_20260829_152337",
  "timestamp": "2026-08-29T15:23:37",
  "input_entities": 152,
  "fuzzy_index_size": 152,
  "phonetic_candidates": 9,
  "fuzzy_index_candidates": 442,
  "disambiguated_pairs": 215,
  "auto_merges": 93,
  "review_required": 87,
  "llm_evaluated_groups": 215,
  "llm_merges": 0,
  "rejected": 0,
  "resolved_entities": 67,
  "unknown_entities": 0,
  "contradictions": 24,
  "contradictions_flagged": 24,
  "resolution_history_entries": 19,
  "graph_nodes": 102,
  "graph_edges": 195,
  "graph_node_types": {"Phone": 12, "Person": 27, "Location": 26, ...},
  "graph_edge_types": {"PhysicalProximity": 87, "Call": 81, ...},
  "processing_time_seconds": 0.16
}
```

---

## 7. Confidence Propagation

Entity resolution confidence propagates to all downstream stages.

### Propagation Formula

```
For each relation involving a resolved entity:
  effective_confidence = relation.confidence × entity.merge_confidence

For each hypothesis involving a resolved entity:
  effective_confidence = hypothesis.confidence × entity.merge_confidence
```

### Thresholds

```
merge_confidence > 0.90:
  → Auto-merge
  → Downstream: full confidence propagation
  → Investigator sees: "Merged with high confidence"

merge_confidence 0.70 - 0.90:
  → Flag for review
  → Downstream: reduced confidence propagation
  → Investigator sees: "Merged, pending review"

merge_confidence < 0.70:
  → Keep separate
  → Downstream: no propagation
  → Investigator sees: "Possible match, not merged"
```

### Failure Mode Guard

```
IF entity_resolution_confidence < 0.90 AND entity is involved in
high-impact inference:
  → Hypothesis MUST note identity uncertainty
  → Hypothesis MUST report identity impact
  → Investigator MUST see: "This conclusion depends on identity resolution"

IF entity_resolution_confidence < 0.70:
  → High-impact inferences MUST NOT be treated as established
  → System MUST flag: "Identity resolution uncertain, conclusions preliminary"
```

---

## 8. How Stage 3 Feeds Into Later Stages

### Stage 4 (Temporal)
- Reads: `resolved_entities.json`
- Uses: canonical IDs for timeline construction
- Tracks: temporal coverage per resolved entity

### Stage 5 (Graph Build)
- Reads: `resolved_entities.json`, `resolved_relations.json`
- Uses: canonical IDs for edge creation
- Creates: EvidenceEdge with `RES_*` source/target IDs

### Stage 6 (Analytics)
- Reads: resolved graph
- Uses: canonical IDs for community detection
- Detects: patterns on deduplicated graph

### Stage 7 (Hypothesis)
- Reads: `resolved_entities.json`, `contradictions.json`
- Uses: resolved entities for hypothesis generation
- Notes: identity uncertainty in hypothesis confidence

### Stage 8 (Contradiction)
- Reads: `contradictions.json`
- Uses: pre-flagged contradictions from resolution
- Performs: deeper contradiction analysis

### Stage 9 (Gap Detection)
- Reads: resolved entities + relations
- Identifies: missing evidence for resolved entities
- Prioritizes: investigative actions

### Stage 10 (Critic)
- Reads: `resolved_entities.json`, `contradictions.json`, `resolution_log.json`
- Audits: resolution quality, merge confidence, contradiction handling
- Checks: for overconfidence in merges

---

## 9. Code Structure

```
system/src/resolution/
├── __init__.py           # exports
├── engine.py             # ResolutionEngine orchestrator (10-step pipeline, takes case_id)
├── rule_pass.py          # RulePass: fast exact matching (case-scoped)
├── group.py              # GroupFinder: candidate group detection
├── llm_pass.py           # LLMPass: LLM evaluation
├── cross_signal.py       # CrossSignalValidator: validate LLM vs rules
├── merger.py             # EntityMerger: create ResolvedEntities + contradictions + resolution_history + role consolidation
├── unknown.py            # UnknownCreator: create UnknownEntities
├── contradictions.py     # ContradictionDetector: detect conflicts (8 types)
├── phonetic.py           # Phonetic matching (Soundex + Metaphone + Indian transliteration, 50+ variants)
├── fuzzy_index.py        # Inverted index + Trie autocomplete + edit-distance ~ operator
├── disambiguator.py      # MultiSignalDisambiguator (phone, vehicle, DOB, location, case overlap)
├── candidate_formatter.py # Ranked "Did you mean..." + confirmation gate (never silently auto-correct)
└── graph_schema.py       # KnowledgeGraph (8 node types, 7 edge types)
```

### Key Functions (all take `case_id`)

- `ResolutionEngine.resolve(case_id, entities, relations)` — Run full 10-step resolution pipeline for a case
- `rule_pass(case_id, entities)` — Fast exact matching scoped to a case
- `group_similar(case_id, entities)` — Find candidate groups for LLM evaluation
- `llm_pass(case_id, groups, ai_caller)` — LLM evaluation of candidate groups
- `cross_signal_validate()` — Validate LLM verdicts against rules
- `merge_entities()` — Create ResolvedEntities with identity uncertainty propagation
- `detect_contradictions()` — Detect all 8 contradiction types

### New Files Added

| File | Purpose |
|------|---------|
| `phonetic.py` | Soundex + Metaphone + Indian name transliteration (50+ variants: Kumar/Kummar/Kommar, Singh/Sing/Singh) |
| `fuzzy_index.py` | Inverted index for ~ operator search, Trie for prefix autocomplete |
| `disambiguator.py` | Multi-signal: phone match, vehicle overlap, DOB match, location overlap, case overlap |
| `candidate_formatter.py` | Formats "Did you mean...?" with ranked candidates + confirmation gate |
| `graph_schema.py` | KnowledgeGraph: 8 node types (Person, Phone, Vehicle, Location, Organization, BankAccount, Case, PoliceStation), 7 edge types (Call, Transaction, CoOccurrence, FamilyOrAssociate, Ownership, Communication, PhysicalProximity) |

### Modified Files

```
system/src/models/schema.py   # ResolvedEntity, UnknownEntity, Contradiction, ResolutionHistory, DataQualityScore, AdversarialCheck
system/src/pipeline.py         # Step 3: Resolution, audit trail at every stage
system/run.py                  # --input, --output, --use-llm flags
```

### New CLI Commands

```bash
# Integrated into pipeline
python run.py --input ../demo_data --output output     # Full pipeline (no LLM)
python run.py --input ../demo_data --output output --use-llm  # With LLM
python run.py --input ../demo_data --output output --incremental  # Only new files
```

---

## 10. LLM Call Points

| Call | Tier | Purpose | Input | Output |
|------|------|---------|-------|--------|
| `llm_pass` | BALANCED | Evaluate entity groups | Group of entities + attributes | Merge verdict + reasoning |

**Total LLM calls per run:** ~4-6 (one per candidate group)
**Estimated tokens:** ~300 per call = ~1800 total
**Estimated time:** ~2-3 seconds with Groq

---

## 11. Policy Thresholds

```yaml
entity_resolution:
  auto_merge_confidence: 0.90
  flag_for_review: 0.70
  keep_separate: 0.00

  grouping:
    min_first_name_similarity: 0.80
    min_attribute_overlap: 0.50
    max_group_size: 10

  contradictions:
    critical_threshold: 0.80
    major_threshold: 0.60
    minor_threshold: 0.40

  llm:
    tier: "BALANCED"
    temperature: 0.1
    max_retries: 2
```

---

## 12. Testing Plan

### Unit Tests

1. **Rule Pass Tests**
   - Exact phone match → auto-merge
   - Exact name match → auto-merge
   - No match → no merge

2. **Group Finder Tests**
   - First name match → grouped
   - Partial name → grouped
   - No similarity → not grouped

3. **Contradiction Detection Tests**
   - Same phone, different father → contradiction
   - Same name, different phone → no contradiction (different people can share names)
   - No conflicts → no contradiction

### Integration Tests

1. **Full Pipeline Test**
   - Run Steps 1-3 on demo data
   - Verify: 53 entities → ~48 resolved + 1 unknown
   - Verify: Suresh ↔ Suresh Kumar merged
   - Verify: Amit Sharma ↔ Amit Bhai merged
   - Verify: Priya ↔ Priya Mehta merged

2. **LLM Verdict Tests**
   - Verify LLM returns valid JSON
   - Verify confidence scores are 0.0-1.0
   - Verify merge_type is auto/review/reject

---

## 13. Known Resolution Targets (Demo Data)

| Entity A | Entity B | Signal | Expected Confidence | Expected Canonical |
|----------|----------|--------|---------------------|-------------------|
| `Suresh` | `Suresh Kumar` | first_name + phone | 0.92 | Suresh Kumar |
| `Amit Sharma` | `Amit Bhai` | nickname (Bhai) | 0.85 | Amit Sharma |
| `Amit Sharma` (caed6d23) | `Amit Sharma` (10f7b52d) | exact_name | 0.95 | Amit Sharma |
| `Priya` | `Priya Mehta` | partial_name | 0.78 | Priya Mehta |
| `rakesh_rocky` | `Rakesh Kumar` | social_handle | 0.80 | Rakesh Kumar |
| `Unknown (SBI caller)` | — | — | — | UnknownEntity |

---

## 14. Success Criteria

1. **Accuracy:** All known resolution targets correctly merged
2. **No false merges:** Organizations not merged with persons
3. **Contradictions detected:** All 8 contradiction types flagged (24 total in demo)
4. **Unknown preserved:** Unresolved entities kept as UnknownEntity nodes
5. **Confidence propagated:** effective_confidence = merge_conf × avg_identity_conf
6. **Audit trail:** Every merge has LLM reasoning + signal scores + resolution history
7. **Role consolidation:** Same person across FIRs gets consolidated role
8. **Performance:** Resolution completes in < 1 second without LLM (0.16s measured)
9. **Knowledge graph:** 8 node types, 7 edge types, 102 nodes, 195 edges
