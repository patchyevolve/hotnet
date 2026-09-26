# ============================================================
# FACE RECONFIDENTIALITY — CONFIDENCE SCORING
# Research Document 07 of 10
# ============================================================
#
# This document covers confidence scoring for face matches,
# evidence quality assessment, and match verification workflows.
# ============================================================


## ============================================================
## 1. CONFIDENCE SCORING OVERVIEW
## ============================================================

Confidence scoring answers: "How sure are we that this match
is correct?" and "How strong is this evidence?"

```
┌─────────────────────────────────────────────────────────────┐
│                CONFIDENCE SCORING MODEL                      │
│                                                             │
│  INPUTS:                                                    │
│  - Face similarity score (cosine similarity)                │
│  - Face quality score (blur, angle, resolution)             │
│  - Source reliability (CCTV vs social media vs FIR)         │
│  - Corroborating evidence (CDR, location, financial)        │
│  - Context (case type, investigation stage)                 │
│                                                             │
│  PROCESS:                                                   │
│  1. Compute base confidence from face similarity            │
│  2. Apply quality adjustments                               │
│  3. Apply source reliability adjustments                    │
│  4. Apply corroboration boost                               │
│  5. Apply context adjustments                               │
│                                                             │
│  OUTPUTS:                                                   │
│  - Final confidence score (0-1)                             │
│  - Confidence level (HIGH/MEDIUM/LOW)                       │
│  - Confidence breakdown (which factors contributed)         │
│  - Recommendation (auto-match / review / reject)            │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. BASE CONFIDENCE FROM FACE SIMILARITY
## ============================================================

### 2.1 Cosine Similarity to Confidence

```
Cosine Similarity → Base Confidence Mapping:

Similarity 0.95-1.00 → Base confidence 0.98 (near-certain)
Similarity 0.90-0.95 → Base confidence 0.95 (very high)
Similarity 0.85-0.90 → Base confidence 0.90 (high)
Similarity 0.80-0.85 → Base confidence 0.82 (medium-high)
Similarity 0.75-0.80 → Base confidence 0.75 (medium)
Similarity 0.70-0.75 → Base confidence 0.65 (medium-low)
Similarity 0.65-0.70 → Base confidence 0.55 (low)
Similarity 0.60-0.65 → Base confidence 0.45 (very low)
Similarity 0.55-0.60 → Base confidence 0.35 (uncertain)
Similarity 0.50-0.55 → Base confidence 0.25 (unlikely)
Similarity < 0.50    → Base confidence 0.10 (very unlikely)
```

### 2.2 Non-Linear Mapping

```python
def similarity_to_confidence(similarity):
    """Convert cosine similarity to base confidence."""
    
    # Sigmoid-like mapping
    # Steep transition around 0.6-0.8 similarity
    if similarity < 0.4:
        return 0.0
    elif similarity < 0.6:
        return (similarity - 0.4) * 1.5  # 0.0 to 0.3
    elif similarity < 0.8:
        return 0.3 + (similarity - 0.6) * 3.0  # 0.3 to 0.9
    else:
        return 0.9 + (similarity - 0.8) * 0.5  # 0.9 to 1.0
```


## ============================================================
## 3. QUALITY ADJUSTMENTS
## ============================================================

### 3.1 Quality Score Factors

| Factor | Weight | Measurement | Impact |
|--------|--------|-------------|--------|
| **Blur** | 0.20 | Laplacian variance | Low blur = high score |
| **Resolution** | 0.20 | Face pixel area | Larger = better |
| **Angle** | 0.25 | Yaw/pitch/roll | Frontal = best |
| **Lighting** | 0.15 | Histogram analysis | Even = best |
| **Occlusion** | 0.20 | Landmark visibility | Visible = good |

### 3.2 Quality Adjustment Formula

```python
def apply_quality_adjustment(base_confidence, quality_scores):
    """Adjust confidence based on face quality."""
    
    quality_score = (
        quality_scores['blur'] * 0.20 +
        quality_scores['resolution'] * 0.20 +
        quality_scores['angle'] * 0.25 +
        quality_scores['lighting'] * 0.15 +
        quality_scores['occlusion'] * 0.20
    )
    
    # Quality multiplier
    if quality_score > 0.8:
        multiplier = 1.0  # No adjustment
    elif quality_score > 0.6:
        multiplier = 0.95  # Slight penalty
    elif quality_score > 0.4:
        multiplier = 0.85  # Moderate penalty
    elif quality_score > 0.2:
        multiplier = 0.70  # Significant penalty
    else:
        multiplier = 0.50  # Heavy penalty
    
    return base_confidence * multiplier
