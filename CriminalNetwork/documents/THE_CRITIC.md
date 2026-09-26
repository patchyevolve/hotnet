# THE CRITIC — The Final Reasoner

> The Critic is the system's brain. It reads everything, reasons about everything, and answers the investigator's questions. It never writes to analytical stores — only reads.

---

## Stage → Model Mapping

The Critic (Stage 10) reads ALL five analytical models (see SYSTEM_STRUCTURE.md):

```
Model 1: Evidence Model        → Critic reads for raw evidence provenance
Model 2: Provenance Model      → Critic reads for derivation depth, independence
Model 3: Coverage Model        → Critic reads for gaps, what was/wasn't seen
Model 4: Entity State Model    → Critic reads for identity uncertainty
Model 5: Hypothesis & Inv.     → Critic reads for competing theories, gaps, actions

All prior stages (1-9) feed into the five models that the Critic reads.
```

---

## What the Critic Is

```
The Critic is:
├── A reasoning engine that queries ALL stores
├── An answer machine for investigator questions
├── A quality checker for the entire investigation
├── A report generator for case summaries
└── A calibration system for confidence scores

The Critic is NOT:
├── A stage in the pipeline (it reads from all stages)
├── A writer to analytical stores (read-only)
├── A replacement for human judgment (assists, doesn't replace)
└── A final arbiter of truth (provides analysis, not conclusions)
```

---

## The Critic's Architecture

```
CRITIC ENGINE
├── Query Parser
│   └── Understands investigator questions
│   └── Maps to store queries
│
├── Evidence Assembler
│   └── Gathers all relevant evidence
│   └── Checks provenance chains
│   └── Validates independence
│
├── Confidence Calibrator
│   └── Checks if scores match evidence
│   └── Detects overconfidence
│   └── Adjusts for biases
│
├── Report Generator
│   └── Creates investigation summaries
│   └── Structures findings
│   └── Highlights gaps
│
└── Action Recommender
    └── Suggests next steps
    └── Prioritizes by information gain
    └── Considers feasibility
    └── Validates ML outputs
```

---

## ML Quality Check

The Critic validates ML outputs before presenting them to the investigator.

### What the Critic Checks

```
ML QUALITY CHECKS:

1. CONFIDENCE CALIBRATION
   ├── Does the ML prediction confidence match reality?
   ├── Is the confidence interval properly calibrated?
   ├── Would a 70% confidence prediction be correct 70% of the time?
   └── Flag: Overconfident predictions (too narrow intervals)

2. CONTRADICTION CHECK
   ├── Do ML outputs contradict each other?
   ├── Does GNN prediction contradict BN inference?
   ├── Does temporal analysis contradict static analysis?
   └── Flag: Contradictory ML outputs for investigator review

3. EXPLAINABILITY CHECK
   ├── Can we justify why the ML made this prediction?
   ├── Which features drove the prediction?
   ├── Is the explanation understandable to an investigator?
   └── Flag: Unexplainable predictions for manual review

4. UNCERTAINTY CHECK
   ├── Is uncertainty properly quantified?
   ├── Is the prediction interval reasonable?
   ├── Is the uncertainty based on actual data or assumed?
   └── Flag: Predictions with assumed rather than calculated uncertainty

5. SANITY CHECK
   ├── Does the prediction make sense given the evidence?
   ├── Is the prediction consistent with domain knowledge?
   ├── Would an experienced investigator agree with this?
   └── Flag: Predictions that violate domain common sense

6. BIAS CHECK
   ├── Is the prediction biased toward certain entities?
   ├── Is the prediction biased toward certain patterns?
   ├── Is the prediction biased by training data?
   └── Flag: Potentially biased predictions for review
```

### ML Quality Output

```
MLQualityAssessment {
  prediction_id:      string      // which ML prediction
  quality_checks:     QualityCheck[]
  overall_quality:    float       // 0-1
  flags:              string[]    // what was flagged
  recommendations:    string[]    // what to do about it
  confidence:         float       // how confident in this quality assessment
}

QualityCheck {
  check_type:         string      // calibration, contradiction, explainability, etc.
  passed:             boolean
  score:              float       // 0-1
  details:            string
  evidence:           string[]
}
```

### Integration with Investigator Queries

```
INVESTIGATOR ASKS: "Why did the system flag Rakesh?"

CRITIC PROCESSING:
1. Gather ML predictions for Rakesh
2. Run quality checks on each prediction
3. Filter out low-quality predictions
4. Explain only high-quality predictions
5. Include quality assessment in explanation

OUTPUT:
{
  "entity": "Rakesh",
  "ml_predictions": [
    {
      "prediction": "hidden_relationship_with_Suresh",
      "confidence": 0.73,
      "quality_score": 0.82,
      "explanation": "High call frequency + geographic proximity",
      "quality_flags": ["calibration_ok", "explainable", "no_contradiction"]
    }
  ],
  "quality_summary": "All predictions passed quality checks",
  "confidence_in_explanation": 0.85
}
```

---

## The Critic's Query System

### Query Types

```
1. ENTITY QUERY
   └── "Tell me about Rakesh"
   └── "Who is connected to Suresh?"
   └── "What phones does Rakesh use?"

2. RELATIONSHIP QUERY
   └── "How are Rakesh and Suresh connected?"
   └── "What is the relationship between these two people?"
   └── "Who called whom?"

3. TIMELINE QUERY
   └── "What happened on March 15?"
   └── "Show me Rakesh's activity this week"
   └── "When did they last meet?"

4. PATTERN QUERY
   └── "Are there any anomalies?"
   └── "What patterns do you see?"
   └── "Is this behavior normal?"

5. HYPOTHESIS QUERY
   └── "What explains the evidence?"
   └── "How confident are you in the primary hypothesis?"
   └── "What are the alternatives?"

6. GAP QUERY
   └── "What don't we know?"
   └── "What evidence is missing?"
   └── "What should I do next?"

7. CONTRADICTION QUERY
   └── "Are there contradictions?"
   └── "What conflicts exist?"
   └── "How do you resolve this?"
```

### Query Processing

