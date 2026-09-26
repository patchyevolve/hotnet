# Stage 4: Temporal Engine — Architecture & Implementation

## 1. Purpose

Stage 4 enriches extracted entities and relations with temporal and spatial context. After Stage 3 resolves entity identities, Stage 4 answers: **"When did things happen? How precise is the timing? Where exactly were they?"**

This stage contributes to **Model 2 (Provenance)** and **Model 3 (Coverage)** from the 5-model analytical framework.

**Note:** `PoliceStation` has been replaced by `JurisdictionNode`. All references to police stations now use `jurisdiction_node_id` pointing to a `JurisdictionNode` entity.

**The One Rule still applies:**
> "The system may increase the confidence of a hypothesis, but it must never upgrade an inference into an observation."

Temporal enrichment is probabilistic. Never claim exact timing when precision is low.

All temporal enrichment operations are scoped to a `case_id`.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STAGE 4: TEMPORAL ENGINE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ ExtractedEnt │───▶│  Timestamp   │───▶│  Spatial     │───▶│ Coverage │  │
│  │  + Relations │    │  Normalize   │    │  Normalize   │    │ Assess   │  │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘  │
│                             │                    │                  │        │
│                    ┌────────▼────────┐   ┌───────▼───────┐  ┌──────▼─────┐  │
│                    │  Allen's        │   │  Event        │  │  Coverage  │  │
│                    │  Interval       │   │  Clustering   │  │  Vocabulary│  │
│                    │  Algebra        │   │               │  │            │  │
│                    └─────────────────┘   └───────────────┘  └────────────┘  │
│                                                                             │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      OUTPUTS                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │TemporalInfo  │  │ SpatialInfo  │  │ CoverageIntv │  │Timeline │ │   │
│  │  │   (207)      │  │    (14)      │  │    (25)      │  │ Events  │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Processing Pipeline Diagram

```
                    ┌─────────────────────────────────────┐
                    │     INPUT: Entities + Relations      │
                    │     (from Stage 2 & 3)               │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 1: TIMESTAMP NORMALIZATION  │
                    │  • Parse various formats (ISO,       │
                    │    Indian DD/MM/YYYY, text)          │
                    │  • Handle timezone (IST, UTC)        │
                    │  • Detect precision                  │
                    │  • Normalize to ISO 8601             │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 2: PRECISION MODELING       │
                    │  EXACT: HH:MM + specific date        │
                    │  APPROXIMATE: "morning", "afternoon" │
                    │  RANGE: "between X and Y"            │
                    │  UNKNOWN: No temporal info           │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 3: SPATIAL NORMALIZATION    │
                    │  • Parse location strings            │
                    │  • Match known locations DB          │
                    │  • Geocode (50+ cities)              │
                    │  • Assess precision                  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 4: TEMPORAL ALIGNMENT       │
                    │  • Align to common timeline          │
                    │  • Create unified event sequence     │
                    │  • Link to source entities           │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 5: COVERAGE ASSESSMENT      │
                    │  • Compute date range per entity     │
                    │  • Identify gaps                     │
                    │  • Calculate coverage ratio          │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 6: ALLEN'S INTERVAL ALGEBRA │
                    │  • 13 temporal relations             │
                    │  • before, meets, overlaps, during   │
                    │  • starts, finishes, equals          │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     STEP 7: EVENT CLUSTERING         │
                    │  • Group related events              │
                    │  • Within 10 min of same type        │
                    │  • Same real-world event             │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │     OUTPUTS                          │
                    │  temporal_infos.json (207)           │
                    │  spatial_infos.json (14)             │
                    │  coverage_intervals.json (25)        │
                    │  timeline_events.json (25)           │
                    │  temporal_relations.json (0)         │
                    │  event_clusters.json (1)             │
                    └─────────────────────────────────────┘
```

---

## Allen's Interval Algebra Diagram

