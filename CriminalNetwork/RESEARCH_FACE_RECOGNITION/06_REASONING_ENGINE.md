# ============================================================
# FACE RECOGNITION — REASONING ENGINE
# Research Document 06 of 10
# ============================================================
#
# This document explains the complex reasoning engine that
# combines face recognition with other evidence sources
# (CDR, location, temporal, financial) to generate
# multi-modal evidence scores and investigation leads.
# ============================================================


## ============================================================
## 1. REASONING ENGINE OVERVIEW
## ============================================================

The reasoning engine answers: "What does this face match MEAN
in the context of the investigation?"

It combines multiple evidence sources to produce:
1. **Evidence scores** — How strong is the evidence?
2. **Investigation leads** — What should we investigate next?
3. **Contradictions** — What evidence conflicts?
4. **Network links** — Who is connected to whom?

```
┌─────────────────────────────────────────────────────────────┐
│                   REASONING ENGINE                           │
│                                                             │
│  INPUTS:                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Face Match  │  │ CDR Data    │  │ Location    │        │
│  │ (who)       │  │ (calls)     │  │ (where)     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              REASONING CORRELATOR                    │   │
│  │                                                     │   │
│  │  Face(who) + CDR(when) + Location(where)           │   │
│  │  = EVIDENCE(what happened)                          │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                  │
│         ▼                                                  │
│  OUTPUTS:                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Evidence    │  │ Leads       │  │ Alerts      │        │
│  │ Scores      │  │ Generated   │  │ Flagged     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```


## ============================================================
## 2. REASONING RULES
## ============================================================

### 2.1 Face + Temporal (Same Time)

```
RULE: Face at time T + Phone at tower at time T
  → Person was at location at time T

EXAMPLE:
  Face A seen at CCTV at 14:30
  Phone P1 at tower near CCTV at 14:32
  IF Face A matches Person P1:
      CONFIDENCE(P1 at crime scene) = 0.95
      EVIDENCE: "Person P1 was physically present at crime scene"
```

### 2.2 Face + Location (Same Place)

```
RULE: Face at location L + Phone at tower near L
  → Person was at location

EXAMPLE:
  Face A seen at Bank X at 10:00
  Phone P1 at tower near Bank X at 10:05
  IF Face A matches Person P1:
      CONFIDENCE(P1 at Bank X) = 0.90
      EVIDENCE: "Person P1 visited Bank X"
```

### 2.3 Face + Financial (Transaction)

```
RULE: Face at location L + Transaction at L at time T
  → Person made transaction

EXAMPLE:
  Face A seen at ATM at 14:30
  Transaction T1 at ATM at 14:32
  IF Face A matches Person P1:
      CONFIDENCE(P1 made transaction) = 0.92
      EVIDENCE: "Person P1 withdrew money at 14:32"
```

### 2.4 Face + Network (Association)

```
RULE: Face A and Face B seen together + A knows B
  → Association confirmed

EXAMPLE:
  Face A and Face B seen at restaurant at 19:00
  Phone records show A called B at 18:45
  CONFIDENCE(A and B associated) = 0.88
  EVIDENCE: "Person A and Person B met at restaurant"
```

### 2.5 Face + Contradiction (Conflict)

```
RULE: Face at time T + Phone at different location at time T
  → Contradiction (phone sharing or location error)

EXAMPLE:
  Face A seen at Location X at 14:30
  Phone P1 at tower near Location Y at 14:32 (different location)
  CONTRADICTION: "Face and phone at different locations"
  POSSIBLE EXPLANATIONS:
    - Phone sharing (someone else has P1's phone)
    - Camera error (wrong timestamp)
    - Location error (wrong tower data)
  ACTION: Investigator review required
```


## ============================================================
## 3. REASONING ALGORITHMS
## ============================================================

### 3.1 Evidence Scoring Algorithm

