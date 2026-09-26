# ============================================================
# FACE RECOGNITION — API DESIGN
# Research Document 09 of 10
# ============================================================
#
# This document defines the API endpoints for face matching,
# verification, search, and management operations.
# ============================================================


## ============================================================
## 1. API OVERVIEW
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                    FACE RECOGNITION API                       │
│                                                             │
│  Base URL: https://api.criminal-analysis.gov/v1/face        │
│  Auth: JWT Bearer token                                     │
│  Format: JSON                                              │
│                                                             │
│  Endpoints:                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ POST   /detect        — Detect faces in image       │   │
│  │ POST   /extract       — Extract face embeddings     │   │
│  │ POST   /match         — Match face against database │   │
│  │ POST   /verify        — Verify 1:1 face match       │   │
│  │ POST   /search        — Search by face              │   │
│  │ GET    /embeddings/{id} — Get face embedding        │   │
│  │ PUT    /embeddings/{id} — Update face metadata      │   │
│  │ DELETE /embeddings/{id} — Delete face embedding     │   │
│  │ POST   /enroll        — Enroll new face             │   │
│  │ GET    /matches/{id}  — Get match details           │   │
│  │ POST   /confirm/{id}  — Confirm match               │   │
│  │ POST   /reject/{id}   — Reject match                │   │
│  │ GET    /stats         — Get face statistics         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. ENDPOINT SPECIFICATIONS
## ============================================================

### 2.1 POST /detect — Detect Faces in Image

**Request:**
```json
{
    "image_url": "https://storage.example.com/evidence/cctv_frame_001.jpg",
    "image_base64": null,
    "options": {
        "min_face_size": 30,
        "detection_threshold": 0.5,
        "return_landmarks": true,
        "return_bbox": true
    }
}
```

**Response:**
```json
{
    "status": "success",
    "faces_detected": 3,
    "faces": [
        {
            "face_id": "face_001",
            "bbox": {"x": 120, "y": 80, "width": 150, "height": 180},
            "landmarks": {
                "left_eye": [155, 130],
                "right_eye": [210, 135],
                "nose": [185, 165],
                "left_mouth": [160, 195],
                "right_mouth": [205, 200]
            },
            "detection_confidence": 0.95,
            "quality_score": 0.85
        },
        {
            "face_id": "face_002",
            "bbox": {"x": 350, "y": 120, "width": 120, "height": 150},
            "landmarks": { "..." : "..." },
            "detection_confidence": 0.87,
            "quality_score": 0.72
        }
    ],
    "processing_time_ms": 85
}
```

### 2.2 POST /extract — Extract Face Embeddings

**Request:**
```json
{
    "image_url": "https://storage.example.com/evidence/cctv_frame_001.jpg",
    "face_ids": ["face_001"],
    "options": {
        "model": "arcface_r100",
        "return_quality": true,
        "store_embedding": true
    }
}
```

**Response:**
```json
{
    "status": "success",
    "embeddings_extracted": 1,
    "embeddings": [
        {
            "face_id": "face_001",
            "embedding_id": "emb_001",
            "embedding_vector": [0.123, -0.456, 0.789, "..."],
            "embedding_model": "arcface_r100",
            "embedding_dim": 512,
            "quality": {
                "overall_score": 0.85,
                "blur_score": 0.90,
                "angle_score": 0.80,
                "resolution_score": 0.85,
                "lighting_score": 0.75,
                "occlusion_score": 0.95
            },
            "stored": true,
            "r2_key": "r2://embeddings/emb_001.npy"
        }
    ],
    "processing_time_ms": 45
}
```

### 2.3 POST /match — Match Face Against Database

**Request:**
```json
{
    "embedding_id": "emb_001",
    "options": {
        "threshold": 0.5,
        "top_k": 10,
        "include_metadata": true,
        "case_filter": null,
        "date_range": null
    }
}
```