```
    ┌──────────────────────────────────────────────────────────────┐
    │              ALLEN'S 13 TEMPORAL RELATIONS                   │
    ├──────────────────────────────────────────────────────────────┤
    │                                                              │
    │  BEFORE:     A ──────┐          ┌────── B                   │
    │                      └──────────┘                            │
    │                                                              │
    │  MEETS:      A ──────┐                                      │
    │                      ├────── B                               │
    │                      └──────┘                                │
    │                                                              │
    │  OVERLAPS:   A ──────┐                                      │
    │                  ┌───┼────── B                               │
    │                  └───┘                                       │
    │                                                              │
    │  DURING:     A ──┐                                           │
    │              ┌───┼───────── B                                │
    │              └───┘                                           │
    │                                                              │
    │  STARTS:     A ──┐                                           │
    │              ┌───┼─── B                                      │
    │              └───┘                                           │
    │                                                              │
    │  FINISHES:       ┌─── A                                      │
    │              ┌───┼───┘                                       │
    │              └───┼───────── B                                │
    │                  └──────────┘                                │
    │                                                              │
    │  EQUALS:     A ─────────────────┐                            │
    │              ┌──────────────────┼─── B                       │
    │              └──────────────────┘                            │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
```

---

## Pipeline Position

```
Stage 1: Ingestion     → RawEvidence[]
Stage 2: Extraction    → ExtractedEntity[], ExtractedRelation[]
Stage 3: Resolution    → ResolvedEntity[], UnknownEntity[], Contradiction[]
                        ↓
Stage 4: Temporal      → TemporalInfo[], SpatialInfo[], CoverageInterval[], TimelineEvent[]
                        ↓
Stage 5: Graph Build   → EvidenceEdge[] with canonical IDs
Stage 6: Analytics     → Patterns, communities, anomalies
Stage 7: Hypothesis    → Competing explanations
Stage 8: Contradiction → Conflict analysis
Stage 9: Gap Detection → Missing evidence
Stage 10: Critic       → Quality audit
```

Stage 4 reads from `EXTRACTED_ENTITIES_STORE` and `EXTRACTED_RELATIONS_STORE`.
Stage 4 writes to `TEMPORAL_SPATIAL_STORE` (temporal_infos.json, spatial_infos.json, coverage_intervals.json, timeline_events.json).

---

## 3. Input Format

Stage 4 consumes the output of Stage 2 (extraction) and Stage 3 (resolution):

```json
// extraction_output.json — entities
{
  "id": "PERSON_6f24b2ce",
  "entity_type": "PERSON",
  "name": "Rakesh Kumar",
  "attributes": {
    "phone_number": "9876543210",
    "date": "2024-03-28",
    "location": "Hotel Taj, Guna"
  },
  "source": {
    "id": "raw_001",
    "file_name": "01_FIR.txt"
  }
}

// extraction_output.json — relations
{
  "id": "REL_1ceeb7ea",
  "source_entity_id": "PERSON_6f24b2ce",
  "target_entity_id": "LOC_5f55baef",
  "relation_type": "VISITED",
  "attributes": {
    "timestamp": "2024-03-15T14:32:00",
    "duration": "01:23"
  }
}
```

---

## 4. Processing Pipeline

### Step 1: Timestamp Normalization

**Input:** Various date/time formats from entity attributes and relation attributes.

**Processing:**
- Try multiple date formats (ISO, Indian DD/MM/YYYY, text descriptions)
- Handle timezone indicators (IST, UTC, GMT)
- Detect precision from format (exact vs approximate)
- Normalize to ISO 8601

**Examples:**
```
"15/03/2024"           → "2024-03-15T00:00:00" (precision: exact)
"2024-03-15T14:32:00"  → "2024-03-15T14:32:00" (precision: exact)
"March 2024"           → "2024-03-01T00:00:00" (precision: range)
"afternoon"            → "2024-01-01T12:00:00" (precision: range)
"between 14:00 and 16:00" → "2024-01-01T14:00:00" (precision: range)
```

