# ============================================================
# FACE RECOGNITION TECHNOLOGY — DEEP DIVE
# Research Document 02 of 10
# ============================================================
#
# This document covers the technology stack, models, and
# libraries used for face recognition in criminal investigation.
# ============================================================


## ============================================================
## 1. TECHNOLOGY STACK OVERVIEW
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                    FACE RECOGNITION STACK                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   INPUT      │  │  PROCESSING │  │   OUTPUT    │         │
│  │             │  │             │  │             │         │
│  │ CCTV frames │  │ Detection  │  │ Embeddings  │         │
│  │ Photos      │──▶ Alignment  │──▶ Matches     │         │
│  │ Video       │  │ Extraction │  │ Scores      │         │
│  │ Social media│  │ Quality    │  │ Verdicts    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Libraries: InsightFace, face_recognition, DeepFace         │
│  Models: ArcFace, Facenet, VGGFace2, OpenFace               │
│  Storage: pgvector (embeddings), R2 (images)                │
│  Index: HNSW, IVFFlat (approximate nearest neighbor)        │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. FACE DETECTION MODELS
## ============================================================

### 2.1 RetinaFace (Recommended)
- **Accuracy**: State-of-the-art on WIDER FACE benchmark
- **Speed**: ~50ms per image on GPU
- **Features**: Detects faces + 5 facial landmarks (eyes, nose, mouth corners)
- **Handles**: Multiple faces, partial occlusion, various angles
- **Output**: Bounding box + landmarks + detection confidence

```
RetinaFace Detection:
Input:  Image (640x480)
Output: [
    { bbox: [x, y, w, h], landmarks: [5 points], confidence: 0.99 },
    { bbox: [x, y, w, h], landmarks: [5 points], confidence: 0.87 }
]
Time: ~50ms (GPU), ~500ms (CPU)
```

### 2.2 MTCNN (Multi-Task Cascaded Convolutional Networks)
- **Accuracy**: Good, but lower than RetinaFace
- **Speed**: ~100ms per image on GPU
- **Features**: Joint face detection + alignment
- **Use case**: When alignment is needed in same step
- **Limitation**: Slower than RetinaFace, less accurate on small faces

### 2.3 BlazeFace (Mobile/Edge)
- **Accuracy**: Moderate
- **Speed**: ~10ms per image (optimized for mobile)
- **Use case**: Real-time CCTV processing on edge devices
- **Limitation**: Less accurate for small/distant faces

### Comparison Table

| Model | mAP (WIDER FACE) | Speed (GPU) | Speed (CPU) | Best For |
|-------|------------------|-------------|-------------|----------|
| RetinaFace | 96.9% | 50ms | 500ms | **Production (recommended)** |
| MTCNN | 94.4% | 100ms | 800ms | Joint detection + alignment |
| BlazeFace | 89.0% | 10ms | 50ms | Mobile/edge deployment |
| YOLO-Face | 93.0% | 30ms | 200ms | Real-time video |


## ============================================================
## 3. FACE RECOGNITION MODELS
## ============================================================

### 3.1 ArcFace (Recommended — State of the Art)
- **Architecture**: ResNet-100 backbone + ArcFace loss
- **Embedding**: 512-dimensional vector
- **Accuracy**: 99.83% on LFW (Labeled Faces in the Wild)
- **Speed**: ~5ms per face on GPU
- **Library**: InsightFace (Python)

```
ArcFace Pipeline:
Input:  Aligned face image (112x112)
Output: 512-d embedding vector
        [0.123, -0.456, 0.789, ..., 0.321]  (512 numbers)

Cosine Similarity:
  Same person:  0.85 - 0.99
  Different:    0.10 - 0.40
  Threshold:    0.40 (below = no match)
```

### 3.2 Facenet (Google)
- **Architecture**: Inception-ResNet-v1
- **Embedding**: 128-dimensional vector
- **Accuracy**: 99.63% on LFW
- **Speed**: ~10ms per face on GPU
- **Library**: face_recognition (Python), deepface