```

### 3.3 Quality Thresholds

| Quality Score | Confidence Multiplier | Use Case |
|--------------|----------------------|----------|
| > 0.8 | 1.0x | High-quality face, full confidence |
| 0.6 - 0.8 | 0.95x | Good quality, slight penalty |
| 0.4 - 0.6 | 0.85x | Moderate quality, moderate penalty |
| 0.2 - 0.4 | 0.70x | Low quality, significant penalty |
| < 0.2 | 0.50x | Very low quality, heavy penalty |


## ============================================================
## 4. SOURCE RELIABILITY
## ============================================================

### 4.1 Source Types and Reliability

| Source Type | Reliability | Notes |
|------------|-------------|-------|
| **Professional CCTV** | 0.90 | High-quality, fixed camera |
| **Amateur CCTV** | 0.75 | Lower quality, variable angle |
| **Social media photo** | 0.80 | Often filtered, but clear |
| **FIR document scan** | 0.70 | May be degraded |
| **Seized phone photo** | 0.85 | Usually clear |
| **Witness sketch** | 0.50 | Subjective, less accurate |
| **News footage** | 0.75 | Variable quality |
| **Traffic camera** | 0.80 | Fixed position, decent quality |

### 4.2 Source Reliability Adjustment

```python
def apply_source_reliability(base_confidence, source_type):
    """Adjust confidence based on source reliability."""
    
    reliability_map = {
        'professional_cctv': 0.90,
        'amateur_cctv': 0.75,
        'social_media': 0.80,
        'fir_scan': 0.70,
        'seized_phone': 0.85,
        'witness_sketch': 0.50,
        'news_footage': 0.75,
        'traffic_camera': 0.80
    }
    
    reliability = reliability_map.get(source_type, 0.70)
    
    # Apply reliability as multiplier
    return base_confidence * reliability
```


## ============================================================
## 5. CORROBORATION BOOST
## ============================================================

### 5.1 Multi-Source Corroboration

```python
def apply_corroboration_boost(base_confidence, evidence_sources):
    """Boost confidence when multiple sources corroborate."""
    
    active_sources = [s for s in evidence_sources if s.confidence > 0.5]
    
    if len(active_sources) >= 4:
        # Four or more sources
        boost = 1.15
    elif len(active_sources) == 3:
        # Three sources
        boost = 1.10
    elif len(active_sources) == 2:
        # Two sources
        boost = 1.05
    else:
        # Single source
        boost = 1.0
    
    return min(1.0, base_confidence * boost)
```

### 5.2 Evidence Source Types for Corroboration

| Source | What It Proves | Corroboration Value |
|--------|---------------|---------------------|
| **Face match** | Identity | HIGH |
| **CDR proximity** | Phone near scene | HIGH |
| **Location data** | Physical presence | HIGH |
| **Financial transaction** | Activity at scene | MEDIUM |
| **Witness statement** | Testimony | MEDIUM |
| **Network link** | Association | LOW |
| **Social media** | Activity pattern | LOW |


## ============================================================
## 6. FINAL CONFIDENCE CALCULATION
## ============================================================

### 6.1 Complete Formula

```python
def compute_final_confidence(face_match, quality, source, evidence):
    """
    Compute final confidence score for a face match.
    
    Returns: (final_confidence, level, breakdown)
    """
    
    # Step 1: Base confidence from face similarity
    base_confidence = similarity_to_confidence(face_match.cosine_similarity)
    
    # Step 2: Quality adjustment
    quality_adjusted = apply_quality_adjustment(base_confidence, quality)
    
    # Step 3: Source reliability
    source_adjusted = apply_source_reliability(quality_adjusted, source.type)
    
    # Step 4: Corroboration boost
    final_confidence = apply_corroboration_boost(source_adjusted, evidence)
    
    # Step 5: Determine level
    if final_confidence >= 0.85:
        level = "HIGH"
    elif final_confidence >= 0.65:
        level = "MEDIUM"
    elif final_confidence >= 0.45:
        level = "LOW"
    else:
        level = "VERY_LOW"
    
    # Step 6: Generate breakdown
    breakdown = {
        'base_confidence': base_confidence,
        'quality_score': quality.overall_score,
        'quality_adjustment': quality_adjusted / base_confidence if base_confidence > 0 else 1.0,
        'source_reliability': source.reliability,
        'source_adjustment': source_adjusted / quality_adjusted if quality_adjusted > 0 else 1.0,
        'corroboration_count': len([s for s in evidence if s.confidence > 0.5]),
        'corroboration_boost': final_confidence / source_adjusted if source_adjusted > 0 else 1.0
    }
    
    return final_confidence, level, breakdown
```

### 6.2 Example Calculation

```
Face Match:
  cosine_similarity = 0.87
  base_confidence = 0.90

Quality:
  blur_score = 0.90
  resolution_score = 0.85
  angle_score = 0.80
  lighting_score = 0.75
  occlusion_score = 0.95
  quality_score = 0.85
  quality_adjusted = 0.90 × 0.95 = 0.855

Source:
  type = "professional_cctv"
  reliability = 0.90
  source_adjusted = 0.855 × 0.90 = 0.7695

Corroboration:
  evidence_sources = [face, cdr, location]
  active_sources = 3
  boost = 1.10
  final_confidence = 0.7695 × 1.10 = 0.846

Level: HIGH (0.846 >= 0.85)

Breakdown:
  base: 0.90
  quality: 0.85 (×0.95)
  source: 0.90 (×0.90)
  corroboration: 3 sources (×1.10)
  final: 0.846