```
INPUT: "Tell me about Rakesh"

PROCESSING:
1. Parse: Entity query for "Rakesh"
2. Resolve: Find "Rakesh" in resolved_entities_store
   └── Found: res_001 (Rakesh Kumar, alias Raki)
3. Gather: All data about res_001
   ├── Phones: ["9876543210"]
   ├── Vehicles: ["MP09-AB-1234"]
   ├── Addresses: ["Village Dhaneli, Guna, MP"]
   ├── Roles: [{FIR_1234: accused}, {FIR_5678: accused}]
   ├── Connections: [res_002 (Suresh), res_003 (Mohan)]
   ├── Timeline: [calls, meetings, transactions]
   ├── Anomalies: [activity burst on 2024-03-15]
   └── Hypotheses: [hyp_001 (fraud ring, 0.72)]
4. Assemble: Complete picture of Rakesh
5. Present: Structured response

OUTPUT:
{
  "entity": "Rakesh Kumar",
  "aliases": ["Rakesh", "Raki", "R. Kumar"],
  "phones": ["9876543210"],
  "vehicles": ["MP09-AB-1234"],
  "addresses": ["Village Dhaneli, Guna, MP"],
  "father": "Ram Kumar",
  "dob": "1990-05-15",
  "roles": [
    {"fir": "1234", "role": "accused"},
    {"fir": "5678", "role": "accused"}
  ],
  "connections": [
    {"entity": "Suresh", "type": "associate", "confidence": 0.87},
    {"entity": "Mohan", "type": "associate", "confidence": 0.65}
  ],
  "activity_summary": {
    "calls_last_30_days": 45,
    "meetings_last_30_days": 3,
    "transactions_last_30_days": 8
  },
  "anomalies": [
    {"type": "activity_burst", "date": "2024-03-15", "severity": "high"}
  ],
  "hypotheses": [
    {"id": "hyp_001", "description": "Fraud ring", "confidence": 0.72}
  ],
  "data_quality": {
    "cdr_coverage": 0.85,
    "bank_coverage": 0.70,
    "surveillance_coverage": 0.45
  }
}
```

---

## Evidence Assembly

### How the Critic Gathers Evidence

```
STEP 1: Identify relevant stores
  └── Based on query type, select stores to query

STEP 2: Query stores
  └── Execute queries against all relevant stores

STEP 3: Check provenance
  └── For each piece of evidence, trace back to source
  └── Check if evidence is independent
  └── Check derivation depth

STEP 4: Check dependency
  └── Are two pieces of evidence from same source?
  └── If yes, they're dependent — don't double-count

STEP 5: Assemble complete picture
  └── Gather all relevant evidence
  └── Organize by type (supporting, contradicting, neutral)
  └── Note gaps

STEP 6: Validate
  └── Is the assembled evidence complete?
  └── Are there contradictions?
  └── Are there missing pieces?
```

### Dependency Checking

```
IMPORTANT: The claim-aware dependency DAG (INPUT_DATA.md §0.1) is the
authority for independence analysis. Simple source comparison is an
optimization/initial heuristic, NOT the independence rule.

Same source ≠ necessarily same dependency.
Different source ≠ necessarily independent.

EXAMPLES:
Bank report → police financial report: two documents, one observation.
Two witnesses: independent, OR both obtained account from same person.

The DAG is the authority. Source comparison is a fast heuristic.

DEPENDENCY CHECKING PROCESS:
├── 1. Trace dependency DAG to root sources
├── 2. Count unique root sources (independent observations)
├── 3. Source comparison is Step 1 optimization, not Step 2 rule
└── 4. If DAG available, use DAG. If not, fall back to source comparison with caveat.

EXAMPLE (using DAG):
Evidence A: "Rakesh called Suresh" (from FIR #1234, claim: witness statement)
Evidence B: "Rakesh met Suresh" (from FIR #1234, claim: officer observation)
Evidence C: "Rakesh transferred money to Suresh" (from bank record)

DAG:
├── A depends on witness_17 (DIRECT_OBSERVATION)
├── B depends on officer_12 (DIRECT_OBSERVATION)
├── C depends on bank_record (DIRECT_OBSERVATION)
└── INDEPENDENT SOURCES: 3 (witness_17, officer_12, bank_record)

NOTE: A and B share FIR #1234 as DOCUMENT, but have different
sub-sources (witness vs officer). The DAG correctly identifies
them as independent observations within the same document.

DEPENDENCY CHECKING RULES:
├── Always prefer DAG traversal over source comparison
├── If DAG unavailable, note: "heuristic dependency check, may be inaccurate"
├── Source comparison is conservative (may over-count dependence)
└── DAG comparison is precise (correctly handles partial independence)
```

---

## Confidence Calibration

### How the Critic Checks Scores

```
STEP 1: Collect all confidence scores
  └── From all stages, all entities, all edges

STEP 2: Check for overconfidence
  └── Are scores too high given evidence?
  └── Is there only one source?
  └── Is there confirming evidence from independent sources?

STEP 3: Check for underconfidence
  └── Are scores too low given strong evidence?
  └── Are there multiple independent sources?
  └── Is the evidence clear and direct?

STEP 4: Calibrate
  └── Adjust scores based on:
  │   ├── Source reliability
  │   ├── Independence of evidence
  │   ├── Provenance depth
  │   ├── Coverage ratio
  │   └── Known biases

STEP 5: Report calibration
  └── What was adjusted and why
  └── What the new scores are
  └── What the remaining uncertainty is
```

### Bias Detection

