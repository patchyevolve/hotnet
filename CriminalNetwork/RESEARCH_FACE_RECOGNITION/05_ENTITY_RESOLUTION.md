# ============================================================
# FACE RECOGNITION — ENTITY RESOLUTION
# Research Document 05 of 10
# ============================================================
#
# This document explains how face recognition connects unknown
# faces to known entities (witnesses, suspects, victims) and
# how this feeds into our entity resolution pipeline.
# ============================================================


## ============================================================
## 1. ENTITY RESOLUTION VIA FACE — OVERVIEW
## ============================================================

Entity resolution answers: "Who is this person?"

With face recognition, we can resolve entities through:

1. **Direct Match**: Face in CCTV matches known suspect's photo
2. **Cross-Case Match**: Face in Case A matches person from Case B
3. **Witness Corroboration**: Witness description + face match
4. **Photo Comparison**: FIR photo vs CCTV vs social media
5. **Identity Verification**: Confirm claimed identity with face

```
┌─────────────────────────────────────────────────────────────┐
│              ENTITY RESOLUTION FLOW                          │
│                                                             │
│  Unknown Face ──▶ Face Match ──▶ Candidate Selection        │
│                                      │                      │
│                                      ▼                      │
│                              ┌───────────────┐              │
│                              │  Is match     │              │
│                              │  confirmed?   │              │
│                              └───────┬───────┘              │
│                                      │                      │
│                        ┌─────────────┼─────────────┐        │
│                        ▼             ▼             ▼        │
│                    YES             MAYBE          NO        │
│                      │               │             │        │
│                      ▼               ▼             ▼        │
│               Link to Person   Create Entity   Leave as     │
│               Update Suspect   Resolution     Unknown       │
│               Add to Case      Candidate                    │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. RESOLUTION SCENARIOS
## ============================================================

### 2.1 Scenario: CCTV Shows Unknown Person

```
INPUT:
  - CCTV footage from crime scene
  - Shows unknown person at 14:30

PROCESS:
  1. Extract face from CCTV frame
  2. Get 512-d embedding
  3. Search database for similar faces
  4. Find: Face matches "Rakesh Kumar" (suspect in Case A)
     with confidence 0.87

OUTPUT:
  - EntityResolutionCandidate created:
    - source: CCTV face
    - candidate: Rakesh Kumar
    - match_type: FACE
    - confidence: 0.87
  - Pending investigator confirmation
```

### 2.2 Scenario: FIR Photo vs CCTV

```
INPUT:
  - FIR document with suspect photo
  - CCTV from different time/location

PROCESS:
  1. Extract face from FIR scan
  2. Extract face from CCTV
  3. Compare embeddings
  4. Find: Same person (confidence 0.92)

OUTPUT:
  - Confirms suspect in FIR is same person in CCTV
  - Strengthens case: "Suspect was at crime scene"
  - Evidence chain: FIR → CCTV → Suspect
```

### 2.3 Scenario: Social Media Investigation

```
INPUT:
  - Suspect's social media profile
  - Photos from crime scene

PROCESS:
  1. Extract faces from social media photos
  2. Extract faces from crime scene photos
  3. Cross-match all faces
  4. Find: Suspect's social media photo matches crime scene face

OUTPUT:
  - Confirms suspect's identity via social media
  - Additional evidence: social media activity timeline
  - Can extract location, time, associates from social media
```

### 2.4 Scenario: Unknown Witness

```
INPUT:
  - Witness statement with description
  - CCTV showing potential witness

PROCESS:
  1. Extract face from CCTV
  2. Search database
  3. Find: No match (unknown person)
  4. Store as "Unknown Person #1"
  5. Later: Same face appears in another case
  6. Link: "Unknown Person #1" is now linked across cases

OUTPUT:
  - New entity created (unknown)
  - Cross-case link established
  - Investigation leads: "Who is this person appearing in multiple cases?"
```


## ============================================================
## 3. RESOLUTION PIPELINE INTEGRATION
## ============================================================

### 3.1 Where Face Resolution Fits

```
Current Pipeline:
  Stage 1: Ingestion
  Stage 2: Extraction (text-based NER)
  Stage 3: Resolution (fuzzy/phonetic name matching)
  Stage 4: Temporal
  Stage 5: Graph

