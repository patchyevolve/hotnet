# ============================================================
# FACE RECOGNITION — PIPELINE INTEGRATION
# Research Document 08 of 10
# ============================================================
#
# This document explains how face recognition plugs into our
# existing pipeline stages (1-5) and how it interacts with
# other pipeline components.
# ============================================================


## ============================================================
## 1. PIPELINE INTEGRATION OVERVIEW
## ============================================================

```
┌─────────────────────────────────────────────────────────────┐
│                    PIPELINE STAGES                           │
│                                                             │
│  Stage 1: INGESTION                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ File intake → Hash → Quality → Adversarial check    │   │
│  │                                                     │   │
│  │ NEW: Face detection in images/CCTV                  │   │
│  │ - Detect faces during ingestion                     │   │
│  │ - Store face crops in R2                            │   │
│  │ - Create FaceEmbedding records (pending extraction) │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  Stage 2: EXTRACTION                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ NER → Relations → Confidence                        │   │
│  │                                                     │   │
│  │ NEW: Face embedding extraction                      │   │
│  │ - Extract 512-d embeddings from face crops          │   │
│  │ - Quality scoring for each face                     │   │
│  │ - Store embeddings in pgvector                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  Stage 3: RESOLUTION                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Fuzzy match → Phonetic → Disambiguation → Merge     │   │
│  │                                                     │   │
│  │ NEW: Face-based resolution                          │   │
│  │ - Match faces against known persons                 │   │
│  │ - Create EntityResolutionCandidates                 │   │
│  │ - Combine with text-based resolution                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  Stage 4: TEMPORAL                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Timeline → Contradictions → Coverage                │   │
│  │                                                     │   │
│  │ NEW: Face temporal tracking                         │   │
│  │ - Track face appearances across time                │   │
│  │ - Detect face-based temporal contradictions         │   │
│  │ - Compute face coverage intervals                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  Stage 5: GRAPH                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Nodes → Edges → Adversarial → Provenance            │   │
│  │                                                     │   │
│  │ NEW: Face-based graph edges                         │   │
│  │ - FACE_MATCH edges between persons                  │   │
│  │ - SEEN_WITH edges between co-located faces          │   │
│  │ - Face-based adversarial scoring                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. STAGE 1: INTEGRATION WITH INGESTION
## ============================================================

### 2.1 What Changes

```
BEFORE (text-only ingestion):
  File → Parse → Store content → Done

AFTER (with face detection):
  File → Parse → Store content
            ↓
        IF image/video:
            ↓
        Face Detection (RetinaFace)
            ↓
        Store face crops in R2
            ↓
        Create FaceEmbedding records (pending extraction)
            ↓
        Done
```

### 2.2 Ingestion Engine Modifications

```python
class IngestionEngine:
    def ingest_file(self, file_path):
        # ... existing logic ...
        
        # NEW: Face detection for images/videos
        if file_type in ['image', 'video']:
            face_results = self._detect_faces(file_path)
            file_info['face_count'] = len(face_results)
            file_info['face_crops'] = face_results
        
        return file_info
    
    def _detect_faces(self, file_path):
        """Detect faces in image/video and store crops."""
        
        faces = []
        
        if file_type == 'image':
            # Single image
            img = cv2.imread(file_path)
            detections = face_detector.detect(img)
            
            for det in detections:
                # Crop face
                face_crop = crop_face(img, det.bbox)
                
                # Upload to R2
                r2_key = upload_to_r2(face_crop, f"faces/{file_id}/{det.id}.jpg")
                
                # Create pending embedding record
                face_record = {
                    'id': generate_id('FACE', f"{file_id}_{det.id}"),
                    'source_image_r2_key': r2_key,
                    'face_bbox': det.bbox,
                    'landmarks': det.landmarks,
                    'detector_confidence': det.confidence,
                    'status': 'PENDING_EXTRACTION'
                }
                faces.append(face_record)
        
        elif file_type == 'video':
            # Extract key frames
            frames = extract_key_frames(file_path)
            
            for frame in frames:
                # Detect faces in each frame
                detections = face_detector.detect(frame)
                
                for det in detections:
                    # ... same as image processing ...
                    pass
        
        return faces
```

### 2.3 New Output Fields

```json
{
    "file_name": "10_CCTV_Log.csv",
    "file_type": "tabular",
    "face_count": 5,
    "face_crops": [
        {
            "id": "face_001",
            "source_image_r2_key": "r2://faces/file_001/face_001.jpg",
            "face_bbox": {"x": 120, "y": 80, "width": 150, "height": 180},
            "detector_confidence": 0.95,
            "status": "PENDING_EXTRACTION"
        }
    ]
}
```


## ============================================================
## 3. STAGE 2: INTEGRATION WITH EXTRACTION
## ============================================================

### 3.1 What Changes

```
BEFORE (text-only extraction):
  Content → NER → Relations → Done

