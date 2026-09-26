# ============================================================
# FACE RECOGNITION — EDGE CASES AND CHALLENGES
# Research Document 03 of 10
# ============================================================
#
# This document catalogues ALL edge cases, failure modes,
# and challenges that face recognition encounters in criminal
# investigation scenarios.
# ============================================================


## ============================================================
## 1. ENVIRONMENTAL EDGE CASES
## ============================================================

### 1.1 Lighting Conditions

| Condition | Impact | Mitigation |
|-----------|--------|------------|
| **Very dark** | Face not visible | Use IR cameras, enhance image, skip if unusable |
| **Backlit** | Face silhouette, features lost | Histogram equalization, CLAHE enhancement |
| **Overexposed** | White washout, features lost | Gamma correction, skip if unusable |
| **Mixed lighting** | Uneven features | Local contrast enhancement |
| **Nighttime CCTV** | IR mode, different appearance | Use IR-compatible models |

```
Lighting Score Calculation:
  histogram = compute_histogram(face_image)
  mean_brightness = mean(histogram)
  
  if mean_brightness < 30:   # Too dark
      quality = 0.2
  elif mean_brightness > 225: # Too bright
      quality = 0.2
  else:
      quality = 1.0 - abs(mean_brightness - 128) / 128
```

### 1.2 Image Quality

| Condition | Impact | Mitigation |
|-----------|--------|------------|
| **Blur (motion)** | Features smeared | Laplacian variance check, skip if < 100 |
| **Blur (focus)** | Features soft | Same as motion blur |
| **Low resolution** | Features pixelated | Upscale with ESRGAN, skip if < 30px face |
| **JPEG artifacts** | Blocky features | Use PNG when possible, quality threshold |
| **Noise (grain)** | Random patterns | Denoise with bilateral filter |

### 1.3 Camera Angles

| Condition | Impact | Mitigation |
|-----------|--------|------------|
| **Extreme side view (>60°)** | Half face hidden | Skip, only use frontal faces |
| **Top-down view** | Forehead dominant | Skip, features distorted |
| **Bottom-up view** | Chin dominant | Skip, features distorted |
| **45° angle** | Slight distortion | Alignment helps, reduce confidence |
| **Multiple angles** | Different embeddings | Use best quality angle only |

```
Angle Detection:
  landmarks = detect_landmarks(face)
  left_eye, right_eye = landmarks[0], landmarks[1]
  
  # Compute yaw (horizontal rotation)
  eye_distance = abs(left_eye[0] - right_eye[0])
  face_width = face_bbox[2] - face_bbox[0]
  yaw = arccos(eye_distance / face_width)
  
  if yaw > 30°:  # Too much rotation
      skip face
```


## ============================================================
## 2. FACE APPEARANCE EDGE CASES
## ============================================================

### 2.1 Occlusion

| Occlusion Type | Detection Rate | Mitigation |
|---------------|----------------|------------|
| **Sunglasses** | 70-80% | Use models trained on sunglasses data |
| **Medical mask** | 60-70% | Use mask-aware models (COVID-era models) |
| **Scarf/bandana** | 50-60% | Lower quality score, skip if severe |
| **Hand covering** | 40-50% | Skip, too much occlusion |
| **Hair covering** | 70-80% | Alignment helps, reduce confidence |
| **Hat/cap** | 80-85% | Most models handle this |
| **Face paint** | 60-70% | Very challenging, reduce confidence |

```
Occlusion Detection:
  landmarks = detect_landmarks(face)
  visible_landmarks = count_visible(landmarks)
  occlusion_ratio = 1.0 - (visible_landmarks / total_landmarks)
  
  if occlusion_ratio > 0.4:  # More than 40% occluded
      quality = 0.3  # Low quality, use with caution
```

### 2.2 Aging

| Time Gap | Accuracy Impact | Mitigation |
|----------|----------------|------------|
| < 1 year | < 1% drop | No special handling |
| 1-3 years | 2-5% drop | Acceptable for most cases |
| 3-5 years | 5-10% drop | Lower threshold, require confirmation |
| 5-10 years | 10-20% drop | Use age-invariant models |
| > 10 years | 20-40% drop | May not match, use other evidence |

```
Aging Impact:
  Year 0:  99.8% accuracy (baseline)
  Year 1:  99.5% accuracy
  Year 3:  97.0% accuracy
  Year 5:  94.0% accuracy
  Year 10: 85.0% accuracy
  Year 20: 70.0% accuracy
```

### 2.3 Disguise