```


## ============================================================
## 7. MATCH VERIFICATION WORKFLOW
## ============================================================

### 7.1 Verification Levels

| Level | Confidence | Action | Reviewer |
|-------|-----------|--------|----------|
| **Auto-Confirm** | > 0.95 | System confirms | System (investigator notified) |
| **Suggest-Confirm** | 0.80 - 0.95 | System suggests | Investigator confirms |
| **Review** | 0.60 - 0.80 | System lists | Investigator reviews |
| **Manual** | 0.40 - 0.60 | Investigator searches | Investigator decides |
| **Reject** | < 0.40 | No match | System rejects |

### 7.2 Verification Process

```
Step 1: System generates candidates
  - Top 10 matches above threshold 0.40
  - Ranked by confidence score
  - Each with breakdown of factors

Step 2: Investigator reviews
  - View face images side by side
  - View confidence breakdown
  - View corroborating evidence
  - Make decision: CONFIRM / REJECT / NEED_MORE_INFO

Step 3: System updates records
  - CONFIRMED: Update Person/Suspect records
  - REJECTED: Mark as rejected, keep for future
  - NEED_MORE_INFO: Request additional evidence

Step 4: Audit trail
  - Log investigator decision
  - Log timestamp
  - Log reasoning (optional)
```

### 7.3 Verification UI Requirements

```
Face Match Verification Screen:

┌─────────────────────────────────────────────────────────────┐
│  FACE MATCH VERIFICATION                                    │
│                                                             │
│  ┌───────────────┐          ┌───────────────┐              │
│  │               │          │               │              │
│  │  CCTV Face    │   VS     │  Suspect Face │              │
│  │  (from crime  │          │  (from FIR)   │              │
│  │   scene)      │          │               │              │
│  │               │          │               │              │
│  └───────────────┘          └───────────────┘              │
│                                                             │
│  Confidence: 0.846 (HIGH)                                   │
│  Quality: 0.85 | Source: Professional CCTV                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ CORROBORATING EVIDENCE                               │   │
│  │                                                     │   │
│  │ ✅ CDR: Phone near crime scene at same time (0.90)  │   │
│  │ ✅ Location: Known associate nearby (0.75)          │   │
│  │ ⚠️  Financial: No transaction found                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [CONFIRM MATCH]  [REJECT]  [NEED MORE INFO]               │
│                                                             │
│  Investigator Notes:                                        │
│  ___________________________________________________       │
│  ___________________________________________________       │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 8. CONFIDENCE THRESHOLDS
## ============================================================

### 8.1 Threshold Configuration

```yaml
confidence_thresholds:
  # Face matching
  face_match:
    auto_confirm: 0.95
    suggest_confirm: 0.80
    review: 0.60
    manual: 0.40
    reject: 0.0
  
  # Evidence scoring
  evidence_score:
    strong: 0.85
    moderate: 0.65
    weak: 0.45
    insufficient: 0.0
  
  # Entity resolution
  entity_resolution:
    auto_link: 0.90
    suggest_link: 0.70
    possible_link: 0.50
    no_link: 0.0
```

### 8.2 Threshold Tuning

```
Tuning Process:
1. Start with default thresholds
2. Collect investigator feedback
3. Analyze false positive/negative rates
4. Adjust thresholds based on:
   - Acceptable false positive rate (< 5%)
   - Required recall rate (> 90%)
   - Investigation workload (fewer false positives = less work)
5. Document threshold rationale
```


## ============================================================
## 9. CONFIDENCE REPORTING
## ============================================================

### 9.1 Report Format

```json
{
    "match_id": "match_123",
    "query_face": {
        "id": "face_456",
        "source": "CCTV at crime scene",
        "quality_score": 0.85
    },
    "candidate_face": {
        "id": "face_789",
        "source": "FIR document",
        "person_name": "Suresh Kumar"
    },
    "confidence": {
        "final_score": 0.846,
        "level": "HIGH",
        "breakdown": {
            "base_confidence": 0.90,
            "quality_adjustment": 0.95,
            "source_reliability": 0.90,
            "corroboration_count": 3,
            "corroboration_boost": 1.10
        }
    },
    "recommendation": "SUGGEST_CONFIRM",
    "evidence": [
        {"type": "CDR", "score": 0.90, "description": "Phone near crime scene"},
        {"type": "LOCATION", "score": 0.75, "description": "Known associate nearby"}
    ],
    "investigator_decision": null,
    "investigator_notes": null,
    "timestamp": "2024-03-15T14:35:00Z"
}
```

### 9.2 Confidence Visualization

```
Confidence Breakdown Visualization:

Base Confidence:     ████████████████████░░░░  0.90
Quality Adjustment:  ███████████████████░░░░░  0.85 (×0.95)
Source Reliability:  █████████████████░░░░░░░  0.77 (×0.90)
Corroboration:       ██████████████████████░░  0.85 (×1.10)

FINAL:               ██████████████████████░░  0.846 (HIGH)

Sources:
  ✅ Face match:     0.87
  ✅ CDR proximity:  0.90
  ✅ Location:       0.75
  ⚠️  Financial:     N/A
```