```
Facenet Pipeline:
Input:  Aligned face image (160x160)
Output: 128-d embedding vector
Triplet loss: Same person close, different person far
```

### 3.3 VGGFace2 (Oxford VGG)
- **Architecture**: ResNet-50
- **Embedding**: 2048-dimensional vector
- **Accuracy**: 99.71% on LFW
- **Speed**: ~15ms per face on GPU
- **Use case**: Large-scale identification (millions of faces)

### 3.4 OpenFace
- **Architecture**: Inception-v1 (GoogLeNet)
- **Embedding**: 128-dimensional vector
- **Accuracy**: 98.5% on LFW
- **Speed**: ~8ms per face on GPU
- **Use case**: Open-source alternative, good for prototyping

### Comparison Table

| Model | Embedding Dim | LFW Accuracy | Speed (GPU) | Library |
|-------|--------------|--------------|-------------|---------|
| **ArcFace** | 512 | 99.83% | 5ms | InsightFace |
| Facenet | 128 | 99.63% | 10ms | face_recognition |
| VGGFace2 | 2048 | 99.71% | 15ms | deepface |
| OpenFace | 128 | 98.50% | 8ms | openface |

**Recommendation: ArcFace via InsightFace**
- Best accuracy (99.83%)
- Fastest inference (5ms)
- 512-d embedding (good balance of detail vs storage)
- Active development, good documentation


## ============================================================
## 4. FACE ALIGNMENT
## ============================================================

Before extracting embeddings, faces must be aligned to a standard
position. This ensures consistency across different poses.

### 4.1 Alignment Process
```
Input:  Raw face detection (bbox + landmarks)
Output: Aligned face (112x112, eyes at standard position)

Steps:
1. Detect 5 landmarks: left eye, right eye, nose, left mouth, right mouth
2. Compute affine transformation to align eyes to standard positions
3. Apply transformation to crop and rotate face
4. Resize to 112x112 (for ArcFace)
```

### 4.2 Why Alignment Matters
```
Without alignment:          With alignment:
┌──────────────┐           ┌──────────────┐
│  ╱╲   ╱╲    │           │  ●   ●       │
│  ╲╱   ╲╱    │    ───▶   │      ◡       │
│    ◡        │           │              │
│  (tilted)   │           │  (straight)  │
└──────────────┘           └──────────────┘

Same person, different embeddings if not aligned!
Alignment normalizes the pose → consistent embeddings.
```

### 4.3 Alignment Libraries
- **InsightFace**: Built-in alignment (recommended)
- **dlib**: 68-point landmark detection + alignment
- **MediaPipe**: Google's face mesh (468 landmarks)


## ============================================================
## 5. QUALITY ASSESSMENT
## ============================================================

Not all face images are equal. Quality scoring determines
whether a face is usable for matching.

### 5.1 Quality Factors

| Factor | Measurement | Threshold | Impact |
|--------|------------|-----------|--------|
| **Blur** | Laplacian variance | > 100 | Low blur = good |
| **Resolution** | Face area in pixels | > 50x50 px | Larger = better |
| **Angle** | Yaw/pitch/roll | < 30° | Frontal = best |
| **Lighting** | Histogram analysis | Not too dark/bright | Even = best |
| **Occlusion** | Landmark visibility | < 30% occluded | Visible = good |
| **Expression** | Neutral preferred | Any | Neutral = best |
| **Age** | Younger faces easier | Any | Varies |

### 5.2 Quality Score Formula
```
quality_score = (
    blur_score * 0.2 +
    resolution_score * 0.2 +
    angle_score * 0.25 +
    lighting_score * 0.15 +
    occlusion_score * 0.2
)

Where each factor is normalized to 0-1:
  blur_score = min(1.0, laplacian_variance / 500)
  resolution_score = min(1.0, face_area / (100*100))
  angle_score = max(0, 1.0 - (abs(yaw) + abs(pitch) + abs(roll)) / 180)
  lighting_score = 1.0 - abs(histogram_mean - 128) / 128
  occlusion_score = visible_landmarks / total_landmarks
```

