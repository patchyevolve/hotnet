# ============================================================
# FACE RECOGNITION — SYSTEM ARCHITECTURE
# Research Document 04 of 10
# ============================================================
#
# This document defines where face recognition lives in the
# system architecture, how it connects to the pipeline, and
# the database schema for face-related data.
# ============================================================


## ============================================================
## 1. ARCHITECTURE OVERVIEW
## ============================================================

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    EVIDENCE INPUT                            │   │
│  │                                                             │   │
│  │  CCTV ──┐                                                   │   │
│  │  Photos ─┤──▶ Ingestion Engine ──▶ Face Detection ──▶ ...   │   │
│  │  Social ─┤                                                   │   │
│  │  FIRs  ──┘                                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 FACE RECOGNITION MODULE                      │   │
│  │                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │  │  Detection  │  │  Alignment  │  │  Extraction │        │   │
│  │  │ RetinaFace  │──▶ Affine     │──▶ ArcFace     │        │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │   │
│  │                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │  │  Quality    │  │  Matching   │  │  Verification│        │   │
│  │  │  Scorer     │──▶  Engine     │──▶  Workflow   │        │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 REASONING ENGINE                             │   │
│  │                                                             │   │
│  │  Face Match + CDR + Location + Temporal = Evidence Score    │   │
│  │                                                             │   │
│  │  IF face(suspect, cctv) AND phone(suspect, tower)          │   │
│  │  AND time(cctv, tower) CLOSE:                               │   │
│  │  THEN suspect_at_scene confidence = 0.95                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DATA STORE                                │   │
│  │                                                             │   │
│  │  pgvector (embeddings)  │  R2 (images)  │  Postgres (meta) │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. MODULE BOUNDARIES
## ============================================================

### 2.1 What Belongs Where

| Component | Location | Responsibility |
|-----------|----------|---------------|
| **Face Detection** | Face Recognition Module | Find faces in images |
| **Face Alignment** | Face Recognition Module | Standardize face pose |
| **Embedding Extraction** | Face Recognition Module | Convert face to vector |
| **Quality Scoring** | Face Recognition Module | Assess face usability |
| **Embedding Storage** | Database (pgvector) | Store vectors for search |
| **Image Storage** | Cloudflare R2 | Store original images |
| **Face Matching** | Face Recognition Module | Find similar faces |
| **Match Verification** | Investigation UI | Human confirms match |
| **Multi-modal Reasoning** | Reasoning Engine | Combine face + other evidence |
| **Entity Resolution** | Resolution Engine | Link face to Person |
| **Confidence Scoring** | Confidence Module | Score match quality |

### 2.2 Module Interfaces

```
Face Recognition Module
    ├── Input: Image bytes, evidence metadata
    ├── Output: FaceEmbedding records
    ├── Dependencies: InsightFace, pgvector, R2
    └── Calls: Reasoning Engine (for multi-modal scoring)

Reasoning Engine
    ├── Input: FaceEmbedding + ExtractedEntity + GraphEdge
    ├── Output: Confidence scores, evidence links
    ├── Dependencies: Our pipeline schema
    └── Calls: Resolution Engine (for entity linking)

Resolution Engine
    ├── Input: FaceEmbedding + existing Person records
    ├── Output: EntityResolutionCandidate records
    ├── Dependencies: Our resolution engine
    └── Calls: Investigation UI (for human confirmation)
```


## ============================================================
## 3. DATABASE SCHEMA — FACE RECOGNITION TABLES
## ============================================================

### 3.1 FaceEmbedding Table