With Face Recognition:
  Stage 1: Ingestion
  Stage 2: Extraction (text-based NER)
  Stage 2.5: FACE RECOGNITION (new stage)
  Stage 3: Resolution (fuzzy/phonetic + FACE matching)
  Stage 4: Temporal
  Stage 5: Graph
```

### 3.2 Face Resolution Step

```
FACE RESOLUTION PIPELINE:

Input: All face embeddings from ingested evidence

Step 1: Quality Filter
  - Skip faces with quality < 0.3
  - Flag faces with quality 0.3-0.5 for manual review

Step 2: Candidate Search
  - For each face embedding:
    - Search pgvector for top-10 similar embeddings
    - Filter by cosine similarity > 0.4
    - Rank by similarity score

Step 3: Context Enrichment
  - For each candidate match:
    - Check if source evidence is from same case
    - Check temporal proximity (was suspect near crime scene?)
    - Check location proximity (was suspect near crime scene?)
    - Check CDR data (was suspect's phone near crime scene?)

Step 4: Confidence Scoring
  - Base: cosine similarity
  - Boost: quality score, multiple evidence sources
  - Penalize: aging, occlusion, single evidence source

Step 5: Candidate Selection
  - If confidence > 0.8: Auto-suggest match
  - If confidence 0.5-0.8: Suggest with warning
  - If confidence < 0.5: Store as possible match

Step 6: Investigator Review
  - Show top candidates
  - Investigator confirms/rejects each
  - Confirmed matches update Person/Suspect records
```

### 3.3 Resolution Engine Integration

```
Resolution Engine Input:
  - Existing entities (from text extraction)
  - Face embedding candidates
  - CDR data
  - Location data
  - Temporal data

Resolution Engine Process:
  1. Text-based resolution (fuzzy/phonetic name matching)
  2. Face-based resolution (embedding similarity)
  3. Multi-modal resolution (combine text + face + context)
  4. Conflict resolution (when text and face disagree)

Resolution Engine Output:
  - ResolvedEntity records
  - EntityResolutionCandidate records (pending confirmation)
  - Contradiction records (when conflicts detected)
```


## ============================================================
## 4. MULTI-MODAL RESOLUTION
## ============================================================

### 4.1 Combining Face + Text

```
Scenario: "Rakesh Kumar" mentioned in FIR, face in CCTV

Text Resolution:
  - "Rakesh Kumar" (FIR) ↔ "R. Kumar" (CDR)
  - Confidence: 0.72 (fuzzy match)

Face Resolution:
  - CCTV face ↔ Suspect photo
  - Confidence: 0.87 (face match)

Combined Resolution:
  - Text AND face match
  - Confidence: 0.95 (both sources agree)
  
Formula:
  combined = 1 - (1 - text_conf) × (1 - face_conf)
           = 1 - (1 - 0.72) × (1 - 0.87)
           = 1 - 0.28 × 0.13
           = 1 - 0.0364
           = 0.9636
```

### 4.2 Combining Face + CDR

```
Scenario: Face in CCTV at 14:30, phone at nearby tower at 14:32

Face Evidence:
  - Face matches Suspect S
  - Confidence: 0.85

CDR Evidence:
  - Suspect S's phone at tower near CCTV
  - Timestamp: 14:32 (2 minutes after CCTV)
  - Confidence: 0.90

Combined Evidence:
  - Face + CDR corroborate
  - Confidence: 0.97 (strong evidence)
  
  IF face AND cdr WITHIN 5_minutes AND within 1_km:
      confidence = min(face_conf, cdr_conf) × 1.05  # Boost for corroboration
      evidence_strength = "STRONG"
```

### 4.3 Combining Face + Location

```
Scenario: Face at location A, known associate at location B

Face Evidence:
  - Face at Location A (crime scene)
  - Confidence: 0.80

Location Evidence:
  - Known associate at Location B (nearby)
  - Confidence: 0.75

Combined:
  - Two persons of interest near crime scene
  - Network link: Face person ↔ Associate
  - Evidence: "Co-location suggests collaboration"
  - Confidence: 0.88
```


## ============================================================
## 5. ENTITY CREATION RULES
## ============================================================

### 5.1 When to Create New Person

```
CREATE new Person IF:
  - Face has no matches in database (confidence < 0.4)
  - Face appears in multiple cases (cross-case link)
  - Face is associated with new phone/account

DO NOT create new Person IF:
  - Face matches existing Person (confidence > 0.6)
  - Face is low quality (quality < 0.3)
  - Face appears only once (wait for more evidence)
```

### 5.2 When to Update Existing Person

```
UPDATE Person IF:
  - Face match confirmed by investigator
  - New photo is higher quality than existing
  - New alias discovered via face + name matching

Fields to update:
  - best_face_embedding_id (if new photo better)
  - face_match_count (increment)
  - last_face_match_at (timestamp)
  - aliases (if new alias found)
```

### 5.3 When to Create Suspect

```
CREATE Suspect IF:
  - Face linked to criminal activity
  - Face appears at crime scene
  - Face matches known criminal database

Suspect fields:
  - face_embedding_id (link to face)
  - face_match_confidence
  - case_id (which case this suspect is for)
  - status: UNDER_INVESTIGATION
```


## ============================================================
## 6. RESOLUTION CONFLICTS
## ============================================================

### 6.1 Conflict Types

| Conflict | Example | Resolution |
|----------|---------|------------|
| **Face vs Name** | Face matches Person A, name suggests Person B | Investigator decides |
| **Face vs CDR** | Face at scene, but CDR shows phone elsewhere | Check for phone sharing |
| **Face vs Temporal** | Face matches, but timestamp doesn't align | Check for time manipulation |
| **Face vs Location** | Face matches, but location doesn't align | Check for location spoofing |

### 6.2 Conflict Resolution Strategy

```
1. Log contradiction
2. Present all evidence to investigator
3. Let investigator decide
4. Store resolution in audit log

DO NOT auto-resolve conflicts — human judgment required for:
  - Legal defensibility
  - Complex scenarios
  - Edge cases (twins, disguises, etc.)
```


## ============================================================
## 7. EXAMPLE: COMPLETE RESOLUTION FLOW
## ============================================================

```
INPUT: New CCTV footage from robbery case

Step 1: Face Extraction
  - 3 faces detected in CCTV
  - Face A: quality 0.85 (clear, frontal)
  - Face B: quality 0.45 (partial, angled)
  - Face C: quality 0.20 (blurry, distant)

Step 2: Quality Filter
  - Face A: PASS (quality > 0.5)
  - Face B: FLAG (quality 0.3-0.5)
  - Face C: SKIP (quality < 0.3)

Step 3: Face A Search
  - Search database
  - Top match: "Suresh Kumar" (suspect in Case #123)
  - Confidence: 0.92
  - Context: Suresh's phone was near crime scene

Step 4: Face B Search
  - Search database
  - Top match: "Unknown Person" from Case #456
  - Confidence: 0.55
  - Context: Unknown person appeared in 2 other cases

Step 5: Resolution
  - Face A → Suresh Kumar (CONFIRMED, confidence 0.92)
  - Face B → Unknown Person (CANDIDATE, confidence 0.55)

Step 6: Entity Updates
  - Suresh Kumar: face_match_count++, last_face_match_at = now
  - Unknown Person: face_match_count++, possible lead

Step 7: Evidence Linking
  - CaseEntityLink created: Suresh Kumar → Robbery Case (SUSPECT)
  - Evidence chain strengthened: Face + CDR + Location

Step 8: Investigation Alert
  - "Suresh Kumar spotted at robbery scene"
  - "Unknown person from Case #456 also present"
  - Investigator notified
```


## ============================================================
## 8. PERFORMANCE CONSIDERATIONS
## ============================================================

### 8.1 Search Performance

| Database Size | Search Time | Index Size | Memory |
|--------------|-------------|------------|--------|
| 1,000 faces | 5ms | 2MB | 100MB |
| 10,000 faces | 10ms | 20MB | 1GB |
| 100,000 faces | 20ms | 200MB | 10GB |
| 1,000,000 faces | 50ms | 2GB | 100GB |

### 8.2 Batch Processing

```
For large evidence sets (e.g., 1000 CCTV frames):

Batch size: 32 faces per GPU batch
Processing time per batch: ~160ms (32 × 5ms)
Total time for 1000 frames: ~5 seconds (assuming 1 face per frame)

With parallel processing:
  - 4 GPU workers: ~1.25 seconds
  - 8 GPU workers: ~0.6 seconds
```

### 8.3 Storage Requirements

```
Per face embedding:
  - Vector: 512 × 4 bytes = 2KB
  - Metadata: ~1KB
  - Total: ~3KB per face

For 100,000 faces:
  - Embeddings: 300MB
  - Index: 200MB
  - Images (R2): ~10GB (100KB average per face crop)
```