```python
def compute_evidence_score(face_match, cdr_data, location_data, temporal_data):
    """
    Compute evidence score combining multiple sources.
    Returns: (score, confidence, evidence_description)
    """
    
    # Base scores from each source
    face_score = face_match.confidence  # 0.85
    cdr_score = cdr_data.proximity_score  # 0.90
    location_score = location_data.proximity_score  # 0.80
    temporal_score = temporal_data.proximity_score  # 0.95
    
    # Corroboration boost
    sources = [face_score, cdr_score, location_score, temporal_score]
    active_sources = [s for s in sources if s > 0.5]
    
    if len(active_sources) >= 3:
        # Multiple sources corroborate
        corroboration_boost = 1.1
    elif len(active_sources) == 2:
        # Two sources corroborate
        corroboration_boost = 1.05
    else:
        # Single source
        corroboration_boost = 1.0
    
    # Combined score (weighted average)
    weights = {
        'face': 0.35,
        'cdr': 0.25,
        'location': 0.20,
        'temporal': 0.20
    }
    
    combined = (
        face_score * weights['face'] +
        cdr_score * weights['cdr'] +
        location_score * weights['location'] +
        temporal_score * weights['temporal']
    ) * corroboration_boost
    
    # Cap at 1.0
    combined = min(1.0, combined)
    
    # Generate evidence description
    description = generate_evidence_description(
        face_match, cdr_data, location_data, temporal_data
    )
    
    return combined, description
```

### 3.2 Network Analysis Algorithm

```python
def analyze_network(person_id, graph_edges, face_matches):
    """
    Analyze network connections for a person.
    Returns: network score, key connections, suspicious patterns.
    """
    
    connections = []
    for edge in graph_edges:
        if edge.source_id == person_id or edge.target_id == person_id:
            other_id = edge.target_id if edge.source_id == person_id else edge.source_id
            connections.append({
                'person': other_id,
                'relationship': edge.relationship_type,
                'confidence': edge.confidence_score
            })
    
    # Analyze patterns
    patterns = []
    
    # Pattern 1: Hub person (many connections)
    if len(connections) > 10:
        patterns.append({
            'type': 'HUB_PERSON',
            'description': f'Person has {len(connections)} connections',
            'risk': 'HIGH'
        })
    
    # Pattern 2: Connected to multiple suspects
    suspect_connections = [c for c in connections if c['relationship'] == 'SUSPECT_OF']
    if len(suspect_connections) > 2:
        patterns.append({
            'type': 'SUSPECT_NETWORK',
            'description': f'Connected to {len(suspect_connections)} suspects',
            'risk': 'HIGH'
        })
    
    # Pattern 3: Face match across cases
    cross_case_faces = [f for f in face_matches if f.case_id != person_id.case_id]
    if len(cross_case_faces) > 0:
        patterns.append({
            'type': 'CROSS_CASE_LINK',
            'description': f'Face appears in {len(cross_case_faces)} other cases',
            'risk': 'MEDIUM'
        })
    
    return {
        'connection_count': len(connections),
        'patterns': patterns,
        'network_score': compute_network_score(connections, patterns)
    }
```

### 3.3 Contradiction Detection Algorithm

```python
def detect_contradictions(face_match, other_evidence):
    """
    Detect contradictions between face match and other evidence.
    Returns: list of contradictions.
    """
    
    contradictions = []
    
    # Check 1: Face vs CDR location
    if face_match.location != other_evidence.cdr_location:
        contradictions.append({
            'type': 'LOCATION_CONTRADICTION',
            'face_location': face_match.location,
            'cdr_location': other_evidence.cdr_location,
            'severity': 'HIGH',
            'explanation': 'Face and phone at different locations'
        })
    
    # Check 2: Face vs temporal
    if abs(face_match.timestamp - other_evidence.cdr_timestamp) > timedelta(hours=1):
        contradictions.append({
            'type': 'TEMPORAL_CONTRADICTION',
            'face_time': face_match.timestamp,
            'cdr_time': other_evidence.cdr_timestamp,
            'severity': 'MEDIUM',
            'explanation': 'Face and phone at different times'
        })
    
    # Check 3: Face vs known location
    if other_evidence.suspect_known_location:
        if face_match.location != other_evidence.suspect_known_location:
            contradictions.append({
                'type': 'KNOWN_LOCATION_CONTRADICTION',
                'face_location': face_match.location,
                'known_location': other_evidence.suspect_known_location,
                'severity': 'LOW',
                'explanation': 'Face at unexpected location'
            })
    
    return contradictions
```