| Disguise Type | Detection Rate | Mitigation |
|--------------|----------------|------------|
| **Wig** | 60-70% | Facial structure still similar |
| **Fake beard** | 70-80% | Lower face features change |
| **Glasses (clear)** | 85-90% | Most models handle this |
| **Glasses (dark)** | 70-80% | Similar to sunglasses |
| **Hats** | 80-85% | Top of head hidden |
| **Full mask** | 10-20% | Cannot match, skip entirely |

### 2.4 Twins and Lookalikes

| Scenario | False Match Rate | Mitigation |
|----------|-----------------|------------|
| **Identical twins** | 10-30% | Cannot reliably distinguish, use other evidence |
| **Fraternal twins** | 2-5% | Usually distinguishable |
| **Lookalikes** | 1-3% | High similarity, require multiple evidence |
| **Family members** | 0.5-2% | Usually distinguishable |

```
Twin Handling:
  IF match_score > 0.90 AND suspected_twins:
      DO NOT auto-match
      FLAG for investigator review
      REQUIRE additional evidence (CDR, location, etc.)
```


## ============================================================
## 3. DATA-SPECIFIC EDGE CASES
## ============================================================

### 3.1 CCTV-Specific Challenges

| Challenge | Impact | Mitigation |
|-----------|--------|------------|
| **Low resolution** | 320x240 typical | Upscale, skip small faces |
| **Wide angle distortion** | Face warped | Undistort if camera params known |
| **Multiple cameras** | Different angles | Use best camera for each face |
| **Night mode (IR)** | Different appearance | IR-trained models |
| **Time-lapse** | Blurry movement | Extract sharp frames only |
| **Weather** | Rain, fog, snow | Quality scoring, skip if unusable |

### 3.2 Social Media Challenges

| Challenge | Impact | Mitigation |
|-----------|--------|------------|
| **Selfies** | Close-up, filtered | Handle extreme close-ups |
| **Filters** | Altered appearance | Detect and flag filtered images |
| **Group photos** | Multiple faces | Detect all faces, match each |
| **Old photos** | Aging effects | Lower confidence for old photos |
| **Profile pictures** | Often stylized | Quality scoring |

### 3.3 FIR/Document Challenges

| Challenge | Impact | Mitigation |
|-----------|--------|------------|
| **Scanned documents** | Low quality, artifacts | OCR preprocessing |
| **Photocopies** | Degraded quality | Enhance before detection |
| **Handwritten** | Sketches, drawings | Use sketch-to-photo models |
| **Mixed content** | Text + photos | Extract photo regions only |


## ============================================================
## 4. TECHNICAL EDGE CASES
## ============================================================

### 4.1 Embedding Space Issues

| Issue | Description | Mitigation |
|-------|-------------|------------|
| **Embedding drift** | Different models produce different embeddings | Stick to one model, version embeddings |
| **Cold start** | No faces in database yet | Seed with known suspects |
| **Scale** | Millions of faces, slow search | HNSW index, sharding |
| **Duplicate embeddings** | Same face, slightly different crop | Deduplication pass |

### 4.2 Threshold Tuning

| Scenario | Recommended Threshold | Notes |
|----------|----------------------|-------|
| **1:1 verification** | 0.60 | "Is this person X?" |
| **1:N identification (small DB)** | 0.50 | "Who is this person?" |
| **1:N identification (large DB)** | 0.45 | Lower threshold for recall |
| **Investigation (high recall)** | 0.40 | Want all possible matches |
| **Court evidence (high precision)** | 0.70 | Only high-confidence matches |

```
Threshold Trade-off:
  
  Threshold 0.4: 95% recall, 60% precision (many false positives)
  Threshold 0.5: 90% recall, 80% precision (balanced)
  Threshold 0.6: 80% recall, 90% precision (few false positives)
  Threshold 0.7: 60% recall, 95% precision (very few false positives)
  Threshold 0.8: 40% recall, 99% precision (almost no false positives)
```

### 4.3 Identity Confusion

| Scenario | Risk | Mitigation |
|----------|------|------------|
| **Same person, different cases** | Missed link | Cross-case search |
| **Different person, similar look** | False match | Multi-evidence confirmation |
| **Person changes identity** | Missed match | Alias tracking, photo history |
| **Fake ID photos** | Wrong match | Compare against natural photos |


## ============================================================
## 5. OPERATIONAL EDGE CASES
## ============================================================

### 5.1 Data Quality Issues

| Issue | Detection | Action |
|-------|-----------|--------|
| **Corrupted image file** | File read error | Skip, log error |
| **No face in image** | Detection returns empty | Skip, log "no face detected" |
| **Multiple faces** | Detection returns >1 | Process each face separately |
| **Tiny face (<30px)** | Face area too small | Skip, log "face too small" |
| **Face only partially visible** | Landmarks incomplete | Lower quality score |