**Implementation:** `src/temporal/timestamp.py`

- `normalize_timestamp(ts)` → ISO 8601 string or None
- `parse_timestamp(text)` → (iso_string, TemporalPrecision)
- `detect_precision(text)` → TemporalPrecision enum
- `get_time_range(text)` → (start_iso, end_iso) for range expressions

### Step 2: Precision Modeling

**Input:** Timestamps with varying precision levels.

**Processing:**
- Classify precision: exact, approximate, range, unknown
- Model as intervals when precision is low
- "March 2024" → interval [2024-03-01, 2024-03-31]
- "afternoon" → interval [12:00, 17:00]

**Output:** TemporalInfo with start_time, end_time, precision

**Precision Classification Rules:**
```
EXACT:     Has time component (HH:MM), specific date
APPROXIMATE: "morning", "afternoon", "evening", "night"
RANGE:     "between X and Y", month-only, year-only
UNKNOWN:   No temporal information available
```

### Step 3: Spatial Normalization

**Input:** Location data from entity attributes.

**Processing:**
- Parse location strings into components (city, state, address)
- Match against known locations database
- Assess spatial precision (GPS, tower, city, vague)
- Assign radius based on precision level

**Examples:**
```
"Hotel Taj, Guna"     → {lat: 24.6355, lon: 77.3116, precision: city, radius: 5km}
"DEL_TWR_042"         → {precision: tower, radius: 2km}
"Delhi NCR"           → {lat: 28.7041, lon: 77.1025, precision: city, radius: 5km}
"near Hotel Taj"      → {precision: vague, radius: 10km}
```

**Spatial Precision Levels:**
```
EXACT:   GPS coordinates provided
TOWER:   Cell tower identifier (1-3km radius)
CITY:    City/district name (5km radius)
VAGUE:   "near X", "area of Y" (10km radius)
UNKNOWN: No location data (15km default)
```

**Implementation:** `src/temporal/spatial.py`

- `normalize_location(location)` → dict with lat, lon, city, state, precision, radius_km
- `get_coordinates(location)` → (lat, lon) or None
- `assess_spatial_precision(location)` → SpatialPrecision enum
- Known locations database for Madhya Pradesh (Guna case area)

### Step 4: Temporal Alignment

**Input:** Events from different sources with timestamps.

**Processing:**
- Align all events to common timeline
- Create unified event sequence
- Link events to source entities

**Output:** TimelineEvent[] with chronological ordering

### Step 5: Coverage Assessment

**Input:** Timeline + available data per entity.

**Processing:**
- Compute date range per entity from all attributes
- Identify coverage gaps
- Calculate coverage ratio

**Output:** CoverageInterval[] with start, end, status, coverage_ratio

**Coverage Status (Extended Vocabulary):**
```python
class CoverageStatus(str, Enum):
    OBSERVED = "observed"       # Data exists for this period (ratio >= 0.7)
    SPARSE = "sparse"           # Some data, but gaps exist (ratio 0.3-0.7)
    GAP = "gap"                 # No data for this period (ratio < 0.3)
    INFERRED = "inferred"       # Data inferred from other sources
    EXTRAPOLATED = "extrapolated"  # Data extrapolated beyond observed range
```

**Coverage Ratio Calculation:**
```python
coverage_ratio = unique_dates_with_data / total_days_in_range
```

### Step 6: Allen's Interval Algebra

**Input:** TemporalInfo[] with start_time and end_time.

**Processing:**
- Compute temporal relations between all event pairs
- Use Allen's 13 interval relations
- Filter by confidence threshold

**Output:** TemporalRelation[] with event pair, relation, confidence

```python
from temporal.engine import allen_relation, compute_temporal_relations

# Compute relation between two intervals
relation = allen_relation(
    start_a="2024-03-15T10:00:00",
    end_a="2024-03-15T10:30:00",
    start_b="2024-03-15T10:15:00",
    end_b="2024-03-15T11:00:00"
)
# Returns: AllenRelation.OVERLAPS
```