## ============================================================
## 4. REASONING OUTPUTS
## ============================================================

### 4.1 Evidence Score Output

```json
{
    "evidence_id": "ev_123",
    "case_id": "case_456",
    "type": "FACE_CDR_LOCATION",
    "score": 0.92,
    "confidence": "HIGH",
    "sources": [
        {
            "type": "FACE_MATCH",
            "confidence": 0.87,
            "details": "CCTV face matches suspect Suresh Kumar"
        },
        {
            "type": "CDR_PROXIMITY",
            "confidence": 0.90,
            "details": "Suspect's phone at tower near crime scene"
        },
        {
            "type": "TEMPORAL_PROXIMITY",
            "confidence": 0.95,
            "details": "Within 2 minutes of crime time"
        }
    ],
    "description": "Suresh Kumar was physically present at crime scene based on face match and phone location",
    "recommendation": "Arrest warrant recommended"
}
```

### 4.2 Investigation Lead Output

```json
{
    "lead_id": "lead_789",
    "case_id": "case_456",
    "type": "SUSPECT_IDENTIFIED",
    "priority": "HIGH",
    "description": "Face in CCTV matches suspect from Case #123",
    "evidence": [
        "Face match confidence: 0.87",
        "Phone near crime scene: 0.90",
        "Known associate of victim: 0.75"
    ],
    "recommended_actions": [
        "Verify face match with investigator",
        "Check suspect's alibi",
        "Search suspect's residence",
        "Monitor suspect's communications"
    ]
}
```

### 4.3 Alert Output

```json
{
    "alert_id": "alert_012",
    "case_id": "case_456",
    "type": "MULTI_MODAL_EVIDENCE",
    "severity": "HIGH",
    "message": "Strong evidence linking Suresh Kumar to robbery",
    "evidence_score": 0.92,
    "sources": ["FACE", "CDR", "TEMPORAL"],
    "timestamp": "2024-03-15T14:35:00Z",
    "requires_action": true,
    "action_required": "Investigator confirmation of face match"
}
```


## ============================================================
## 5. REASONING RULES ENGINE
## ============================================================

### 5.1 Rule Definition Format

```yaml
rules:
  - id: RULE_001
    name: "Face + CDR Corroboration"
    description: "Face match corroborated by CDR proximity"
    inputs:
      - face_match.confidence > 0.7
      - cdr.proximity_score > 0.7
      - temporal.proximity < 5_minutes
    output:
      evidence_score: "min(face, cdr) * 1.1"
      confidence: "HIGH"
      recommendation: "Strong evidence"
    
  - id: RULE_002
    name: "Face + Location Contradiction"
    description: "Face and phone at different locations"
    inputs:
      - face_match.confidence > 0.7
      - cdr.location != face.location
      - temporal.proximity < 5_minutes
    output:
      contradiction: true
      severity: "HIGH"
      explanation: "Phone may be shared or location data incorrect"
    
  - id: RULE_003
    name: "Cross-Case Face Match"
    description: "Face appears in multiple cases"
    inputs:
      - face_match.confidence > 0.6
      - face_match.case_id != current_case_id
    output:
      lead: "Possible serial offender"
      priority: "HIGH"
      recommendation: "Link cases and investigate pattern"
```

### 5.2 Rule Evaluation Engine