**Response:**
```json
{
    "status": "success",
    "query_embedding": "emb_001",
    "matches_found": 5,
    "matches": [
        {
            "rank": 1,
            "candidate_embedding_id": "emb_045",
            "candidate_person_id": "person_123",
            "candidate_name": "Suresh Kumar",
            "cosine_similarity": 0.92,
            "adjusted_confidence": 0.87,
            "face_quality": 0.85,
            "source_type": "professional_cctv",
            "source_file": "10_CCTV_Log.csv",
            "match_date": "2024-03-15",
            "match_location": "Delhi"
        },
        {
            "rank": 2,
            "candidate_embedding_id": "emb_078",
            "candidate_person_id": "person_456",
            "candidate_name": "Rakesh Kumar",
            "cosine_similarity": 0.78,
            "adjusted_confidence": 0.71,
            "face_quality": 0.80,
            "source_type": "social_media",
            "source_file": "09_Social_Amit.json",
            "match_date": "2024-03-10",
            "match_location": "Mumbai"
        }
    ],
    "processing_time_ms": 25
}
```

### 2.4 POST /verify — Verify 1:1 Face Match

**Request:**
```json
{
    "embedding_id_1": "emb_001",
    "embedding_id_2": "emb_045",
    "options": {
        "threshold": 0.6,
        "return_details": true
    }
}
```

**Response:**
```json
{
    "status": "success",
    "is_match": true,
    "cosine_similarity": 0.92,
    "confidence": 0.87,
    "threshold": 0.6,
    "details": {
        "face1": {
            "id": "emb_001",
            "person_id": null,
            "quality_score": 0.85,
            "source_type": "cctv"
        },
        "face2": {
            "id": "emb_045",
            "person_id": "person_123",
            "quality_score": 0.80,
            "source_type": "fir_scan"
        }
    },
    "processing_time_ms": 15
}
```

### 2.5 POST /search — Search by Face Image

**Request:**
```json
{
    "image_url": "https://storage.example.com/suspect_photo.jpg",
    "options": {
        "threshold": 0.5,
        "top_k": 20,
        "include_unknown": true,
        "case_id": "case_123"
    }
}
```

**Response:**
```json
{
    "status": "success",
    "faces_detected": 1,
    "search_results": {
        "known_matches": [
            {
                "person_id": "person_123",
                "person_name": "Suresh Kumar",
                "confidence": 0.87,
                "case_links": ["case_123", "case_456"],
                "last_seen": "2024-03-15"
            }
        ],
        "unknown_matches": [
            {
                "face_id": "face_unknown_001",
                "confidence": 0.65,
                "appears_in": ["case_789"],
                "first_seen": "2024-02-20"
            }
        ]
    },
    "processing_time_ms": 35
}
```

### 2.6 POST /enroll — Enroll New Face

**Request:**
```json
{
    "person_id": "person_123",
    "image_url": "https://storage.example.com/mugshot_suresh.jpg",
    "metadata": {
        "source_type": "mugshot",
        "case_id": "case_123",
        "notes": "Booking photo from arrest"
    }
}
```

**Response:**
```json
{
    "status": "success",
    "enrollment": {
        "embedding_id": "emb_new_001",
        "person_id": "person_123",
        "embedding_model": "arcface_r100",
        "quality_score": 0.92,
        "stored": true,
        "r2_key": "r2://enrollments/emb_new_001.jpg"
    },
    "processing_time_ms": 55
}
```

### 2.7 POST /confirm/{id} — Confirm Match

**Request:**
```json
{
    "match_id": "match_123",
    "investigator_id": "user_456",
    "notes": "Confirmed by visual inspection"
}
```

**Response:**
```json
{
    "status": "success",
    "match_id": "match_123",
    "new_status": "CONFIRMED",
    "confirmed_by": "user_456",
    "confirmed_at": "2024-03-15T14:35:00Z",
    "person_id": "person_123",
    "case_entity_link_created": true
}
```

### 2.8 POST /reject/{id} — Reject Match