```
BIASES THE CRITIC CHECKS FOR:

1. CONFIRMATION BIAS
   └── Are we only looking for evidence that confirms?
   └── Have we actively sought counter-evidence?
   └── Are we ignoring contradictions?

2. ANCHORING BIAS
   └── Are we stuck on first hypothesis?
   └── Have we considered alternatives?
   └── Are we updating based on new evidence?

3. AVAILABILITY BIAS
   └── Are we over-weighting recent evidence?
   └── Are we over-weighting vivid evidence?
   └── Are we ignoring boring but important evidence?

4. SOURCE BIAS
   └── Are we over-trusting automated sources?
   └── Are we under-trusting manual sources?
   └── Are we considering source reliability?

5. INDEPENDENCE BIAS
   └── Are we counting dependent evidence as independent?
   └── Are we checking provenance chains?
   └── Are we tracking dependency groups?

6. INVESTIGATION FEEDBACK BIAS
   └── Are we over-weighting evidence found because we recommended it?
   └── Are we distinguishing observational from investigation-generated data?
   └── Are we tracking data origin?

7. ADVERSARIAL MANIPULATION
   └── Could observed edges be intentionally created to mislead?
   └── Do edges fit natural interaction patterns?
   └── Are there artificial structures in the graph?

8. MODEL DRIFT
   └── Are historical patterns still valid?
   └── Has criminal behavior changed since model training?
   └── Are we detecting current behavior or historical behavior?
```

---

## Report Generation

### Investigation Report

```
INVESTIGATION REPORT
├── Case Summary
│   ├── What is this case about?
│   ├── Key entities involved
│   ├── Key events
│   └── Current status
│
├── Evidence Summary
│   ├── What evidence do we have?
│   ├── How reliable is it?
│   ├── How independent is it?
│   └── What gaps exist?
│
├── Hypothesis Assessment
│   ├── Primary hypothesis
│   ├── Confidence level
│   ├── Supporting evidence
│   ├── Contradicting evidence
│   ├── Alternative hypotheses
│   └── Why we favor primary
│
├── Contradictions
│   ├── What conflicts exist
│   ├── How severe they are
│   ├── Can they be resolved
│   └── Impact on hypothesis
│
├── Data Quality
│   ├── Coverage ratio
│   ├── Source reliability
│   ├── Completeness
│   └── Known limitations
│
├── Recommended Actions
│   ├── What to do next
│   ├── Priority order
│   ├── Expected information gain
│   └── Feasibility
│
└── Limitations
    ├── What we don't know
    ├── What we can't determine
    ├── What assumptions we've made
    └── What would change our assessment
```

### Example Report

```
INVESTIGATION REPORT: CASE_001
Generated: 2024-03-20T10:00:00Z

SUMMARY:
Rakesh Kumar (alias Raki) and Suresh appear to be 
involved in a financial fraud scheme. Multiple FIRs 
reference both individuals. CDR analysis shows 
frequent communication. Bank records show suspicious 
money transfers.

EVIDENCE:
├── FIR #1234: Rakesh accused of cheating (2,00,000)
├── FIR #5678: Rakesh and Suresh accused of fraud
├── CDR: 45 calls between Rakesh and Suresh (Jan-Mar)
├── Bank: ₹2,00,000 transferred from Rakesh to Suresh
├── Surveillance: Meeting at Hotel Taj on 2024-03-15
└── Social Media: Post referencing "great meeting"

RELIABILITY:
├── FIR: 0.7 (manual, subjective)
├── CDR: 0.95 (automated, objective)
├── Bank: 0.95 (automated, objective)
├── Surveillance: 0.6 (agent observation)
└── Social Media: 0.5 (unverified)

INDEPENDENCE:
├── FIR + CDR: INDEPENDENT (different sources)
├── FIR + Bank: INDEPENDENT (different sources)
├── CDR + Bank: INDEPENDENT (different sources)
├── Surveillance + Social Media: DEPENDENT (both from same day)
└── Overall independence: 0.8

HYPOTHESIS:
├── Primary: Financial fraud ring (confidence: 0.72)
├── Alternative: Legitimate business (confidence: 0.15)
├── Alternative: Coincidence (confidence: 0.08)
└── Null: Nothing criminal (confidence: 0.05)

CONTRADICTIONS:
├── CDR shows Bhopal location, FIR says Guna meeting
├── Severity: Significant
└── Possible explanation: Phone was with someone else

GAPS:
├── No bank statement for Suresh after Feb 2024
├── No phone records for Suresh
├── No CCTV footage from Hotel Taj
└── Unknown male in surveillance report unidentified

RECOMMENDED ACTIONS:
├── 1. Obtain Suresh's bank statement (priority: high)
├── 2. Obtain Suresh's phone records (priority: high)
├── 3. Request CCTV from Hotel Taj (priority: medium)
├── 4. Identify unknown male (priority: medium)
└── 5. Interview Suresh (priority: low)

LIMITATIONS:
├── Coverage ratio: 0.65 (significant gaps)
├── Data quality: Medium (mix of manual and automated)
├── Key evidence missing for Suresh
└── Surveillance coverage is low (3 sightings in 30 days)

ASSESSMENT:
Evidence moderately supports fraud hypothesis. 
Three independent sources (FIR, CDR, bank) provide 
consistent narrative. However, significant gaps exist 
for Suresh. Recommendation: Collect missing evidence 
before drawing conclusions.
```

---

## Action Recommendation

### How the Critic Prioritizes Actions

```
PRIORITY SCORING:
Priority = information_gain × feasibility × urgency

min_gain_to_investigate: 0.10  # below this → skip investigation

INFORMATION GAIN:
├── How much would this evidence change our beliefs?
├── Would it distinguish between hypotheses?
├── Would it fill a critical gap?
└── Score: 0-1

FEASIBILITY:
├── Can this evidence actually be collected?
├── How difficult is it?
├── How long will it take?
├── Does it require legal authority?
└── Score: 0-1

URGENCY:
├── Is this evidence time-sensitive?
├── Will it be destroyed or expire?
├── Is there a deadline?
└── Score: 0-1

PRIORITY = info_gain × feasibility × urgency
```

### Example Action List