### 5.3 Quality Thresholds

| Quality Score | Action |
|--------------|--------|
| > 0.8 | USE for matching (high confidence) |
| 0.5 - 0.8 | USE with caution (medium confidence) |
| 0.3 - 0.5 | STORE but don't match (low confidence) |
| < 0.3 | DISCARD (unusable) |


## ============================================================
## 6. EMBEDDING STORAGE AND SEARCH
## ============================================================

### 6.1 Storage Format
```
FaceEmbedding record:
{
    id: "face_uuid",
    person_id: "person_uuid" or null,
    embedding_vector: [0.123, -0.456, ...],  (512 floats)
    source_image_r2_key: "r2://path/to/image.jpg",
    detector_confidence: 0.99,
    quality_score: 0.87,
    status: "PENDING" | "CONFIRMED" | "REJECTED"
}
```

### 6.2 Search Methods

#### Exact Search (Brute Force)
```
For each face in database:
    similarity = cosine_similarity(query_embedding, stored_embedding)
    if similarity > threshold:
        add to results

Time: O(n) — too slow for millions of faces
```

#### Approximate Nearest Neighbor (ANN) — Recommended
```
Use HNSW index (Hierarchical Navigable Small World):
- Build graph of embeddings
- Navigate graph to find nearest neighbors
- Time: O(log n) — fast even for millions of faces

PostgreSQL + pgvector:
CREATE INDEX ON face_embeddings 
    USING hnsw (embedding_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
```

### 6.3 Search Performance

| Database Size | Brute Force | HNSW Index | IVFFlat Index |
|--------------|-------------|------------|---------------|
| 1,000 faces | 10ms | 2ms | 5ms |
| 10,000 faces | 100ms | 5ms | 10ms |
| 100,000 faces | 1s | 10ms | 20ms |
| 1,000,000 faces | 10s | 20ms | 50ms |


## ============================================================
## 7. LIBRARY COMPARISON
## ============================================================

### 7.1 InsightFace (Recommended)
```python
# Installation
pip install insightface onnxruntime-gpu

# Usage
import insightface
from insightface.app import FaceAnalysis

app = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

# Detect + Embed
img = cv2.imread('photo.jpg')
faces = app.get(img)

for face in faces:
    print(f"Embedding: {face.embedding.shape}")  # (512,)
    print(f"Detection: {face.det_score}")         # 0.99
    print(f"Landmarks: {face.landmarks.shape}")   # (5, 2)
```

### 7.2 face_recognition (Simpler)
```python
# Installation
pip install face-recognition

# Usage
import face_recognition

# Load image
image = face_recognition.load_image_file("photo.jpg")

# Detect faces
face_locations = face_recognition.face_locations(image)
face_encodings = face_recognition.face_encodings(image, face_locations)

# Each encoding is 128-d
for encoding in face_encodings:
    print(f"Embedding: {encoding.shape}")  # (128,)
```

### 7.3 DeepFace (Multiple Models)
```python
# Installation
pip install deepface

# Usage
from deepface import DeepFace

# Analyze face
analysis = DeepFace.analyze("photo.jpg", actions=['age', 'gender', 'race'])

# Get embedding
embedding = DeepFace.represent("photo.jpg", model_name='ArcFace')

# Verify two faces
result = DeepFace.verify("img1.jpg", "img2.jpg", model_name='ArcFace')
```

### Comparison Table

| Feature | InsightFace | face_recognition | DeepFace |
|---------|------------|-----------------|----------|
| Detection | RetinaFace | HOG/CNN | MTCNN/RetinaFace |
| Recognition | ArcFace | Facenet | Multiple |
| Embedding | 512-d | 128-d | Varies |
| GPU Support | ✅ | ✅ | ✅ |
| Speed | Fastest | Medium | Slowest |
| Accuracy | Best | Good | Good |
| Ease of Use | Medium | Easy | Easy |
| **Recommendation** | **Production** | Prototyping | Evaluation |