```sql
CREATE TABLE face_embeddings (
    id                  UUID PRIMARY KEY,
    run_id              UUID NOT NULL,           -- FK → pipeline_runs
    person_id           UUID,                    -- FK → persons (nullable until matched)
    suspect_id          UUID,                    -- FK → suspects (nullable)
    evidence_file_id    UUID,                    -- FK → evidence_files (nullable)
    
    -- Source image
    source_image_r2_key VARCHAR NOT NULL,        -- R2 key of source photo
    source_type         VARCHAR,                 -- CCTV_STILL, SOCIAL_MEDIA, FIR_ANNEXURE, etc.
    
    -- Embedding
    embedding_vector    VECTOR(512) NOT NULL,    -- pgvector 512-d ArcFace embedding
    detector_confidence FLOAT NOT NULL,          -- Face detection confidence (0-1)
    quality_score       FLOAT NOT NULL,          -- Overall quality (0-1)
    blur_score          FLOAT,                   -- Blur assessment
    angle_score         FLOAT,                   -- Angle assessment
    occlusion_score     FLOAT,                   -- Occlusion assessment
    
    -- Matching
    match_confidence    FLOAT,                   -- Set after match attempt
    match_status        VARCHAR DEFAULT 'UNMATCHED', -- UNMATCHED, CANDIDATE, CONFIRMED, REJECTED
    confirmed_by_id     UUID,                    -- FK → users (investigator)
    confirmed_at        TIMESTAMP,
    
    -- Metadata
    face_bbox           JSONB,                   -- {x, y, width, height}
    landmarks           JSONB,                   -- 5 facial landmarks
    embedding_model     VARCHAR DEFAULT 'arcface_r100', -- Model used
    
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP
);

-- HNSW index for fast similarity search
CREATE INDEX idx_face_embeddings_hnsw 
    ON face_embeddings 
    USING hnsw (embedding_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- B-tree indexes for lookups
CREATE INDEX idx_face_embeddings_person_id ON face_embeddings(person_id);
CREATE INDEX idx_face_embeddings_match_status ON face_embeddings(match_status);
CREATE INDEX idx_face_embeddings_quality ON face_embeddings(quality_score);
```

### 3.2 FaceMatch Table (Match History)

```sql
CREATE TABLE face_matches (
    id                  UUID PRIMARY KEY,
    run_id              UUID NOT NULL,
    query_face_id       UUID NOT NULL,           -- FK → face_embeddings (the face being matched)
    candidate_face_id   UUID NOT NULL,           -- FK → face_embeddings (the match candidate)
    
    -- Similarity
    cosine_similarity   FLOAT NOT NULL,          -- Raw similarity score (0-1)
    adjusted_confidence FLOAT NOT NULL,          -- After quality/age/occlusion adjustments
    
    -- Status
    status              VARCHAR DEFAULT 'CANDIDATE', -- CANDIDATE, CONFIRMED, REJECTED
    reviewed_by_id      UUID,                    -- FK → users
    reviewed_at         TIMESTAMP,
    review_notes        TEXT,
    
    -- Context
    match_context       JSONB,                   -- Additional context (case_id, evidence_type, etc.)
    
    created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_face_matches_query ON face_matches(query_face_id);
CREATE INDEX idx_face_matches_candidate ON face_matches(candidate_face_id);
CREATE INDEX idx_face_matches_status ON face_matches(status);
```

### 3.3 FaceQualityLog Table (Quality Tracking)

```sql
CREATE TABLE face_quality_logs (
    id                  UUID PRIMARY KEY,
    face_embedding_id   UUID NOT NULL,           -- FK → face_embeddings
    quality_score       FLOAT NOT NULL,
    blur_score          FLOAT,
    resolution_score    FLOAT,
    angle_score         FLOAT,
    lighting_score      FLOAT,
    occlusion_score     FLOAT,
    rejection_reason    TEXT,                    -- Why face was rejected (if applicable)
    created_at          TIMESTAMP DEFAULT NOW()
);
```


## ============================================================
## 4. INTEGRATION WITH EXISTING TABLES
## ============================================================

### 4.1 Person Table (Extended)