```
ACTION 1: Obtain Suresh's bank statement
├── Information gain: 0.9 (would confirm/deny money flow)
├── Feasibility: 0.8 (requires legal request, but doable)
├── Urgency: 0.7 (records may be archived)
├── Priority: 0.9 × 0.8 × 0.7 = 0.504
└── Rank: 1

ACTION 2: Obtain Suresh's phone records
├── Information gain: 0.85 (would show communication pattern)
├── Feasibility: 0.7 (requires legal request)
├── Urgency: 0.6 (carrier may have limited retention)
├── Priority: 0.85 × 0.7 × 0.6 = 0.357
└── Rank: 2

ACTION 3: Request CCTV from Hotel Taj
├── Information gain: 0.7 (would confirm meeting)
├── Feasibility: 0.6 (hotel may have deleted footage)
├── Urgency: 0.8 (footage expires quickly)
├── Priority: 0.7 × 0.6 × 0.8 = 0.336
└── Rank: 3

ACTION 4: Identify unknown male
├── Information gain: 0.5 (may or may not be relevant)
├── Feasibility: 0.4 (difficult without more info)
├── Urgency: 0.3 (not time-sensitive)
├── Priority: 0.5 × 0.4 × 0.3 = 0.060
└── Rank: 4
```

---

## The Critic's Rules

```
RULE 1: NEVER write to analytical stores
        Read-only on all processing stores
        Only write to audit_store and investigator_actions_store
        ML stores (feature_store, gnn_predictions_store, bn_inference_store, adversarial_assessment_store, information_gain_store, explanation_store) are also read-only

BN FORMAT: See ML_ENGINE.md for BNInferenceResult format.

RULE 2: NEVER make legal conclusions
        "REASONABLE_SUSPICION" not "GUILTY"
        "ANALYTICAL CONFIDENCE" not "PROOF"

RULE 3: ALWAYS check independence
        Don't count dependent evidence twice
        Track provenance chains

RULE 4: ALWAYS consider alternatives
        What else could explain this?
        Am I suffering from confirmation bias?

RULE 5: ALWAYS note gaps
        What don't we know?
        What would change our assessment?

RULE 6: ALWAYS calibrate confidence
        Is the score too high or too low?
        What biases might affect it?

RULE 7: ALWAYS recommend actions
        What should the investigator do next?
        Prioritize by information gain

RULE 8: NEVER commit to single hypothesis
        Maintain alternatives
        Update as new evidence arrives

RULE 9: INFORMATION GAIN DRIVES ACTION
        Which missing evidence would most change relative probability of hypotheses?
        Prioritize that. Don't just say "more evidence required."

RULE 10: DECOMPOSE SUSPICIOUSNESS
         Never output single "SuspicionScore = 0.87"
         Decompose into: communication, geographic, financial, network, temporal
         Show alternatives. Show gaps. Show confidence.

RULE 11: FALSIFICATION DRIVES INVESTIGATION
         Every major hypothesis must have falsifiers.
         Actively look for evidence that would prove hypothesis wrong.
         Don't only look for supporting evidence.

RULE 12: EXPLAIN WHY THIS PERSON
         Never output "Person A — High Priority" without complete causal chain.
         Investigator must be able to attack the system's conclusion.

RULE 13: INVESTIGATIVE VALUE, NOT RAW INFORMATION GAIN
         Prioritize evidence that helps distinguish actionable competing explanations,
         not merely evidence that changes probabilities.

RULE 14: REPORT ATTENTION DISTRIBUTION
         Show how much investigative effort each entity received.
         Flag when confidence may reflect unequal attention.

RULE 15: NEGATIVE EVIDENCE REQUIRES ADEQUATE SEARCH
         Only CONFIRMED_ABSENCE can weaken hypotheses.
         UNCONFIRMED_ABSENCE is treated as UNKNOWN.
```

---

## Falsification Reasoning

The Critic actively seeks evidence that would prove its hypotheses wrong, not just supporting evidence.

### Why Falsification Matters

```
DANGEROUS:
  H1: Person A coordinated fraud (confidence: 0.72)
  Supporting: [evidence_1, evidence_2, evidence_3]
  
  System keeps finding more supporting evidence.
  Never looks for disconfirming evidence.
  Confirmation bias builds.

BETTER:
  H1: Person A coordinated fraud (confidence: 0.72)
  Supporting: [evidence_1, evidence_2, evidence_3]
  
  Falsifiers:
  ├── verified device possession by another person
  ├── reliable location evidence excluding A
  ├── independent evidence explaining A-B contact
  
  System actively looks for falsifiers.
  If found → hypothesis weakened or rejected.
  If not found → hypothesis survives (not confirmed, but survives).
```

### Falsification Process

```
FOR EACH MAJOR HYPOTHESIS:
├── 1. Identify falsifiers
│   └── What evidence would prove this hypothesis wrong?
│
├── 2. Check falsifier status
│   ├── Has this evidence been searched for?
│   ├── If found: what does it show?
│   └── If not found: was search adequate?
│
├── 3. Prioritize falsifier search
│   ├── High-impact falsifiers: search first
│   ├── Easy-to-find falsifiers: search if available
│   └── Impossible-to-find falsifiers: note limitation
│
├── 4. Update hypothesis based on falsifier status
│   ├── Falsifier found → weaken or reject hypothesis
│   ├── Falsifier searched but not found → note (if adequate search)
│   └── Falsifier not searched → note as gap
│
└── 5. Report falsification status
    ├── What would falsify this hypothesis?
    ├── What has been searched?
    ├── What remains unsearched?
    └── How fragile is this hypothesis to potential falsifiers?
```

### Falsification in Investigator Interface

```
INVESTIGATOR SEES:

Hypothesis H1: Person A coordinated fraud (confidence: 0.72)

Falsification Status:
├── Falsifier 1: "verified device possession by another person"
│   ├── Status: searched_not_found
│   ├── Search quality: comprehensive
│   └── Impact if found: reject_hypothesis
│
├── Falsifier 2: "reliable location evidence excluding A"
│   ├── Status: not_searched
│   ├── Search quality: unknown
│   └── Impact if found: reject_hypothesis
│
└── Falsifier 3: "independent evidence explaining A-B contact"
    ├── Status: searched_not_found
    ├── Search quality: partial
    └── Impact if found: weaken_hypothesis

Assumption: This hypothesis survives because key falsifiers
have not been found. But Falsifier 2 has not been searched.
Before concluding, search for location evidence excluding A.
```

---

## Investigative Value Optimization

The Critic prioritizes evidence by investigative value, not raw information gain.