```python
class ReasoningEngine:
    def __init__(self):
        self.rules = load_rules()
        self.evidence_store = EvidenceStore()
    
    def evaluate(self, face_match, context):
        """Evaluate all rules against current evidence."""
        
        triggered_rules = []
        
        for rule in self.rules:
            if rule.evaluate(face_match, context):
                triggered_rules.append(rule)
        
        # Generate outputs
        evidence_scores = []
        leads = []
        contradictions = []
        alerts = []
        
        for rule in triggered_rules:
            output = rule.generate_output(face_match, context)
            
            if output.type == 'EVIDENCE_SCORE':
                evidence_scores.append(output)
            elif output.type == 'LEAD':
                leads.append(output)
            elif output.type == 'CONTRADICTION':
                contradictions.append(output)
            elif output.type == 'ALERT':
                alerts.append(output)
        
        return {
            'evidence_scores': evidence_scores,
            'leads': leads,
            'contradictions': contradictions,
            'alerts': alerts
        }
```


## ============================================================
## 6. MULTI-STEP REASONING
## ============================================================

### 6.1 Chain of Evidence

```
Step 1: Face match → Suspect identified
Step 2: Suspect's phone → Location near crime scene
Step 3: Suspect's bank account → Transaction at crime scene
Step 4: Suspect's associate → Also at crime scene
Step 5: Combined evidence → HIGH confidence

CHAIN:
  Face ──▶ Phone ──▶ Bank ──▶ Associate
   │         │         │         │
   ▼         ▼         ▼         ▼
  0.87     0.90     0.85     0.78
   │         │         │         │
   └─────────┴─────────┴─────────┘
                 │
                 ▼
          COMBINED: 0.95
```

### 6.2 Inference Chain

```
OBSERVATION: Face A seen at Location X at Time T
INFERENCE 1: Face A matches Person P (confidence 0.85)
INFERENCE 2: Person P's phone at tower near X at Time T (confidence 0.90)
INFERENCE 3: Person P made transaction at X at Time T (confidence 0.80)
CONCLUSION: Person P was at Location X at Time T (confidence 0.95)

This is valid reasoning because:
  - Each inference has supporting evidence
  - Multiple sources corroborate
  - No contradictions detected
  - Confidence increases with each corroborating source
```

### 6.3 Abductive Reasoning

```
OBSERVATION: Crime occurred at Location X at Time T
HYPOTHESIS: Person P committed crime
EVIDENCE:
  - Face match: P's face at X at T (0.85)
  - CDR: P's phone near X at T (0.90)
  - Bank: P's transaction at X at T (0.80)
  - Network: P knows victim (0.75)

INFERENCE: Hypothesis supported by multiple evidence sources
CONFIDENCE: 0.92
RECOMMENDATION: Investigate further, obtain arrest warrant
```


## ============================================================
## 7. REASONING LIMITATIONS
## ============================================================

### 7.1 What Reasoning CAN Do
- ✅ Combine multiple evidence sources
- ✅ Detect contradictions
- ✅ Score evidence strength
- ✅ Generate investigation leads
- ✅ Identify patterns (serial offender, network)

### 7.2 What Reasoning CANNOT Do
- ❌ Replace human judgment
- ❌ Prove guilt beyond reasonable doubt
- ❌ Handle edge cases automatically (twins, disguises)
- ❌ Resolve complex contradictions without human input
- ❌ Make legal decisions (arrest, prosecution)

### 7.3 Human-in-the-Loop Requirements
```
ALWAYS require human confirmation for:
  - Face matches with confidence < 0.8
  - Contradictions detected
  - Cross-case links
  - Network analysis results
  - Any action that affects liberty (arrest, search)
```


## ============================================================
## 8. PERFORMANCE REQUIREMENTS
## ============================================================

### 8.1 Latency Requirements
```
Single face reasoning: < 100ms
Batch reasoning (100 faces): < 5 seconds
Network analysis: < 1 second
Contradiction detection: < 500ms
```

### 8.2 Throughput Requirements
```
Real-time CCTV: 30 faces/second
Batch processing: 1000 faces/minute
Investigation queries: 100/second
```

### 8.3 Accuracy Requirements
```
Evidence scoring: > 90% accuracy (validated against investigator judgments)
Contradiction detection: > 95% recall (don't miss contradictions)
False positive rate: < 5% (don't flag non-contradictions)
```
