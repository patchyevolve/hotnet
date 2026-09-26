# ============================================================
# FACE RECOGNITION IN CRIMINAL INVESTIGATION — OVERVIEW
# Research Document 01 of 10
# ============================================================
#
# This document provides an executive summary of how face
# recognition technology integrates into our AI-powered
# criminal network analysis system.
# ============================================================


## ============================================================
## 1. PROBLEM STATEMENT
## ============================================================

In criminal investigations, investigators deal with:

1. **Unknown persons in evidence** — CCTV footage, social media
   photos, seized devices show faces but no names.

2. **Multiple identities** — The same person appears in different
   cases under different names (alias, fake ID, disguise).

3. **Witness identification** — Witnesses describe faces but
   investigators need to match those descriptions to known persons.

4. **Evidence linking** — A face in a crime scene photo needs to
   be linked to a suspect, witness, or victim across multiple
   evidence files.

**Our system already extracts:**
- Phone numbers, locations, bank accounts, amounts, dates
- Relations between entities (CALLED, VISITED, TRANSFERRED_TO)
- Entity resolution (fuzzy/phonetic name matching)

**What we're missing:**
- Visual identity resolution (face recognition)
- Cross-modal reasoning (face + CDR + location = evidence)


## ============================================================
## 2. WHAT FACE RECOGNITION ADDS
## ============================================================

### 2.1 Entity Resolution via Face
```
CURRENT (text-only):
  "Rakesh Kumar" (FIR) ──fuzzy match──▶ "R. Kumar" (CDR)
  Confidence: 0.72 (name-based)

WITH FACE RECOGNITION:
  Photo from FIR ──face match──▶ Photo from CCTV
  + "Rakesh Kumar" (FIR) ──fuzzy match──▶ "R. Kumar" (CDR)
  Combined confidence: 0.94 (face + name + context)
```

### 2.2 Unknown Entity Identification
```
BEFORE: Unknown person in CCTV → no leads
AFTER:  Unknown person in CCTV
        → face match against suspect database
        → matched to "Person X" from Case A
        → cross-reference: Person X's phone was at location Y
        → location Y is near crime scene
        → NEW EVIDENCE GENERATED
```

### 2.3 Evidence Chain Strengthening
```
Evidence A: CCTV shows face at 14:30
Evidence B: CDR shows phone at tower near CCTV at 14:32
Evidence C: Bank transaction at 14:45

Face match confirms: CCTV face = Suspect S
CDR confirms: Suspect S's phone was at tower
Bank confirms: Suspect S made transaction

Combined: 3 independent evidence sources → HIGH confidence
```


## ============================================================
## 3. FACE RECOGNITION PIPELINE FLOW
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT SOURCES                             │
│                                                             │
│  CCTV footage ──▶ Frame extraction ──▶ Face detection       │
│  Social media ──▶ Image download  ──▶ Face detection       │
│  FIR scans    ──▶ OCR + images    ──▶ Face detection       │
│  Seized phones──▶ Photo gallery   ──▶ Face detection       │
│  Witness sketches──▶ Sketch-to-photo──▶ Face detection      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  FACE PROCESSING                            │
│                                                             │
│  1. Face Detection (RetinaFace / MTCNN)                     │
│     → Find face bounding boxes in image                     │
│     → Quality check (blur, angle, size)                     │
│                                                             │
│  2. Face Alignment (Affine transformation)                  │
│     → Align eyes to standard position                       │
│     → Normalize for rotation                                │
│                                                             │
│  3. Feature Extraction (ArcFace / InsightFace)              │
│     → Convert face to 512-d embedding vector                │
│     → Each face = unique mathematical signature             │
│                                                             │
│  4. Quality Scoring                                         │
│     → Blur score, angle score, occlusion score              │
│     → Lighting score, resolution score                      │
│     → Overall quality: 0-1                                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  MATCHING ENGINE                             │
│                                                             │
│  1. Candidate Generation                                    │
│     → Search embedding database for similar faces           │
│     → Use HNSW/IVFFlat index for fast nearest-neighbor      │
│     → Return top-K candidates (K=10-50)                     │
│                                                             │
│  2. Re-ranking                                              │
│     → Apply threshold filtering (cosine similarity > 0.4)   │
│     → Sort by similarity score                              │
│     → Return top matches                                    │
│                                                             │
│  3. Verification                                            │
│     → Investigator reviews top matches                      │
│     → Confirms or rejects each candidate                    │
│     → Confirmed matches update Person record                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  REASONING ENGINE                            │
│                                                             │
│  Face match + other evidence = stronger conclusion          │
│                                                             │
│  IF face_match(suspect, cctv_face) > 0.8                    │
│  AND cdr(suspect_phone, tower_near_cctv) at same_time       │
│  AND bank(suspect_account, transaction) near_time           │
│  THEN confidence(suspect_at_crime_scene) = 0.95             │
│                                                             │
│  This is MULTI-MODAL REASONING:                             │
│  Face + Signal + Financial = Evidence                        │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 4. KEY CONCEPTS
## ============================================================