### Why Investigative Value Matters

```
RAW INFORMATION GAIN:
  "This evidence would change H1 from 0.72 to 0.85"
  
  But:
  ├── Is this change actionable?
  ├── Does it help distinguish between competing explanations?
  ├── Is it practically obtainable?
  └── Does it address the real investigative question?

INVESTIGATIVE VALUE:
  "This evidence would help distinguish between:
   H1: A coordinated fraud
   H2: A was unknowing participant
   
   If evidence shows A knew about transactions:
   → H1 confidence increases, H2 decreases
   → Investigator can take action against A
   
   If evidence shows A was unaware:
   → H1 confidence decreases, H2 increases
   → Investigator should look elsewhere"
```

### Investigative Value Formula

```
InvestigativeValue(action) =
  expected_uncertainty_reduction
  × decision_relevance
  × feasibility
  × timeliness
  × preservation_risk

WHERE:
├── expected_uncertainty_reduction: how much uncertainty this reduces
├── decision_relevance: does this help make an actionable decision?
├── feasibility: can this evidence actually be obtained?
├── timeliness: how soon can this be obtained?
└── preservation_risk: is this evidence disappearing?

DECISION RELEVANCE measures:
├── Does this evidence distinguish between actionable alternatives?
├── Does this evidence address the primary investigative question?
├── Does this evidence help the investigator decide what to do next?
└── Or does this merely change abstract probabilities?
```

### Evidence Acquisition Priorities

```
PRIORITY MATRIX:

High investigative value + high feasibility = DO FIRST
├── Example: Bank statement (high info, easy to obtain)
└── Action: Obtain immediately

High investigative value + low feasibility = DO IF POSSIBLE
├── Example: Witness testimony (high info, witness may be unavailable)
└── Action: Attempt to obtain, note difficulty

Low investigative value + high feasibility = DO IF TIME PERMITS
├── Example: Additional CDR (low info, easy to obtain)
└── Action: Obtain if convenient

Low investigative value + low feasibility = SKIP
├── Example: Historical CCTV from unrelated location
└── Action: Don't pursue

HIGH PRESERVATION RISK = URGENT regardless of other factors
├── Example: CCTV footage that expires in 24 hours
├── Even if investigative value is moderate, must act quickly
└── Action: Obtain immediately or lose forever
```

---

## "Why This Person?" Explanation

The Critic must always explain why a person is flagged, with a complete causal chain the investigator can attack.

### Why This Explanation Matters

```
DANGEROUS:
  Person A — High Priority
  
  Investigator sees: "Why A? Why not B? Why not C?"
  Investigator cannot evaluate the system's reasoning.
  Investigator must either trust blindly or ignore the system.

BETTER:
  Person A — High Priority
  
  WHY A?
  1. Entity resolution: "Rakesh" in FIR resolved to Person A (confidence: 0.81)
  2. Relevant event: FIR #1234 describes fraud at Hotel X
  3. Evidence: CDR shows A called co-accused 45 times (Jan-Mar)
  4. Evidence: Bank shows A received ₹2,00,000 from co-accused
  5. Evidence: Surveillance shows A at Hotel X on 2024-03-15
  6. Independent sources: 3 (FIR, CDR, bank)
  7. Temporal consistency: all events align with fraud timeline
  8. Contradictions: none identified
  9. Alternative explanations: considered and addressed
  10. Missing evidence: bank statement for Suresh (addresses gap)
  
  WHAT WOULD FALSIFY THIS?
  ├── Verified A was not at Hotel X on 2024-03-15
  ├── Independent evidence A did not receive money
  └── Evidence A was coerced or unaware
  
  WHAT ASSUMPTIONS DOES THIS DEPEND ON?
  ├── Entity resolution is correct (A = "Rakesh" in FIR)
  ├── CDR attribution is correct (A possessed phone)
  └── Bank transaction is related to fraud (not legitimate)
  
  INVESTIGATOR CAN NOW:
  ├── Attack entity resolution
  ├── Attack CDR attribution
  ├── Attack bank transaction interpretation
  ├── Search for falsifiers
  └── Make informed decision
```

### Explanation Structure

```
PersonExplanation {
  entity_id:         string
  
  // STEP-BY-STEP REASONING
  reasoning_chain:   ReasoningStep[]
  
  // FALSIFICATION
  falsifiers:        Falsifier[]
  
  // ASSUMPTIONS
  assumptions:       Assumption[]
  
  // ALTERNATIVES
  alternative_explanations: string[]
  
  // MISSING EVIDENCE
  missing_evidence:  string[]
  
  // ATTENTION DISTRIBUTION
  attention_ratio:   float
  evidence来源:     object      // observational vs investigation-generated
}

ReasoningStep {
  step:              int         // step number
  claim:             string      // what this step establishes
  evidence:          string      // which evidence supports this
  confidence:        ConfidenceDecomposition
  vulnerability:     string      // how this step could be wrong
}
```

### Explanation Rules

```
RULE 1: Every "High Priority" entity must have a complete explanation.
        No bare "Person A — High Priority" without reasoning chain.

RULE 2: Every reasoning step must identify its vulnerability.
        "How could this step be wrong?"

RULE 3: Every assumption must be explicit.
        "What are we assuming that, if false, changes everything?"

RULE 4: The explanation must include what would falsify the conclusion.
        "What evidence would prove us wrong?"

RULE 5: The explanation must note attention distribution.
        "How much investigative effort did this entity receive?"

RULE 6: The explanation must separate observational from investigation-generated evidence.
        "How much evidence was found independently vs because we were looking?"
```

---

## Information Gain Calculation

The Critic's most powerful tool is information gain: which missing evidence would most reduce uncertainty over the hypothesis distribution?

### Why Single-Hypothesis Information Gain Is Wrong