### 5.2 Privacy and Legal Issues

| Issue | Risk | Mitigation |
|-------|------|------------|
| **Consent** | Unauthorized surveillance | Log all face queries in audit |
| **Bias** | Racial/gender bias in models | Use diverse training data, audit regularly |
| **Minors** | Cannot process children | Age detection, skip if < 18 |
| **False accusation** | Wrong match → wrongful arrest | Always require human confirmation |
| **Data retention** | How long to keep embeddings | Policy: delete after case closed |

### 5.3 System Issues

| Issue | Detection | Action |
|-------|-----------|--------|
| **GPU out of memory** | CUDA error | Batch smaller, retry |
| **Model loading failure** | ImportError | Fallback to CPU model |
| **Network timeout** | API timeout | Retry with exponential backoff |
| **Disk full** | Write error | Clean old embeddings, alert |


## ============================================================
## 6. EDGE CASE MATRIX
## ============================================================

Complete matrix of all edge cases with severity and handling:

| # | Edge Case | Severity | Detection | Handling |
|---|-----------|----------|-----------|----------|
| 1 | Very dark image | HIGH | Histogram analysis | Skip or enhance |
| 2 | Overexposed image | HIGH | Histogram analysis | Skip or enhance |
| 3 | Motion blur | HIGH | Laplacian variance | Skip |
| 4 | Out of focus | HIGH | Laplacian variance | Skip |
| 5 | Low resolution | MEDIUM | Face pixel count | Upscale or skip |
| 6 | Extreme angle | HIGH | Landmark geometry | Skip if > 60° |
| 7 | Sunglasses | MEDIUM | Landmark visibility | Reduce confidence |
| 8 | Medical mask | HIGH | Landmark visibility | Use mask model or skip |
| 9 | Scarf/bandana | MEDIUM | Landmark visibility | Reduce confidence |
| 10 | Hat/cap | LOW | Landmark visibility | Usually OK |
| 11 | Aging (1-3yr) | LOW | Timestamp comparison | Acceptable |
| 12 | Aging (5+yr) | MEDIUM | Timestamp comparison | Lower confidence |
| 13 | Identical twins | HIGH | Cannot detect | Use other evidence |
| 14 | Disguise (wig) | MEDIUM | Cannot detect | Reduce confidence |
| 15 | Face paint | HIGH | Cannot detect | Reduce confidence |
| 16 | Multiple faces | LOW | Detection count | Process each |
| 17 | No face | LOW | Detection count | Skip |
| 18 | Tiny face | MEDIUM | Face size | Skip if < 30px |
| 19 | IR camera | MEDIUM | Image type | Use IR model |
| 20 | Deepfake | HIGH | Deepfake detection | Flag for review |
| 21 | Photo of photo | MEDIUM | Artifact detection | Reduce confidence |
| 22 | Sketch/drawing | HIGH | Cannot match | Use sketch-to-photo |
| 23 | Profile picture | LOW | Composition | Usually OK |
| 24 | Group photo | LOW | Detection count | Process each |
| 25 | Corrupted file | HIGH | File read error | Skip, log error |


## ============================================================
## 7. HANDLING STRATEGY
## ============================================================

### 7.1 Quality Gate
```
Every face goes through quality gate:

IF quality_score < 0.3:
    SKIP (don't store, don't match)
    
IF quality_score 0.3 - 0.5:
    STORE with low_confidence flag
    DON'T auto-match
    ALLOW manual search only
    
IF quality_score 0.5 - 0.8:
    STORE normally
    ALLOW matching with reduced confidence
    
IF quality_score > 0.8:
    STORE as high_quality
    ALLOW full matching
```

### 7.2 Match Confidence Adjustment
```
Base confidence from face match: face_sim = 0.85

Adjustments:
  IF quality_score < 0.5:     face_sim *= 0.8   # Penalize low quality
  IF aging > 3 years:         face_sim *= 0.9   # Penalize old photos
  IF occlusion > 20%:         face_sim *= 0.85  # Penalize occlusion
  IF angle > 30°:             face_sim *= 0.9   # Penalize angle
  
  final_confidence = face_sim × source_reliability
```

### 7.3 Escalation Path
```
Level 1: Auto-match (confidence > 0.8)
  → System suggests match
  → Investigator confirms/rejects
  
Level 2: Suggest match (confidence 0.5 - 0.8)
  → System suggests match with warning
  → Investigator reviews carefully
  
Level 3: Possible match (confidence 0.4 - 0.5)
  → System lists as possible match
  → Investigator investigates further
  
Level 4: No match (confidence < 0.4)
  → System reports no match
  → Investigator uses other methods
```