### 4.1 Face Embedding
A face embedding is a 512-dimensional vector (list of 512 numbers)
that represents the unique features of a face. Similar faces have
similar vectors. The distance between vectors indicates similarity.

```
Face A embedding: [0.12, -0.34, 0.56, ..., 0.78]  (512 numbers)
Face B embedding: [0.13, -0.33, 0.55, ..., 0.77]  (very similar)
Face C embedding: [0.89, 0.12, -0.45, ..., 0.23]  (very different)

Cosine similarity(A, B) = 0.92  → Likely same person
Cosine similarity(A, C) = 0.15  → Different person
```

### 4.2 Detection vs Recognition
- **Detection**: "There is a face in this image" (where)
- **Recognition**: "This face belongs to Person X" (who)
- **Verification**: "These two faces are the same person" (1:1)
- **Identification**: "This face matches one of N people" (1:N)

### 4.3 Thresholds
```
Cosine Similarity    Confidence    Action
─────────────────    ──────────    ──────
> 0.80               HIGH          Auto-match (investigator confirms)
0.60 - 0.80         MEDIUM        Suggest match (investigator reviews)
0.40 - 0.60         LOW           Possible match (investigator searches)
< 0.40               NO MATCH      Different person
```

### 4.4 Enrollment vs Search
- **Enrollment**: Adding a face to the database (extracting embedding, storing it)
- **Search**: Finding a face in the database (comparing against all enrolled faces)


## ============================================================
## 5. INTEGRATION POINTS WITH OUR SYSTEM
## ============================================================

| Pipeline Stage | Face Recognition Integration |
|---------------|------------------------------|
| Stage 1: Ingestion | Detect faces in ingested images/CCTV |
| Stage 2: Extraction | Extract face embeddings from detected faces |
| Stage 3: Resolution | Match faces against known persons, resolve unknowns |
| Stage 4: Temporal | Track face appearances across timeline |
| Stage 5: Graph | Add face-based edges (FACE_MATCH, SEEN_WITH) |
| Stage 6: Analytics | Multi-modal reasoning (face + CDR + location) |


## ============================================================
## 6. DOCUMENT MAP
## ============================================================

This overview connects to detailed documents:

| Doc | Title | Content |
|-----|-------|---------|
| 01 | **OVERVIEW** (this doc) | Executive summary, problem statement, pipeline flow |
| 02 | TECHNOLOGY | Deep dive into models, embeddings, libraries |
| 03 | EDGE_CASES | All failure modes and challenges |
| 04 | ARCHITECTURE | System design, where it lives, database schema |
| 05 | ENTITY_RESOLUTION | Connecting unknown faces to known persons |
| 06 | REASONING_ENGINE | Multi-modal evidence reasoning |
| 07 | SCORING | Confidence scoring, match verification |
| 08 | PIPELINE_INTEGRATION | How it plugs into stages 1-5 |
| 09 | API_DESIGN | API endpoints for face operations |
| 10 | RISKS_AND_LIMITATIONS | Legal, ethical, accuracy, bias |


## ============================================================
## 7. SUCCESS CRITERIA
## ============================================================

This research is complete when we can answer:

1. ✅ What face recognition technology to use (model, library)
2. ✅ How to handle edge cases (lighting, aging, masks, etc.)
3. ✅ Where face recognition lives in the architecture
4. ✅ How to connect unknown faces to known entities
5. ✅ How to reason across face + other evidence
6. ✅ How to score confidence in face matches
7. ✅ How to integrate with existing pipeline stages
8. ✅ What API endpoints are needed
9. ✅ What risks and limitations exist
10. ✅ Ready for implementation planning