```
DANGEROUS:
  "Information gain = |P(H1|E) - P(H1)|"
  
  This measures how much H1 changed.
  But it ignores the rest of the distribution.
  
  Example:
  H1: 0.60 → 0.70 (change = 0.10)
  H2: 0.25 → 0.15 (change = 0.10)
  H3: 0.10 → 0.10 (no change)
  H0: 0.05 → 0.05 (no change)
  
  Single-hypothesis view: H1 changed by 0.10.
  But H2 also changed. Distribution shifted.
  The investigator cares about the WHOLE distribution.

CORRECT:
  Information gain = H(P(H)) - H(P(H|E))
  
  This measures how much UNCERTAINTY over the ENTIRE distribution was reduced.
  High IG = evidence significantly changes relative probabilities.
  Low IG = evidence doesn't change much.
```

### Formal Definition

```
SHANNON ENTROPY of hypothesis distribution P:

H(P) = -∑_i P(Hi) × log₂(P(Hi))

Where:
├── Hi = hypothesis i
├── P(Hi) = probability of hypothesis i
└── H(P) = uncertainty in bits (0 = certain, log₂(N) = maximum uncertainty for N hypotheses)

INFORMATION GAIN of evidence E:

IG(E) = H(P(H)) - H(P(H|E))

Where:
├── H(P(H)) = entropy before observing E
├── H(P(H|E)) = entropy after observing E
└── IG(E) = how many bits of uncertainty reduced

EXPECTED INFORMATION GAIN (when we don't know what E would show):

EIG(E) = ∑_v P(E=v) × IG(E=v)

Where:
├── v = possible values of E
├── P(E=v) = probability we'd observe value v
└── IG(E=v) = information gain if we observed v
```

### Example Calculation

```
CURRENT STATE:
├── H1: fraud_ring, P(H1) = 0.72
├── H2: legitimate, P(H2) = 0.15
├── H3: coincidence, P(H3) = 0.08
├── H4: null, P(H4) = 0.05
└── Entropy H(P) = -0.72×log₂(0.72) - 0.15×log₂(0.15) - 0.08×log₂(0.08) - 0.05×log₂(0.05)
    = 0.37 + 0.41 + 0.29 + 0.22 = 1.29 bits

AFTER OBSERVING E1 (bank statement for Suresh):
├── H1: fraud_ring, P(H1|E1) = 0.85  (↑ money flow confirmed)
├── H2: legitimate, P(H2|E1) = 0.08  (↓ less likely)
├── H3: coincidence, P(H3|E1) = 0.05 (↓ less likely)
├── H4: null, P(H4|E1) = 0.02        (↓ less likely)
└── Entropy H(P|E1) = 0.27 + 0.29 + 0.22 + 0.14 = 0.92 bits

IG(E1) = 1.29 - 0.92 = 0.37 bits

AFTER OBSERVING E2 (unknown male identity):
├── H1: fraud_ring, P(H1|E2) = 0.73  (↑ slightly)
├── H2: legitimate, P(H2|E2) = 0.14  (↓ slightly)
├── H3: coincidence, P(H3|E2) = 0.08 (no change)
├── H4: null, P(H4|E2) = 0.05        (no change)
└── Entropy H(P|E2) = 1.26 bits

IG(E2) = 1.29 - 1.26 = 0.03 bits

RANKING: IG(E1) = 0.37 > IG(E2) = 0.03
→ E1 (bank statement) is much more informative than E2 (unknown male)
```

### Expected Information Gain With Uncertainty

```
RULE: Information gain accounts for uncertainty in what E would reveal.

For missing evidence E, we don't know what we'd find.
So we calculate EXPECTED information gain:

EIG(E) = ∑_v P(E=v) × IG(E=v)

EXAMPLE:
Bank statement for Suresh:
├── P(money_flow_to_Suresh) = 0.6 → IG = 0.45
├── P(no_money_flow) = 0.3 → IG = 0.35
├── P(mixed_transactions) = 0.1 → IG = 0.10
└── EIG = 0.6×0.45 + 0.3×0.35 + 0.1×0.10 = 0.39 bits

Unknown male identity:
├── P(relevant_person) = 0.2 → IG = 0.30
├── P(irrelevant_person) = 0.7 → IG = 0.02
├── P(known_associate) = 0.1 → IG = 0.15
└── EIG = 0.2×0.30 + 0.7×0.02 + 0.1×0.15 = 0.09 bits

RANKING: EIG(bank) = 0.39 > EIG(male) = 0.09
```

---

## Investigative Value Optimization

Raw information gain is not enough. The Critic optimizes for investigative value.

### Investigative Value Formula

```
InvestigativeValue(action) =
  EIG(action)
  × decision_relevance(action)
  × feasibility(action)
  × timeliness_modifier(action)

WHERE:
├── EIG: expected information gain over hypothesis distribution
├── decision_relevance: does this help make an actionable decision?
├── feasibility: can this evidence actually be obtained?
└── timeliness_modifier: incorporates preservation risk as urgency

TIMELINESS MODIFIER (not multiplicative with EIG):
timeliness_modifier = base_timeliness × preservation_risk_multiplier

WHERE:
├── base_timeliness: how soon can this be obtained? (0-1)
├── preservation_risk_multiplier:
│   ├── LOW: 1.0
│   ├── MEDIUM: 1.2
│   ├── HIGH: 1.5
│   └── CRITICAL: 2.0
└── Note: Preservation risk affects urgency, not information content
```

### Why Preservation Risk Is Not Multiplicative With EIG

```
DANGEROUS:
  "InvestigativeValue = EIG × feasibility × preservation_risk"
  
  This treats preservation risk as if it affects information content.
  But preservation risk affects URGENCY, not information.
  
  Example:
  CCTV footage that expires tomorrow:
  ├── EIG = 0.30 (moderate information)
  ├── preservation_risk = CRITICAL
  ├── If multiplicative: value = 0.30 × 1.0 × 2.0 = 0.60
  └── This overvalues low-information evidence

CORRECT:
  InvestigativeValue = EIG × decision_relevance × feasibility × timeliness_modifier
  
  WHERE:
  ├── EIG = 0.30 (unchanged — information is information)
  ├── decision_relevance = 0.7
  ├── feasibility = 0.9
  ├── timeliness_modifier = 1.0 × 2.0 = 2.0 (preservation risk increases urgency)
  └── value = 0.30 × 0.7 × 0.9 × 2.0 = 0.378
  
  The value reflects urgency, not inflated information.
  Investigator sees: "Moderate information, but urgent — obtain immediately."
```