AFTER (with face extraction):
  Content → NER → Relations
            ↓
        IF face_crops exist:
            ↓
        Face Alignment (affine transform)
            ↓
        Quality Assessment (blur, angle, etc.)
            ↓
        Embedding Extraction (ArcFace)
            ↓
        Store embedding in pgvector
            ↓
        Done
```

### 3.2 Extraction Engine Modifications

```python
class ExtractionEngine:
    def extract_from_file(self, file_info):
        # ... existing text extraction ...
        
        # NEW: Face embedding extraction
        if 'face_crops' in file_info:
            face_embeddings = self._extract_face_embeddings(file_info['face_crops'])
            self.face_embeddings.extend(face_embeddings)
        
        return result
    
    def _extract_face_embeddings(self, face_crops):
        """Extract embeddings from face crops."""
        
        embeddings = []
        
        for face in face_crops:
            # Load face crop from R2
            face_img = load_from_r2(face['source_image_r2_key'])
            
            # Align face
            aligned_face = align_face(face_img, face['landmarks'])
            
            # Quality assessment
            quality = assess_quality(aligned_face)
            
            if quality.overall_score < 0.3:
                # Skip very low quality faces
                face['status'] = 'REJECTED_LOW_QUALITY'
                continue
            
            # Extract embedding
            embedding = arcface_model.get_embedding(aligned_face)
            
            # Create FaceEmbedding record
            face_embedding = {
                'id': face['id'],
                'source_image_r2_key': face['source_image_r2_key'],
                'embedding_vector': embedding.tolist(),
                'detector_confidence': face['detector_confidence'],
                'quality_score': quality.overall_score,
                'quality_scores': {
                    'blur': quality.blur_score,
                    'angle': quality.angle_score,
                    'resolution': quality.resolution_score,
                    'lighting': quality.lighting_score,
                    'occlusion': quality.occlusion_score
                },
                'face_bbox': face['face_bbox'],
                'landmarks': face['landmarks'],
                'status': 'EXTRACTED'
            }
            
            embeddings.append(face_embedding)
        
        return embeddings
```

### 3.3 New Output Fields

```json
{
    "face_embeddings": [
        {
            "id": "face_001",
            "source_image_r2_key": "r2://faces/file_001/face_001.jpg",
            "embedding_vector": [0.123, -0.456, ...],
            "detector_confidence": 0.95,
            "quality_score": 0.85,
            "quality_scores": {
                "blur": 0.90,
                "angle": 0.80,
                "resolution": 0.85,
                "lighting": 0.75,
                "occlusion": 0.95
            },
            "status": "EXTRACTED"
        }
    ]
}
```


## ============================================================
## 4. STAGE 3: INTEGRATION WITH RESOLUTION
## ============================================================

### 4.1 What Changes

```
BEFORE (text-only resolution):
  Entities → Fuzzy match → Phonetic → Disambiguation → Merge

AFTER (with face resolution):
  Entities → Fuzzy match → Phonetic → Disambiguation
            ↓
        Face Resolution:
            ↓
        Search pgvector for similar embeddings
            ↓
        Rank candidates by similarity
            ↓
        Create EntityResolutionCandidates
            ↓
        Combine with text-based candidates
            ↓
        Merge (if confirmed)
```

### 4.2 Resolution Engine Modifications

```python
class ResolutionEngine:
    def resolve(self, entities, relations):
        # ... existing text-based resolution ...
        
        # NEW: Face-based resolution
        face_candidates = self._resolve_by_face(entities)
        
        # Combine candidates
        all_candidates = text_candidates + face_candidates
        
        # Deduplicate
        all_candidates = deduplicate_candidates(all_candidates)
        
        return all_candidates
    
    def _resolve_by_face(self, entities):
        """Resolve entities using face matching."""
        
        candidates = []
        
        # Get all face embeddings
        face_embeddings = self._get_pending_face_embeddings()
        
        for face_emb in face_embeddings:
            # Search for similar faces
            similar_faces = self._search_similar_faces(
                face_emb['embedding_vector'],
                threshold=0.4,
                top_k=10
            )
            
            for match in similar_faces:
                # Create candidate
                candidate = EntityResolutionCandidate(
                    source_entity_id=face_emb['id'],
                    candidate_entity_id=match['person_id'],
                    match_type='FACE',
                    confidence_score=match['similarity'],
                    signals={'face_similarity': match['similarity']}
                )
                
                candidates.append(candidate)
        
        return candidates