**Request:**
```json
{
    "match_id": "match_123",
    "investigator_id": "user_456",
    "reason": "Different person — scar on left cheek not present",
    "notes": "Suspect has distinctive scar, matched person does not"
}
```

**Response:**
```json
{
    "status": "success",
    "match_id": "match_123",
    "new_status": "REJECTED",
    "rejected_by": "user_456",
    "rejected_at": "2024-03-15T14:40:00Z",
    "rejection_reason": "Different person — scar on left cheek not present"
}
```

### 2.9 GET /stats — Get Face Statistics

**Request:**
```json
{
    "case_id": "case_123",
    "date_range": {
        "start": "2024-01-01",
        "end": "2024-03-31"
    }
}
```

**Response:**
```json
{
    "status": "success",
    "statistics": {
        "total_faces_detected": 127,
        "total_embeddings_extracted": 127,
        "total_matches": 45,
        "confirmed_matches": 8,
        "rejected_matches": 3,
        "pending_matches": 34,
        "high_confidence_matches": 12,
        "average_quality_score": 0.78,
        "average_match_confidence": 0.72,
        "top_persons_matched": [
            {"person_id": "person_123", "match_count": 5},
            {"person_id": "person_456", "match_count": 3}
        ],
        "source_breakdown": {
            "cctv": 45,
            "social_media": 30,
            "fir_scan": 25,
            "seized_phone": 15,
            "other": 12
        }
    }
}
```


## ============================================================
## 3. BATCH OPERATIONS
## ============================================================

### 3.1 POST /batch/detect — Batch Face Detection

**Request:**
```json
{
    "images": [
        {"image_url": "https://.../frame_001.jpg", "frame_id": "frame_001"},
        {"image_url": "https://.../frame_002.jpg", "frame_id": "frame_002"},
        {"image_url": "https://.../frame_003.jpg", "frame_id": "frame_003"}
    ],
    "options": {
        "min_face_size": 30,
        "detection_threshold": 0.5
    }
}
```

**Response:**
```json
{
    "status": "success",
    "total_images": 3,
    "total_faces_detected": 7,
    "results": [
        {"frame_id": "frame_001", "faces_detected": 3},
        {"frame_id": "frame_002", "faces_detected": 2},
        {"frame_id": "frame_003", "faces_detected": 2}
    ],
    "processing_time_ms": 250
}
```

### 3.2 POST /batch/match — Batch Face Matching

**Request:**
```json
{
    "embedding_ids": ["emb_001", "emb_002", "emb_003"],
    "options": {
        "threshold": 0.5,
        "top_k": 10
    }
}
```

**Response:**
```json
{
    "status": "success",
    "total_embeddings": 3,
    "total_matches": 12,
    "results": [
        {"embedding_id": "emb_001", "matches_found": 5},
        {"embedding_id": "emb_002", "matches_found": 4},
        {"embedding_id": "emb_003", "matches_found": 3}
    ],
    "processing_time_ms": 75
}
```


## ============================================================
## 4. ERROR HANDLING
## ============================================================

### 4.1 Error Response Format

```json
{
    "status": "error",
    "error": {
        "code": "FACE_NOT_DETECTED",
        "message": "No face detected in the provided image",
        "details": {
            "image_url": "https://.../no_face.jpg",
            "possible_reasons": [
                "Image contains no faces",
                "Faces are too small",
                "Image quality is too low"
            ]
        }
    },
    "request_id": "req_123456"
}
```

### 4.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `FACE_NOT_DETECTED` | 400 | No face found in image |
| `MULTIPLE_FACES` | 400 | Multiple faces found, specify which one |
| `LOW_QUALITY` | 400 | Face quality too low for processing |
| `EMBEDDING_NOT_FOUND` | 404 | Embedding ID not found |
| `PERSON_NOT_FOUND` | 404 | Person ID not found |
| `MATCH_NOT_FOUND` | 404 | Match ID not found |
| `THRESHOLD_EXCEEDED` | 400 | Similarity below threshold |
| `GPU_UNAVAILABLE` | 503 | GPU processing unavailable |
| `STORAGE_ERROR` | 500 | R2 storage error |
| `DATABASE_ERROR` | 500 | PostgreSQL error |