### Decision Relevance

```
Decision relevance measures whether evidence helps make an actionable decision.

HIGH RELEVANCE:
├── Evidence distinguishes between actionable alternatives
├── "Bank statement shows money flow to Suresh"
│   ├── If yes: H1 increases, H2 decreases → investigate Suresh
│   └── If no: H1 decreases, H2 increases → look elsewhere
└── Investigator can decide: pursue Suresh or not

LOW RELEVANCE:
├── Evidence changes probabilities but not decisions
├── "Unknown male identity"
│   ├── If relevant: H1 increases slightly
│   └── If irrelevant: H1 decreases slightly
└── Investigator cannot decide: no clear action

RULE: High information gain + low decision relevance = moderate priority
      High information gain + high decision relevance = high priority
```

### Evidence Acquisition Priorities

```
PRIORITY MATRIX:

High EIG + high relevance + high feasibility = DO FIRST
├── Example: Bank statement (high info, actionable, easy to obtain)
└── Action: Obtain immediately

High EIG + high relevance + low feasibility = DO IF POSSIBLE
├── Example: Witness testimony (high info, actionable, witness may be unavailable)
└── Action: Attempt to obtain, note difficulty

High EIG + low relevance + high feasibility = DO IF TIME PERMITS
├── Example: Additional CDR (high info, but doesn't change decision)
└── Action: Obtain if convenient

Low EIG + low relevance + low feasibility = SKIP
├── Example: Historical CCTV from unrelated location
└── Action: Don't pursue

HIGH PRESERVATION RISK = URGENT regardless of other factors
├── Example: CCTV footage that expires in 24 hours
├── Even if EIG is moderate, must act quickly
└── Action: Obtain immediately or lose forever
```

---

## Confidence Auditing

The Critic does NOT silently adjust confidence scores. It audits them: detects problems, explains what's wrong, and recommends recalculation.

### What Confidence Auditing Does

```
INPUT: All hypothesis confidence values + their derivation chains

CHECK 1: DEPENDENCY INFLATION
├── Are multiple supporting evidence items from the same dependency_group?
├── If yes → flag as possibly inflated
├── Explain: "H1 has confidence 0.74, but 3 of 4 supporting items share dependency_group grp_001"
└── Recommend: "Recalculate using independent source count (2, not 4)"

CHECK 2: OVERCONFIDENCE
├── Is hypothesis_confidence > 0.95 with single source?
├── If yes → flag as overconfident
├── Explain: "H1 has confidence 0.97, but only 2 independent sources"
└── Recommend: "Reduce confidence to reflect limited independent confirmation"

CHECK 3: UNDERCONFIDENCE
├── Is hypothesis_confidence < 0.30 with strong independent evidence?
├── If yes → flag as possibly underconfident
├── Explain: "H2 has confidence 0.15, but 4 independent sources support it"
└── Recommend: "Consider if null hypothesis is being given too much weight"

CHECK 4: STALE CONFIDENCE
├── Is hypothesis_confidence based on old run?
├── If yes → flag as stale
├── Explain: "H1 confidence 0.72 is from run_001 (3 days ago)"
└── Recommend: "Re-run pipeline to incorporate new evidence"

CHECK 5: CALIBRATION DRIFT
├── Is hypothesis_confidence systematically different from empirical accuracy?
├── If yes → flag as miscalibrated
├── Explain: "System outputs confidence 0.80 for hypotheses, but only 60% are confirmed"
└── Recommend: "Adjust calibration parameters"

CHECK 6: PROVENANCE DEPTH
├── Is hypothesis_confidence derived from deep inferences?
├── If yes → flag as uncertain
├── Explain: "H1 confidence 0.72 is based on inferences at depth 4"
└── Recommend: "Note that confidence may be less reliable for deep inferences"
```

### What Confidence Auditing Does NOT Do

```
DOES NOT:
├── Silently adjust scores
├── Overwrite confidence values without explanation
├── Replace human judgment
└── Make legal conclusions

DOES:
├── Detect problems
├── Explain what's wrong
├── Recommend recalculation
├── Log all adjustments with reasons
└── Leave final decision to investigator
```

### Audit Report Structure

```
ConfidenceAudit {
  hypothesis_id:      string
  current_confidence: float
  run_id:             string
  derivation_chain:   object      // full chain from raw evidence to hypothesis
  
  checks: {
    dependency_inflation: {
      detected:       boolean
      evidence_count: int
      independent_count: int
      impact:         string      // "none" / "moderate" / "significant"
      explanation:    string
      recommendation: string
    }
    overconfidence: {
      detected:       boolean
      source_count:   int
      impact:         string
      explanation:    string
      recommendation: string
    }
    stale_confidence: {
      detected:       boolean
      run_age_days:   int
      impact:         string
      explanation:    string
      recommendation: string
    }
    calibration_drift: {
      detected:       boolean
      empirical_accuracy: float
      predicted_confidence: float
      impact:         string
      explanation:    string
      recommendation: string
    }
    provenance_depth: {
      detected:       boolean
      avg_depth:      float
      impact:         string
      explanation:    string
      recommendation: string
    }
  }
  
  overall_assessment: string
  recommended_action: string  // "none" / "recalculate" / "flag_for_review" / "manual_review"
}
```

---

## Information Gain Over Hypothesis Distribution

Information gain is defined over the entire hypothesis distribution, not a single hypothesis.

### Formal Definition

```
INFORMATION GAIN of evidence E:

IG(E) = H(P(H)) - H(P(H|E))

Where:
├── H(P(H)) = entropy of current hypothesis distribution
├── H(P(H|E)) = entropy of hypothesis distribution after observing E
├── H(X) = -∑ p(x) log₂(p(x))  (Shannon entropy)
└── IG(E) = how much uncertainty is reduced by observing E

RULE: Information gain measures how much E distinguishes between hypotheses.
      High IG = evidence significantly changes relative probabilities.
      Low IG = evidence doesn't change much.
```