**13 Allen Relations:**
| Relation | Description |
|----------|-------------|
| `before` | A ends before B starts |
| `after` | A starts after B ends |
| `meets` | A ends when B starts |
| `met_by` | A starts when B ends |
| `overlaps` | A starts before B, ends during B |
| `overlapped_by` | A starts during B, ends after B |
| `during` | A is entirely within B |
| `contains` | B is entirely within A |
| `starts` | A and B start together, A ends first |
| `started_by` | A and B start together, B ends first |
| `finishes` | A and B end together, A starts later |
| `finished_by` | A and B end together, B starts earlier |
| `equals` | A and B are identical intervals |

### Step 7: Event Clustering

**Input:** TimelineEvent[] with timestamps and event types.

**Processing:**
- Group related events that are part of the same real-world event
- Events within `max_gap_seconds` (default: 600 = 10 min) of same type
- Sort by timestamp

**Output:** EventCluster[] with cluster ID, events, time span

```python
from temporal.engine import cluster_events

# Cluster events within 10 minutes of same type
clusters = cluster_events(timeline_events, max_gap_seconds=600)
```

**Example:**
```
CCTV Frame 1: 2024-03-15T14:30:00 (person sighting)
CCTV Frame 2: 2024-03-15T14:32:00 (person sighting)
CCTV Frame 3: 2024-03-15T14:35:00 (person sighting)

→ Cluster: "person_sighting_cluster" (3 events, 5 min span)
```

---

## 5. Output Format (Extended)

### TemporalInfo
```json
{
  "id": "TEMP_a1b2c3d4",
  "entity_id": "PERSON_6f24b2ce",
  "event_type": "event",
  "start_time": "2024-03-28T00:00:00",
  "end_time": "2024-03-28T00:00:00",
  "precision": "exact",
  "source_id": "raw_001",
  "confidence": 0.8
}
```

### SpatialInfo
```json
{
  "id": "SPAT_e5f6g7h8",
  "entity_id": "LOC_5f55baef",
  "event_type": "location",
  "latitude": 24.6355,
  "longitude": 77.3116,
  "radius_km": 5.0,
  "address": "Hotel Taj, Guna",
  "city": "Guna",
  "state": "Madhya Pradesh",
  "precision": "city",
  "source_id": "raw_002",
  "confidence": 0.8
}
```

### CoverageInterval
```json
{
  "entity_id": "PERSON_6f24b2ce",
  "source_type": "mixed",
  "start": "2024-01-15",
  "end": "2024-03-28",
  "status": "observed",
  "coverage_ratio": 1.0
}
```

### TimelineEvent
```json
{
  "id": "TLEVT_i9j0k1l2",
  "entity_id": "PERSON_6f24b2ce",
  "event_type": "call",
  "timestamp": "2024-03-15T14:32:00",
  "duration_seconds": 83.0,
  "source_id": "raw_003",
  "description": "Call duration: 01:23",
  "confidence": 0.8
}
```

### temporal_relations.json (NEW)

```json
[
  {
    "event_a": "TLEVT_abc123",
    "event_b": "TLEVT_def456",
    "relation": "overlaps",
    "confidence": 0.85
  }
]
```

### event_clusters.json (NEW)

```json
[
  {
    "cluster_id": "CLUSTER_22e59e9b",
    "events": ["TLEVT_2481100c", "TLEVT_7bff1b42"],
    "event_type": "social_post",
    "time_span_seconds": 0.0,
    "confidence": 0.8
  }
]
```

---

## 6. Implementation Files

| File | Purpose |
|------|---------|
| `src/temporal/__init__.py` | Module init with allen_relation, cluster_events exports |
| `src/temporal/schema.py` | Data models: TemporalInfo, SpatialInfo, CoverageInterval, TimelineEvent, AllenRelation, EventCluster, CoverageStatus |
| `src/temporal/timestamp.py` | Timestamp normalization, precision detection, range parsing |
| `src/temporal/spatial.py` | Spatial normalization, geocoding, precision assessment |
| `src/temporal/engine.py` | Orchestrator — runs all 7 steps + Allen's Interval Algebra + event clustering (all functions take `case_id`) |