## ============================================================
## 8. DEPLOYMENT OPTIONS
## ============================================================

### 8.1 Local (On-Premise)
```
Pros: No data leaves the network, full control
Cons: GPU hardware needed, maintenance overhead
Best for: Police stations with IT infrastructure

Requirements:
- GPU: NVIDIA T4 or better (16GB VRAM)
- RAM: 32GB minimum
- Storage: 1TB SSD for models + embeddings
- OS: Ubuntu 20.04+ or Windows 10+
```

### 8.2 Cloud (AWS/GCP/Azure)
```
Pros: Scalable, no hardware management, pay-per-use
Cons: Data leaves network (privacy concern), ongoing cost
Best for: Large-scale deployment, multiple stations

Requirements:
- Instance: g4dn.xlarge (AWS) or equivalent
- Storage: S3 for images, RDS for embeddings
- Network: VPN for secure data transfer
```

### 8.3 Hybrid (Recommended)
```
Pros: Privacy for sensitive data, scalability for bulk processing
Cons: More complex architecture
Best for: Our system

Architecture:
- Face detection + embedding: LOCAL (on server at police station)
- Embedding search: LOCAL (pgvector on local Postgres)
- Image storage: Cloudflare R2 (encrypted, access-controlled)
- Model updates: Cloud (downloaded to local)
```


## ============================================================
## 9. MODEL PERFORMANCE BENCHMARKS
## ============================================================

### 9.1 Accuracy Benchmarks

| Dataset | ArcFace | Facenet | VGGFace2 | OpenFace |
|---------|---------|---------|----------|----------|
| LFW | 99.83% | 99.63% | 99.71% | 98.50% |
| CFP-FP | 98.27% | 97.50% | 98.00% | 95.00% |
| AgeDB-30 | 98.00% | 95.00% | 97.00% | 92.00% |
| MegaFace | 98.35% | 96.00% | 97.50% | 93.00% |

### 9.2 Speed Benchmarks (NVIDIA T4 GPU)

| Operation | InsightFace | face_recognition | DeepFace |
|-----------|------------|-----------------|----------|
| Detection | 50ms | 100ms | 150ms |
| Alignment | 5ms | 10ms | 10ms |
| Embedding | 5ms | 15ms | 20ms |
| Search (10K) | 5ms | 10ms | 20ms |
| **Total** | **65ms** | **135ms** | **200ms** |

### 9.3 Throughput

| System | Faces/Second (GPU) | Faces/Second (CPU) |
|--------|-------------------|-------------------|
| InsightFace | 15 | 2 |
| face_recognition | 7 | 1 |
| DeepFace | 5 | 0.5 |

**For CCTV processing (30 fps video):**
- Need: 30 faces/second minimum
- InsightFace GPU: ✅ (15 fps single stream, 2 streams possible)
- face_recognition GPU: ❌ (7 fps, too slow for real-time)
- Recommendation: Batch processing, not real-time


## ============================================================
## 10. RECOMMENDED STACK
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                 RECOMMENDED TECHNOLOGY STACK                 │
│                                                             │
│  Detection:     RetinaFace (via InsightFace)                │
│  Recognition:   ArcFace (via InsightFace)                   │
│  Embedding:     512-dimensional vector                      │
│  Alignment:     Built-in (InsightFace)                      │
│  Quality:       Custom scorer (blur, angle, resolution)     │
│  Storage:       pgvector (PostgreSQL extension)             │
│  Image Store:   Cloudflare R2                               │
│  Search:        HNSW index (pgvector)                       │
│  API:           FastAPI (Python)                            │
│  GPU:           NVIDIA T4 or better                         │
│  Batch:         Celery + Redis (async processing)           │
└─────────────────────────────────────────────────────────────┘
```