### Example Calculation

```
CURRENT STATE:
├── H1: fraud_ring, P(H1) = 0.72
├── H2: legitimate, P(H2) = 0.15
├── H3: coincidence, P(H3) = 0.08
├── H4: null, P(H4) = 0.05
└── Entropy H(P) = -0.72*log₂(0.72) - 0.15*log₂(0.15) - 0.08*log₂(0.08) - 0.05*log₂(0.05)
    = 0.37 + 0.41 + 0.29 + 0.22 = 1.29 bits

AFTER OBSERVING E1 (bank statement for Suresh):
├── H1: fraud_ring, P(H1|E1) = 0.85  (↑ money flow confirmed)
├── H2: legitimate, P(H2|E1) = 0.08  (↓ less likely)
├── H3: coincidence, P(H3|E1) = 0.05 (↓ less likely)
├── H4: null, P(H4|E1) = 0.02        (↓ less likely)
└── Entropy H(P|E1) = 0.27 + 0.29 + 0.22 + 0.14 = 0.92 bits

IG(E1) = 1.29 - 0.92 = 0.37 bits

AFTER OBSERVING E2 (unknown male identity):
├── H1: fraud_ring, P(H1|E2) = 0.73  (↑ slightly)
├── H2: legitimate, P(H2|E2) = 0.14  (↓ slightly)
├── H3: coincidence, P(H3|E2) = 0.08 (no change)
├── H4: null, P(H4|E2) = 0.05        (no change)
└── Entropy H(P|E2) = 1.26 bits

IG(E2) = 1.29 - 1.26 = 0.03 bits

RANKING: IG(E1) = 0.37 > IG(E2) = 0.03
→ E1 (bank statement) is much more informative than E2 (unknown male)
```

### Information Gain With Uncertainty

```
RULE: Information gain accounts for uncertainty in what E would reveal.

For missing evidence E, we don't know what we'd find.
So we calculate EXPECTED information gain:

EIG(E) = ∑_v P(E=v) × IG(E=v)

Where:
├── v = possible values of E
├── P(E=v) = probability we'd observe value v
└── IG(E=v) = information gain if we observed v

EXAMPLE:
Bank statement for Suresh:
├── P(money_flow_to_Suresh) = 0.6 → IG = 0.45
├── P(no_money_flow) = 0.3 → IG = 0.35
├── P(mixed_transactions) = 0.1 → IG = 0.10
└── EIG = 0.6×0.45 + 0.3×0.35 + 0.1×0.10 = 0.39 bits

Unknown male identity:
├── P(relevant_person) = 0.2 → IG = 0.30
├── P(irrelevant_person) = 0.7 → IG = 0.02
├── P(known_associate) = 0.1 → IG = 0.15
└── EIG = 0.2×0.30 + 0.7×0.02 + 0.1×0.15 = 0.09 bits

RANKING: EIG(bank) = 0.39 > EIG(male) = 0.09
```

---

## LLM Validation in the Critic

The Critic may use LLMs for interpretation, but every LLM output must be validated.

### What the Critic Uses LLMs For

```
PERMITTED:
├── Interpret contradictions in natural language
├── Explain why evidence might support/contradict hypotheses
├── Formulate investigator questions
├── Generate natural language summaries
├── Compare competing explanations
└── Suggest investigative actions

NOT PERMITTED:
├── Invent evidence
├── Invent source IDs
├── Invent graph edges
├── Invent timestamps
├── Invent provenance chains
├── Silently alter confidence scores
├── Convert hypothesis → observation
├── Create entities not in stores
├── Create relationships not in stores
└── Modify audit trail
```

### Validation Rules

```
RULE 1: REFERENCE CHECK
Every LLM output must reference existing IDs:
├── evidence_id
├── entity_id
├── event_id
├── hypothesis_id
├── contradiction_id
└── gap_id

VALIDATOR: Do all referenced IDs exist in stores?
IF no → reject output, log violation

RULE 2: NO INVENTION CHECK
LLM output must not contain:
├── New entity IDs not in stores
├── New relationship edges not in stores
├── New timestamps not in stores
├── New provenance chains not in stores
└── New confidence scores not derived from existing data

VALIDATOR: Does LLM invent any new data?
IF yes → reject output, log violation

RULE 3: CONFIDENCE INTEGRITY CHECK
LLM output must not:
├── Modify confidence scores
├── Convert hypothesis confidence to observation confidence
├── Skip provenance tracking
└── Alter audit trail

VALIDATOR: Does LLM modify any confidence values?
IF yes → reject output, log violation

RULE 4: PROVENANCE CHECK
Every claim in LLM output must trace to:
├── An evidence edge
├── A store query
├── A policy rule
└── A previous LLM output (which itself traces to the above)

VALIDATOR: Can every claim be traced to existing data?
IF no → reject output, log violation
```

### Validation Response

```
LLMValidation {
  input:              object      // LLM request
  output:             object      // LLM response
  validated:          boolean     // passed all checks?
  violations:         string[]    // list of violations found
  reference_check:    boolean     // all IDs exist?
  invention_check:    boolean     // no new data invented?
  confidence_check:   boolean     // no confidence modification?
  provenance_check:   boolean     // all claims traceable?
  
  IF validated:
  ├── Process LLM output
  └── Log as validated LLM reasoning
  
  IF NOT validated:
  ├── Reject LLM output
  ├── Log violation details
  ├── Fall back to deterministic reasoning
  └── Alert investigator
}
```

### LLM Audit Trail

```
Every LLM interaction is logged:

LLMInteraction {
  interaction_id:     string
  timestamp:          datetime
  case_id:            string
  run_id:             string
  
  request: {
    prompt:           string
    context:          object      // what data was provided
    task:             string      // "interpret" / "explain" / "summarize"
  }
  
  response: {
    raw_output:       string
    validated:        boolean
    violations:       string[]
  }
  
  validation:         LLMValidation
  
  downstream_effect:  string      // what was affected by this output
}

RULE: LLM audit trail is immutable.
      Never delete or modify LLM interaction logs.
```