```

### 4.3 New Resolution Logic

```
Resolution Priority:
1. Exact match (same phone number, same account) → Auto-merge
2. High-confidence face match (> 0.85) → Suggest merge
3. Medium-confidence face match (0.60-0.85) → Review merge
4. Fuzzy name match (> 0.70) → Suggest merge
5. Phonetic match (> 0.65) → Review merge
6. Cross-source correlation → Investigate

Face + Text Combination:
  IF face_match.confidence > 0.7 AND text_match.confidence > 0.7:
      combined_confidence = 1 - (1 - face_match) × (1 - text_match)
      → High confidence, suggest merge
```


## ============================================================
## 5. STAGE 4: INTEGRATION WITH TEMPORAL
## ============================================================

### 5.1 What Changes

```
BEFORE (text-only temporal):
  Timestamps → Timeline → Contradictions

AFTER (with face temporal):
  Timestamps → Timeline → Contradictions
            ↓
        Face Temporal Tracking:
            ↓
        Track face appearances across time
            ↓
        Detect face-based contradictions
            ↓
        Compute face coverage intervals
```

### 5.2 Temporal Engine Modifications

```python
class TemporalEngine:
    def process(self, entities, relations):
        # ... existing temporal processing ...
        
        # NEW: Face temporal tracking
        face_timeline = self._build_face_timeline()
        
        # Detect face contradictions
        face_contradictions = self._detect_face_contradictions(face_timeline)
        
        # Compute face coverage
        face_coverage = self._compute_face_coverage(face_timeline)
        
        return {
            'timeline': timeline,
            'contradictions': contradictions + face_contradictions,
            'coverage': coverage + face_coverage
        }
    
    def _build_face_timeline(self):
        """Build timeline of face appearances."""
        
        timeline = []
        
        # Get all face matches with timestamps
        face_matches = self._get_face_matches_with_timestamps()
        
        for match in face_matches:
            timeline.append({
                'entity_id': match['person_id'],
                'face_id': match['face_id'],
                'timestamp': match['timestamp'],
                'location': match['location'],
                'source': match['source_file'],
                'confidence': match['confidence']
            })
        
        return sorted(timeline, key=lambda x: x['timestamp'])
    
    def _detect_face_contradictions(self, timeline):
        """Detect contradictions in face timeline."""
        
        contradictions = []
        
        # Check for same person at different locations at same time
        for i, event1 in enumerate(timeline):
            for event2 in timeline[i+1:]:
                if (event1['entity_id'] == event2['entity_id'] and
                    event1['timestamp'] == event2['timestamp'] and
                    event1['location'] != event2['location']):
                    
                    contradictions.append({
                        'type': 'FACE_TEMPORAL_CONTRADICTION',
                        'entity_id': event1['entity_id'],
                        'timestamp': event1['timestamp'],
                        'location1': event1['location'],
                        'location2': event2['location'],
                        'severity': 'HIGH'
                    })
        
        return contradictions
```


## ============================================================
## 6. STAGE 5: INTEGRATION WITH GRAPH
## ============================================================

### 6.1 What Changes

```
BEFORE (text-only graph):
  Nodes → Edges → Adversarial → Provenance

AFTER (with face graph):
  Nodes → Edges → Adversarial → Provenance
            ↓
        Face-based Edges:
            ↓
        FACE_MATCH edges between persons
            ↓
        SEEN_WITH edges between co-located faces
            ↓
        Face-based adversarial scoring
```

### 6.2 Graph Builder Modifications

```python
class GraphBuilder:
    def build(self, entities, relations, resolved_entities):
        # ... existing graph building ...
        
        # NEW: Face-based edges
        face_edges = self._create_face_edges(resolved_entities)
        
        # Combine edges
        all_edges = text_edges + face_edges
        
        return all_edges
    
    def _create_face_edges(self, resolved_entities):
        """Create graph edges from face matches."""
        
        edges = []
        
        # Get all confirmed face matches
        face_matches = self._get_confirmed_face_matches()
        
        for match in face_matches:
            # FACE_MATCH edge
            edge = GraphEdge(
                source_id=match['person_id'],
                target_id=match['matched_person_id'],
                relationship_type='FACE_MATCH',
                edge_type='associational',
                confidence_score=match['confidence'],
                supporting_evidence=[match['source_file']],
                attributes={
                    'face_similarity': match['similarity'],
                    'face_quality': match['quality_score'],
                    'match_type': 'face_recognition'
                }
            )
            edges.append(edge)
        
        # SEEN_WITH edges (co-located faces)
        co_located = self._find_co_located_faces()
        
        for pair in co_located:
            edge = GraphEdge(
                source_id=pair['person1_id'],
                target_id=pair['person2_id'],
                relationship_type='SEEN_WITH',
                edge_type='associational',
                confidence_score=pair['confidence'],
                supporting_evidence=pair['source_files'],
                attributes={
                    'location': pair['location'],
                    'timestamp': pair['timestamp'],
                    'co_occurrence_count': pair['count']
                }
            )
            edges.append(edge)
        
        return edges