```sql
-- Add to persons table
ALTER TABLE persons ADD COLUMN best_face_embedding_id UUID;
ALTER TABLE persons ADD COLUMN face_match_count INTEGER DEFAULT 0;
ALTER TABLE persons ADD COLUMN last_face_match_at TIMESTAMP;

-- "Best face" is determined by:
-- WHERE person_id = X AND match_status = 'CONFIRMED' 
-- ORDER BY quality_score DESC, match_confidence DESC 
-- LIMIT 1
```

### 4.2 Suspect Table (Extended)

```sql
-- Add to suspects table
ALTER TABLE suspects ADD COLUMN face_embedding_id UUID;
ALTER TABLE suspects ADD COLUMN face_match_confidence FLOAT;
ALTER TABLE suspects ADD COLUMN face_match_status VARCHAR;
```

### 4.3 EvidenceFile Table (Extended)

```sql
-- Add to evidence_files table
ALTER TABLE evidence_files ADD COLUMN face_count INTEGER DEFAULT 0;
ALTER TABLE evidence_files ADD COLUMN faces_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE evidence_files ADD COLUMN face_processing_status VARCHAR;
```

### 4.4 CaseEntityLink Table (Extended)

```sql
-- Add to case_entity_links table
ALTER TABLE case_entity_links ADD COLUMN face_match_id UUID;
ALTER TABLE case_entity_links ADD COLUMN evidence_type VARCHAR; -- 'face_match', 'cdr', 'witness', etc.
```


## ============================================================
## 5. DATA FLOW — COMPLETE PATH
## ============================================================

```
Step 1: Evidence Ingestion
─────────────────────────────────────────────────────────────
Input:  CCTV video file
Output: EvidenceFile record (r2_key, file_type, etc.)

Step 2: Frame Extraction (for video)
─────────────────────────────────────────────────────────────
Input:  Video file from R2
Output: Key frames (1 per second, or on motion detection)
Storage: Temporary frames in R2

Step 3: Face Detection
─────────────────────────────────────────────────────────────
Input:  Key frames
Output: Face bounding boxes + landmarks
Model:  RetinaFace (via InsightFace)
Time:   ~50ms per frame

Step 4: Face Alignment
─────────────────────────────────────────────────────────────
Input:  Face bbox + landmarks + original image
Output: Aligned face (112x112)
Method: Affine transformation based on eye positions

Step 5: Quality Assessment
─────────────────────────────────────────────────────────────
Input:  Aligned face
Output: Quality scores (blur, angle, resolution, etc.)
Action: Skip if quality < 0.3

Step 6: Embedding Extraction
─────────────────────────────────────────────────────────────
Input:  Aligned face (112x112)
Output: 512-d embedding vector
Model:  ArcFace (via InsightFace)
Time:   ~5ms per face

Step 7: Store Embedding
─────────────────────────────────────────────────────────────
Input:  Embedding vector + metadata
Output: FaceEmbedding record in PostgreSQL
Index:  HNSW index for fast search

Step 8: Search for Matches
─────────────────────────────────────────────────────────────
Input:  New embedding
Output: Top-K similar embeddings from database
Method: pgvector cosine similarity search
Threshold: similarity > 0.4

Step 9: Candidate Ranking
─────────────────────────────────────────────────────────────
Input:  Top-K matches
Output: Ranked candidates with confidence scores
Method: Re-rank by quality, age, occlusion adjustments

Step 10: Investigator Review
─────────────────────────────────────────────────────────────
Input:  Ranked candidates
Output: Confirmed/Rejected matches
Method: Human review in investigation UI

Step 11: Entity Resolution
─────────────────────────────────────────────────────────────
Input:  Confirmed face match
Output: Person.suspect_id linked, CaseEntityLink created
Method: If face matches known Person → link
        If face matches Suspect → update Suspect.person_id
        If face is new → create new Person record

Step 12: Multi-modal Reasoning
─────────────────────────────────────────────────────────────
Input:  Face match + CDR + location + temporal
Output: Evidence score (confidence in suspect's involvement)
Method: Combine all evidence sources
```