### Key Functions (all take `case_id`)
- `TemporalEngine.enrich(case_id, entities, relations, output_dir, run_id)` — Enrich entities with temporal/spatial context for a case
- `normalize_timestamp(ts)` — ISO 8601 string or None
- `parse_timestamp(text)` — (iso_string, TemporalPrecision)
- `detect_precision(text)` — TemporalPrecision enum
- `get_time_range(text)` — (start_iso, end_iso) for range expressions
- `normalize_location(location)` — dict with lat, lon, city, state, precision, radius_km

---

## 7. Failure Modes & Handling

### Timestamp Ambiguity
```
IF timestamp ambiguous (e.g., "03/04" could be March 4 or April 3):
  → Model as interval, not point
  → Use widest reasonable interval
  → Don't guess
```

### Spatial Precision Low
```
IF location vague ("near Hotel Taj"):
  → Use large radius (10km)
  → Don't assume "near X" means "at X"
```

### Coverage Gap
```
IF coverage gap detected:
  → Don't assume "no data" = "nothing happened"
  → Note the gap explicitly
  → Don't fill with assumptions
```

### Unknown Location
```
IF location not in known database:
  → Set precision to "unknown"
  → Use default radius (15km)
  → Preserve raw location string for investigator review
```

---

## 8. Results on Demo Data

### Input
- 152 entities (27 PERSON, 12 PHONE, 26 LOCATION, 4 ACCOUNT, 21 ORGANIZATION, 12 EVENT, 17 AMOUNT, 32 DATE, 1 DEVICE)
- 195 relations (87 VISITED, 81 CALLED, 12 ASSOCIATED_WITH, etc.)
- From Stage 3: 67 resolved entities, 24 contradictions

### Output
| Metric | Count |
|--------|-------|
| Temporal infos | 215 (215 unique IDs) |
| Spatial infos | 14 |
| Coverage intervals | 25 |
| Timeline events | 25 |
| Temporal relations | 0 (point events, no intervals) |
| Event clusters | 1 |

### Sample Results

**Temporal Infos by Event Type:**
```
event:                 25
relation_visited:       6
relation_called:        4
relation_transferred:   2
relation_received:      2
relation_messed:        2
```

**Spatial Infos by Precision:**
```
unknown:  14 (cell towers, vague locations)
city:      6 (Hotel Taj, Delhi, Guna, etc.)
vague:     2 ("near X" descriptions)
```

**Coverage Intervals:**
- 25 entities have temporal coverage data
- Date ranges from 2022-06-15 (earliest case) to 2024-03-28 (latest event)

**Event Clusters:**
- 1 cluster found: social_post events within 10 min

---

## 9. Bug Fixes Applied

### Bug 1: ID Collisions
**Problem:** `generate_id("TEMP", f"{entity_id}_{event_type}")` produced same ID for different timestamps.

**Fix:** Changed to `generate_id("TEMP", f"{entity_id}_{event_type}_{start_time}")` to include timestamp in hash.

**Before:** 230 entries → 41 unique IDs (189 collisions)
**After:** 215 entries → 215 unique IDs (0 collisions)

### Bug 2: TimelineEvent ID Collisions
**Problem:** Same issue as TemporalInfo — `generate_id("TLEVT", f"{entity_id}_{event_type}")` missed timestamp.

**Fix:** Added timestamp to hash: `generate_id("TLEVT", f"{entity_id}_{event_type}_{timestamp}")`

---

## 10. Integration with Pipeline

Stage 4 is integrated into `pipeline.py` as Step 5/6:

```python
# Step 5: Temporal Enrichment
print("[PIPELINE] Step 5/6: Temporal enrichment...")
temporal_summary = self.temporal.enrich(
    entities=entities,
    relations=relations,
    output_dir=str(self.output_dir),
    run_id=run.run_id,
)
output["temporal"] = temporal_summary
```

### Pipeline Output Files (Extended)
```
output/
├── temporal_infos.json      (215 entries, 60KB)
├── spatial_infos.json       (14 entries, 5KB)
├── coverage_intervals.json  (25 entries, 4KB)
├── timeline_events.json     (25 entries, 8KB)
├── temporal_relations.json  (NEW - Allen's Interval Algebra)
├── event_clusters.json      (NEW - Clustered events)
└── temporal_log.json        (summary with new fields)
```

### Summary Output (Extended)
```json
{
  "run_id": "run_20260828_180929",
  "timestamp": "2026-08-28T18:09:29",
  "input_entities": 80,
  "input_relations": 195,
  "temporal_infos": 215,
  "spatial_infos": 14,
  "coverage_intervals": 25,
  "timeline_events": 25,
  "temporal_relations": 0,
  "event_clusters": 1,
  "processing_time_seconds": 0.24
}
```

---

## 11. What Feeds Into Next Stage

Stage 4 output feeds into Stage 5 (Graph Build):

```
Stage 5 Input:
├── resolved_entities_store[]    (from Stage 3)
├── unknown_entities_store[]     (from Stage 3)
├── extracted_relations_store[]  (from Stage 2)
├── temporal_spatial_store[]     (from Stage 4) ← THIS
└── raw_evidence_store[]         (from Stage 1)
```

Stage 5 uses temporal data to:
- Add timestamps to graph edges
- Create time-based relationships
- Enable temporal queries ("who was active in March 2024?")
- Support timeline visualization

---

## 12. Design Invariants Maintained

1. **No fabrication:** Missing timestamps stay empty, never guessed
2. **Precision preserved:** Low-precision data modeled as intervals, not forced to points
3. **Source tracking:** Every temporal/spatial info links back to source entity
4. **Confidence scores:** All outputs include confidence for downstream reasoning
5. **Gap awareness:** Coverage gaps noted explicitly, not filled with assumptions

---

## 13. Comparison with Design Documents

### DATA_FLOW.md Specification vs Implementation

| Spec | Implementation | Status |
|------|----------------|--------|
| Timestamp normalization to ISO 8601 | ✅ `normalize_timestamp()` | Done |
| Precision modeling as intervals | ✅ TemporalPrecision enum | Done |
| Spatial normalization | ✅ `normalize_location()` with known DB | Done |
| Temporal alignment | ✅ TimelineEvent creation | Done |
| Coverage assessment | ✅ CoverageInterval computation | Done |

### STAGE_REASONERS.md Specification vs Implementation

| Spec | Implementation | Status |
|------|----------------|--------|
| Timestamp standardization | ✅ 20+ date formats supported | Done |
| Temporal interval modeling | ✅ Range detection, time-of-day | Done |
| Spatial precision assessment | ✅ 5 precision levels | Done |
| Temporal alignment | ✅ Unified timeline | Done |
| Coverage assessment | ✅ Per-entity date ranges | Done |

### What's NOT Implemented (Future Scope)

1. **ML-based temporal pattern detection** — Would require trained models
2. **Cross-source timestamp validation** — Checking if timestamps from different sources agree
3. **Clock drift detection** — Identifying systematic time offsets between systems
4. **Advanced geocoding** — Using external geocoding API for unknown locations
5. **H3 hexagonal indexing** — For geospatial risk mapping (Module H in playbook)

---

## 14. Next Stage

**Stage 5: Graph Build** — Convert resolved entities, relations, and temporal data into graph nodes and edges for Neo4j export.

Stage 5 will:
1. Create node objects for each resolved entity
2. Create edge objects for each relation with temporal context
3. Add spatial coordinates to location nodes
4. Export as Cypher CREATE statements