```


## ============================================================
## 7. NEW PIPELINE STAGE: FACE PROCESSING
## ============================================================

### 7.1 Stage 2.5: Face Processing

```
This is a new stage between Extraction and Resolution.

Input:
  - Face embeddings from Stage 2
  - Existing Person records

Process:
  1. Quality filtering (skip low quality)
  2. Candidate search (pgvector)
  3. Candidate ranking
  4. EntityResolutionCandidate creation

Output:
  - FaceEmbedding records (with status)
  - EntityResolutionCandidate records
  - Face match statistics
```

### 7.2 Implementation

```python
class FaceProcessingStage:
    def process(self, face_embeddings, existing_persons):
        """Process face embeddings and create resolution candidates."""
        
        results = {
            'processed': 0,
            'candidates_created': 0,
            'high_confidence_matches': 0,
            'low_quality_rejected': 0
        }
        
        for face_emb in face_embeddings:
            # Step 1: Quality filter
            if face_emb['quality_score'] < 0.3:
                face_emb['status'] = 'REJECTED_LOW_QUALITY'
                results['low_quality_rejected'] += 1
                continue
            
            # Step 2: Search for matches
            candidates = self._search_candidates(face_emb)
            
            # Step 3: Create resolution candidates
            for candidate in candidates:
                resolution_candidate = EntityResolutionCandidate(
                    source_entity_id=face_emb['id'],
                    candidate_entity_id=candidate['person_id'],
                    match_type='FACE',
                    confidence_score=candidate['similarity'],
                    signals={
                        'face_similarity': candidate['similarity'],
                        'face_quality': face_emb['quality_score']
                    }
                )
                
                self._store_candidate(resolution_candidate)
                results['candidates_created'] += 1
                
                if candidate['similarity'] > 0.85:
                    results['high_confidence_matches'] += 1
            
            # Step 4: Update face embedding status
            face_emb['status'] = 'MATCHED' if candidates else 'UNMATCHED'
            results['processed'] += 1
        
        return results
```


## ============================================================
## 8. PIPELINE RUN WITH FACE RECOGNITION
## ============================================================

### 8.1 Complete Pipeline Run

```
Pipeline Run: run_20260830_193829

Stage 1: Ingestion
  Files ingested: 50
  Faces detected: 127
  Face crops stored: 127

Stage 2: Extraction
  Entities extracted: 206
  Relations extracted: 452
  Face embeddings extracted: 127

Stage 2.5: Face Processing
  Faces processed: 127
  Quality rejected: 12
  Candidates created: 45
  High confidence matches: 8

Stage 3: Resolution
  Text-based candidates: 67
  Face-based candidates: 45
  Total candidates: 112
  Merged entities: 50
  Resolved entities: 140

Stage 4: Temporal
  Timeline events: 377
  Face temporal events: 45
  Contradictions found: 11

Stage 5: Graph
  Nodes: 164
  Edges: 131
  Face-based edges: 23
  Adversarial flagged: 0

Summary:
  Total entities: 206
  Total relations: 452
  Face matches: 8 high confidence
  Resolution: 140 resolved entities
  Graph: 164 nodes, 131 edges
```


## ============================================================
## 9. PERFORMANCE IMPACT
## ============================================================

### 9.1 Processing Time

| Stage | Without Face | With Face | Overhead |
|-------|-------------|-----------|----------|
| Ingestion | 5s | 8s | +3s |
| Extraction | 30s | 35s | +5s |
| Face Processing | 0s | 15s | +15s |
| Resolution | 20s | 25s | +5s |
| Temporal | 10s | 12s | +2s |
| Graph | 5s | 7s | +2s |
| **Total** | **70s** | **102s** | **+32s** |

### 9.2 Resource Usage

| Resource | Without Face | With Face | Increase |
|----------|-------------|-----------|----------|
| CPU | 50% | 60% | +10% |
| GPU | 0% | 40% | +40% |
| RAM | 4GB | 6GB | +2GB |
| Storage | 1GB | 2GB | +1GB |
| Network | 100MB | 150MB | +50MB |

### 9.3 Scaling Considerations

```
For 1000 evidence files:
  Without face: ~10 minutes
  With face: ~15 minutes
  
For 10,000 evidence files:
  Without face: ~100 minutes
  With face: ~150 minutes
  
Recommendation: Batch processing for large datasets
  - Process faces in parallel
  - Use GPU workers for embedding extraction
  - Queue system for async processing
```