## ============================================================
## 6. DEPLOYMENT ARCHITECTURE
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                 DEPLOYMENT ARCHITECTURE                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              POLICE STATION SERVER                    │   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Face API   │  │  Pipeline   │  │  Postgres   │ │   │
│  │  │  (FastAPI)  │  │  (Python)   │  │  + pgvector │ │   │
│  │  │  Port: 8000 │  │  Port: 8001 │  │  Port: 5432 │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │  GPU Worker │  │  Redis      │                  │   │
│  │  │  (Celery)   │  │  (Queue)    │                  │   │
│  │  │  Port: 8002 │  │  Port: 6379 │                  │   │
│  │  └─────────────┘  └─────────────┘                  │   │
│  │                                                     │   │
│  │  GPU: NVIDIA T4 (16GB VRAM)                         │   │
│  │  RAM: 32GB                                          │   │
│  │  Storage: 1TB SSD                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              │ API calls                    │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CLOUD (Cloudflare)                      │   │
│  │                                                     │   │
│  │  R2 Storage (images)  │  CDN (static assets)        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 7. SCALABILITY CONSIDERATIONS
## ============================================================

### 7.1 Single Station (Current)
- 1 GPU server per station
- 1 Postgres instance with pgvector
- Handles: ~10,000 faces, ~100 cases
- Throughput: ~15 faces/second

### 7.2 Multi-Station (Future)
- Each station has local GPU + Postgres
- Shared R2 storage for images
- Cross-station search via API federation
- Handles: ~100,000 faces, ~1,000 cases

### 7.3 National Scale (Far Future)
- Centralized embedding database
- Distributed GPU workers
- Sharded pgvector indexes
- Handles: ~10,000,000 faces, ~100,000 cases


## ============================================================
## 8. SECURITY ARCHITECTURE
## ============================================================

### 8.1 Data Protection
```
Images:   Encrypted at rest (AES-256) in R2
Embeddings: Encrypted at rest (Postgres TDE)
In Transit: TLS 1.3 for all API calls
Access:   RBAC (INSPECTOR, ADMIN, AUDIT_LOGGER)
```

### 8.2 Audit Trail
```
Every face operation logged:
  - Who queried (user_id)
  - What was queried (face_embedding_id)
  - When (timestamp)
  - Result (match found, confidence)
  - IP address

Stored in: audit_logs table
Retention: 7 years (legal requirement)
```

### 8.3 Access Control
```
INSPECTOR:
  ✅ Query face database
  ✅ View matches
  ✅ Confirm/reject matches
  ❌ Delete embeddings
  ❌ Export face data

ADMIN:
  ✅ All INSPECTOR permissions
  ✅ Manage face database
  ✅ Configure thresholds
  ❌ Delete audit logs

AUDIT_LOGGER:
  ✅ View audit logs
  ❌ Query face database
  ❌ Modify any data
```


## ============================================================
## 9. MONITORING AND ALERTS
## ============================================================

### 9.1 Key Metrics
```
- faces_detected_total: Total faces detected
- faces_embedded_total: Total embeddings created
- embedding_latency_ms: Time to create embedding
- search_latency_ms: Time to search for matches
- match_confidence_avg: Average match confidence
- quality_score_avg: Average face quality
- gpu_utilization: GPU usage percentage
- storage_used_gb: Embedding storage usage
```

### 9.2 Alerts
```
HIGH PRIORITY:
  - GPU utilization > 90% for > 5 minutes
  - Embedding latency > 100ms (should be ~5ms)
  - Search latency > 1000ms (should be ~20ms)
  - Disk usage > 80%

MEDIUM PRIORITY:
  - Match confidence avg < 0.5 (quality issue)
  - Quality score avg < 0.5 (input quality issue)
  - Face detection failure rate > 10%

LOW PRIORITY:
  - New model version available
  - Embedding index needs rebuilding
  - Storage cleanup recommended
```