## ============================================================
## 5. RATE LIMITING
## ============================================================

### 5.1 Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|-----------|-------|
| `/detect` | 100 req/min | 10 req/sec |
| `/extract` | 100 req/min | 10 req/sec |
| `/match` | 60 req/min | 5 req/sec |
| `/verify` | 60 req/min | 5 req/sec |
| `/search` | 30 req/min | 3 req/sec |
| `/enroll` | 30 req/min | 3 req/sec |
| `/batch/*` | 10 req/min | 1 req/sec |

### 5.2 Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1645678900
X-RateLimit-Retry-After: 5
```


## ============================================================
## 6. AUTHENTICATION
## ============================================================

### 6.1 JWT Token Format

```json
{
    "sub": "user_456",
    "name": "Inspector Sharma",
    "role": "INSPECTOR",
    "station_id": "station_delhi_01",
    "permissions": [
        "face:detect",
        "face:extract",
        "face:match",
        "face:verify",
        "face:search",
        "face:confirm"
    ],
    "iat": 1645678900,
    "exp": 1645682500
}
```

### 6.2 Authorization Rules

```
INSPECTOR:
  ✅ face:detect
  ✅ face:extract
  ✅ face:match
  ✅ face:verify
  ✅ face:search
  ✅ face:confirm
  ✅ face:reject
  ❌ face:delete
  ❌ face:enroll (only for suspects)

ADMIN:
  ✅ All INSPECTOR permissions
  ✅ face:enroll
  ✅ face:delete
  ✅ face:configure

AUDIT_LOGGER:
  ✅ face:stats
  ❌ All other face operations
```


## ============================================================
## 7. WEBHOOKS
## ============================================================

### 7.1 Webhook Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `face.detected` | New face detected | Face details |
| `face.extracted` | Embedding extracted | Embedding details |
| `face.matched` | Match found | Match details |
| `face.confirmed` | Match confirmed | Confirmation details |
| `face.rejected` | Match rejected | Rejection details |

### 7.2 Webhook Format

```json
{
    "event": "face.matched",
    "timestamp": "2024-03-15T14:35:00Z",
    "data": {
        "match_id": "match_123",
        "query_face_id": "face_001",
        "candidate_person_id": "person_123",
        "confidence": 0.87,
        "case_id": "case_456"
    },
    "webhook_url": "https://api.example.com/webhooks/face",
    "webhook_secret": "whsec_..."
}
```


## ============================================================
## 8. SDK EXAMPLES
## ============================================================

### 8.1 Python SDK

```python
from criminal_face import FaceClient

client = FaceClient(
    api_key="your_api_key",
    base_url="https://api.criminal-analysis.gov/v1"
)

# Detect faces
faces = client.detect(image_url="https://.../cctv.jpg")

# Extract embeddings
embeddings = client.extract(
    image_url="https://.../cctv.jpg",
    face_ids=[faces[0].face_id]
)

# Match against database
matches = client.match(
    embedding_id=embeddings[0].embedding_id,
    threshold=0.5,
    top_k=10
)

# Confirm match
client.confirm_match(
    match_id=matches[0].match_id,
    investigator_id="user_456",
    notes="Confirmed by visual inspection"
)
```

### 8.2 cURL Examples

```bash
# Detect faces
curl -X POST https://api.criminal-analysis.gov/v1/face/detect \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"image_url": "https://.../cctv.jpg"}'

# Match face
curl -X POST https://api.criminal-analysis.gov/v1/face/match \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"embedding_id": "emb_001", "threshold": 0.5, "top_k": 10}'

# Confirm match
curl -X POST https://api.criminal-analysis.gov/v1/face/confirm/match_123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"investigator_id": "user_456", "notes": "Confirmed"}'
```
