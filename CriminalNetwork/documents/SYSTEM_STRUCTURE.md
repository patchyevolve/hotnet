# SYSTEM STRUCTURE — Definitive Architecture

> The system is built on one rule: **never upgrade an inference into an observation.**
> Everything else follows from this.

---

## The One Rule

```
THE SYSTEM MAY:
├── Increase confidence of a hypothesis
├── Generate new hypotheses
├── Identify patterns
├── Detect anomalies
├── Suggest investigative actions

THE SYSTEM MUST NEVER:
├── Upgrade an inference into an observation
├── Treat derived evidence as independent
├── Collapse uncertainty into false certainty
├── Use its own output as independent input
├── Make legal conclusions from analytical scores
```

---

## The Five Interacting Analytical Models

The system is built on five interacting analytical models, not one graph. Each model serves a distinct purpose. Reasoning operates across all five.

```
                    ┌─────────────────────┐
                    │     REAL WORLD      │
                    └──────────┬──────────┘
                               │
                         observations
                               ↓
             ┌────────────────────────────────┐
             │       1. EVIDENCE MODEL        │
             │ entities / events / relations  │
             └───────────────┬────────────────┘
                             │
             ┌───────────────┴────────────────┐
             ↓                                ↓
┌────────────────────────┐       ┌────────────────────────┐
│ 2. PROVENANCE MODEL    │       │ 3. COVERAGE MODEL      │
│ where claims came from │       │ what was/wasn't seen   │
└────────────┬───────────┘       └────────────┬───────────┘
             │                                │
             └───────────────┬────────────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 4. ENTITY STATE      │
                  │ identity uncertainty │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │ 5. HYPOTHESIS &      │
                  │ INVESTIGATION MODEL  │
                  │ competing theories   │
                  └──────────────────────┘
```

### Why Five Models

A single graph cannot distinguish between:
- What we know vs how we know it
- What we observed vs what we didn't
- What's certain vs what's uncertain
- What's independent vs what's derived

The five models separate these concerns so reasoning can operate correctly across all of them. They may be implemented as separate stores, separate graph projections, or separate layers within a single graph database — the implementation choice is independent of the analytical separation.

### Stage → Model Mapping

Each implementation stage contributes to one or more analytical models:

```
Stage 1: Ingestion     → Model 1 (Evidence Model)
Stage 2: Extraction    → Model 1 (Evidence Model)
Stage 3: Resolution    → Model 2 (Provenance) + Model 3 (Coverage) + Model 4 (Entity State)
Stage 4: Temporal      → Model 2 (Provenance) + Model 3 (Coverage)
Stage 5: Graph Build   → Model 4 (Entity State) + Model 5 (Hypothesis)
Stage 6: Analytics     → Model 5 (Hypothesis & Investigation)
Stage 7: Hypothesis    → Model 5 (Hypothesis & Investigation) [implemented]
Stage 8: Contradiction → Model 5 (Hypothesis & Investigation) [implemented]
Stage 9: Gap Detection → Model 5 (Hypothesis & Investigation) [implemented]
Stage 10: Critic       → Reads ALL models (read-only), writes audit
```

A single stage may populate multiple models because the same data serves different analytical purposes. For example, Stage 3 (Resolution) produces:
- Provenance data: "this entity was derived from these sources" (Model 2)
- Coverage data: "this entity has no data for time period X" (Model 3)
- Entity state: "this unknown entity might be Person A" (Model 4)

The five-model split is analytical. Implementation may use one Neo4j database with labeled partitions, or separate stores per model.

---

## 6. Multi-Case Architecture (3-Layer Design)

The system supports multi-case, multi-jurisdiction processing through three layers:

### Layer 1: Jurisdiction Hierarchy
- JurisdictionNode: configurable tree (NATION → STATE_UT → COMMISSIONERATE → RANGE → DISTRICT → CITY → ZONE → DIVISION → SUB_DIVISION → POLICE_STATION → OUT_POST)
- Level derived at query time, not stored
- GeographicJurisdiction: separate from organizational hierarchy
- UnresolvedJurisdiction: parser outputs create unresolved records for human resolution
- Historical jurisdiction: nodes get valid_to on reorganization; cases stay linked to originals

### Layer 2: Global Entity Identity Index
- GlobalEntity: canonical entity across all Cases (identity/linking only, NOT a graph)
- GlobalEntityLink: links global entity to local entity in a specific Case
- CrossCaseAlert: generated when entity appears in multiple Cases/jurisdictions
- Uses junction table CrossCaseAlertCase for proper FK constraints

### Layer 3: Scoped Analytical Graphs
- Local Graphs: built per Case by Stage 5, stored permanently
- Scoped Graphs: computed on-demand from local graphs + global identity links
- Merge process: GlobalEntity identity links identify same-entity nodes across Cases
- Each merged edge carries source_case_ids for provenance

### FIR Lifecycle (Revision 3+)

FIR has three independent lifecycle dimensions (replaces single `status` field):

- **investigation_status**: Tracks investigation progress (e.g., OPEN, UNDER_INVESTIGATION, CHARGE_SHEET_FILED, CLOSED)
- **legal_disposition**: Tracks legal outcome (e.g., PENDING, ABETTED, DISMISSED, CONVICTED, ACQUITTED)
- **record_status**: Tracks data record state (e.g., ACTIVE, SUPERSEDED, ARCHIVED)

FIR lifecycle is independent from CaseRelationship, Workspace, and AnalysisRun. FIR number uniqueness is jurisdiction-scoped: `@@unique([firNumber, jurisdictionNodeId])`.

### Case ↔ FIR Invariant

Case and FIR have a 1:1 relationship. FIR.caseId is unique. One Case maps to exactly one FIR.

### Designed-But-Not-Implemented Entities (Revision 3+)

The following entities are designed but not yet implemented:

- **CaseRelationship** / **CaseRelationshipHistory**: Links related cases; history tracks relationship changes over time
- **CaseAccess**: Authorization model controlling who can access a Case
- **InvestigationWorkspace** / **WorkspaceCase** / **WorkspaceMember**: Organizes investigative work; workspace members are assigned cases
- **AnalysisRun** / **AnalysisRunCase** / **AnalysisRunResult**: AnalysisRun is an immutable historical execution (separate from PipelineRun). Input snapshots are stored in AnalysisRunResult. AnalysisRunCase links runs to cases
- **Finding**: Structured findings from analysis runs
- **FIRLifecycleHistory**: Audit trail of FIR lifecycle dimension changes

---

## The 15 Failure Modes

The system must guard against these failure modes. Each one can produce a convincing but wrong investigation.

```
FAILURE MODE 1: EVIDENCE INDEPENDENCE
Multiple records may originate from one observation.
Example: Police report → News article → Social media → Investigator note
System sees 4 confirmations. Reality: 1 original observation.
SOLUTION: Provenance graph tracks derivation. Confidence based on independent sources, not count.

FAILURE MODE 2: OBSERVATION COVERAGE
"No record" ≠ "record proves no event."
Example: CDR gap 10:30-12:00. System shouldn't say "no activity."
It should say "OBSERVATION COVERAGE: unknown."
SOLUTION: Coverage model tracks intervals with status: OBSERVED / NOT_OBSERVED / NOT_SEARCHED / UNKNOWN / UNAVAILABLE / DESTROYED.

FAILURE MODE 3: INFERENCE LINEAGE
ML inference reused as independent evidence.
Example: System infers A is suspicious → uses that inference to strengthen B's suspicion → B's suspicion strengthens A.
SOLUTION: Inference cannot corroborate another inference from same evidence chain. Enforced computationally.

FAILURE MODE 4: BACKGROUND RATES
Unusual behavior vs behavior common in that environment.
Example: A and B near location X. Individual baseline: unusual. Population baseline: 10,000 people visit X daily. Co-location isn't interesting.
SOLUTION: Three baselines: individual + population + environmental.

FAILURE MODE 5: EVENT DEDUPLICATION
Multiple observations may describe the same event.
Example: "A met B at 15:00" + "A was seen with B at 15:00" = same event, not two events.
SOLUTION: Event identity model. Multiple evidence → one event, not multiple events.

FAILURE MODE 6: IDENTITY UNCERTAINTY PROPAGATION
Uncertain entity resolution must remain uncertain downstream.
Example: UnknownPerson42 ≈ Person A (confidence 0.71). Don't rewrite graph as if certain.
SOLUTION: possible_identity link, not merge. Confidence propagates through all downstream.

FAILURE MODE 7: RELATIONSHIP SEMANTICS
Ownership, usage, possession, registration, communication, observation must not collapse into "association."
Example: A owns vehicle V, B drives V, C registered V, D insured V. Four different relationships.
SOLUTION: Specific relationship types: REGISTERED_OWNER, ACTUAL_USER, DRIVER, PURCHASER, INSURER, PASSENGER.

FAILURE MODE 8: TEMPORAL CAUSALITY
"A happened before B" must not become "A caused B."
Example: Money transfer before crime. Could be financing OR ordinary scheduled payment.
SOLUTION: Distinguish TEMPORAL_PRECEDENCE from CAUSAL_RELATION. Causal claims require stronger evidence.

FAILURE MODE 9: CROSS-CASE CONTAMINATION
Shared entities do not automatically imply shared criminal activity.
Example: A appears in Case 1 and Case 2. Doesn't mean cases are related.
SOLUTION: Case-scoped edge validity. Entity in multiple cases ≠ cases connected.

FAILURE MODE 10: ADVERSARIAL GRAPH POISONING
Observed relationships may be intentionally created to mislead.
Example: Criminal creates fake communication trail to frame innocent person.
SOLUTION: Anomaly detection for artificial graph structures. Flag edges that don't fit natural patterns.

FAILURE MODE 11: INVESTIGATION FEEDBACK LOOPS
System's own recommendations bias later data.
Example: System flags A → investigators focus on A → more evidence found for A → A looks more suspicious.
SOLUTION: Distinguish observational data from investigation-generated data. Track data origin.

FAILURE MODE 12: HYPOTHESIS COMPETITION
System must maintain multiple explanations, not optimize for first suspicious pattern.
Example: System finds fraud pattern → commits to fraud hypothesis → ignores innocent explanation.
SOLUTION: Always maintain null hypothesis + alternatives. Never commit to single explanation.

FAILURE MODE 13: INFORMATION GAIN
Prioritize missing evidence that can discriminate between competing explanations.
Example: "More evidence required" is useless. "Bank statement for Suresh would distinguish H1 from H2" is actionable.
SOLUTION: Information gain scoring. Which missing evidence would most change relative probability of hypotheses?

FAILURE MODE 14: EXCULPATORY EVIDENCE
Contradictory evidence must have equal structural status to supporting evidence.
Example: System tracks supporting evidence but not evidence that could clear someone.
SOLUTION: Exculpatory evidence check at every stage. What would prove innocence? Have we looked?

FAILURE MODE 15: LEGAL/EVIDENTIARY SEPARATION
Analytical confidence must never silently become a legal conclusion.
Example: System confidence 0.87 → displayed as "likely guilty."
SOLUTION: "REASONABLE_SUSPICION" not "GUILTY." "ANALYTICAL CONFIDENCE" not "PROOF."
```

---

## Multiplexity (von Lampe, 2026)

Criminals are connected through multiple layers of different kinds of ties. The same two people may be connected through:
- Communication (CDR)
- Financial (bank transfers)
- Social (family, friendship)
- Criminal (co-offending)
- Geographic (same location)

These are not the same relationship. They serve different functions.

### Three-Function Model (von Lampe, 2026)

```
ENTREPRENEURIAL (business/profit)
├── Purpose: Making money
├── Logic: Mutual profit
├── Recruitment: Skills, connections
├── Interaction: Frequent, transactional
├── Violence: Counterproductive (drives partners away)
└── Structure: Fragmented, ephemeral, undiversified

ASSOCIATIONAL (social/bonding)
├── Purpose: Trust, reputation, social bonds
├── Logic: Male bonding, shared identity
├── Recruitment: Personal qualities, reputation
├── Interaction: Regular, social
├── Violence: May be required for status
└── Structure: Cohesive, persistent

QUASI-GOVERNMENTAL (governance/enforcement)
├── Purpose: Setting rules, adjudicating disputes
├── Logic: Power, control, order
├── Recruitment: Reputation, ability to use violence
├── Interaction: Infrequent (once established)
├── Violence: Reputation for violence, not actual use
└── Structure: Centralized, hierarchical

UPPERWORLD BRIDGES (legitimate sphere)
├── Purpose: Protection, money laundering, cover
├── Logic: Corruption, mutual benefit
├── Recruitment: Position, vulnerability, greed
├── Interaction: Infrequent, discreet
├── Violence: Indirect (political, economic)
└── Structure: Hidden, deniable
```

### Why Multiplexity Matters

```
Same two people, different relationship types:

Rakesh ←──called──→ Suresh          (communication)
Rakesh ←──paid──→ Suresh            (financial)
Rakesh ←──family──→ Suresh          (social)
Rakesh ←──co_offended──→ Suresh     (criminal)

These are FOUR DIFFERENT relationships.
They have different:
├── Functions (why they exist)
├── Persistence (how long they last)
├── Visibility (how likely to be observed)
├── Strength (how resilient to disruption)
└── Meaning (what they tell us about criminal activity)

If we collapse them into "associated," we lose all this information.
```

### Cross-Domain Multiplexity

```
CRIMINAL DOMAIN ←→ PERSONAL DOMAIN ←→ LEGITIMATE DOMAIN

Example:
├── Criminal: Rakesh and Suresh co-offend (entrepreneurial)
├── Personal: Rakesh and Suresh are cousins (associational)
├── Legitimate: Rakesh owns a shop that launders money (upperworld bridge)

The boundaries between these domains are blurred.
The same tie (family relationship) serves multiple functions.
```

---

## Layer 1: Evidence Graph

### Purpose
Stores what we know — entities, events, and relationships extracted from raw data.

### Components

```
EVIDENCE GRAPH
├── Nodes (entities and events)
│   ├── Person
│   ├── Phone
│   ├── Vehicle
│   ├── Location
│   ├── Account
│   ├── Organization
│   ├── Event
│   └── UnknownEntity
│
└── Edges (relationships)
    ├── called
    ├── met_at
    ├── owns
    ├── registered_owner
    ├── actual_user
    ├── driver
    ├── transferred_to
    ├── family_of
    ├── works_with
    ├── associate_of
    ├── suspects
    ├── victims
    ├── witnesses
    └── ... (role-specific types)
```

### Rules

```
RULE 1: Every edge has a source.
        No edge without provenance.

RULE 2: Every edge has a confidence score.
        No binary exists/doesn't exist.

RULE 3: Every edge has temporal bounds.
        Relationships expire.

RULE 4: Every edge has relationship semantics.
        Not just "associated" — specific role.

RULE 5: Missing edges are tracked.
        "No observation" ≠ "relationship absent."
```

### Relationship Semantics (Three-Function Model)

Based on von Lampe (2026), criminal ties serve three distinct functions. Each function has different properties.

```
ENTREPRENEURIAL (business/profit)
├── Purpose: Making money
├── Persistence: LOW (transactional, dissolves when profit ends)
├── Visibility: HIGH (frequent transactions, observable)
├── Violence: Counterproductive
├── Structure: Fragmented, ephemeral
├── Detection probability: HIGH (lots of activity to observe)
└── Examples: business_partner, supplier, customer, distributor, money_launderer

ASSOCIATIONAL (social/bonding)
├── Purpose: Trust, reputation, social bonds
├── Persistence: HIGH (personal bonds endure)
├── Visibility: MEDIUM (social gatherings, shared activities)
├── Violence: May be required for status
├── Structure: Cohesive, persistent
├── Detection probability: MEDIUM (social events less frequent)
└── Examples: family_member, friend, club_member, neighbor, schoolmate

QUASI-GOVERNMENTAL (governance/enforcement)
├── Purpose: Setting rules, adjudicating disputes
├── Persistence: VERY HIGH (once established, lasts years)
├── Visibility: LOW (infrequent interaction, reputation-based)
├── Violence: Reputation for violence, not actual use
├── Structure: Centralized, hierarchical
├── Detection probability: LOW (rare observable events)
└── Examples: dispute_adjudicator, rule_setter, enforcer, protector

UPPERWORLD BRIDGES (legitimate sphere)
├── Purpose: Protection, money laundering, cover
├── Persistence: MEDIUM (depends on political cycles)
├── Visibility: VERY LOW (hidden, deniable)
├── Violence: Indirect (political, economic)
├── Structure: Hidden, deniable
├── Detection probability: VERY LOW (deliberately concealed)
└── Examples: political_backer, corrupt_official, legitimate_front
```

### Relationship Opportunity Modeling

An edge should be evaluated against: "How likely was this relationship to happen anyway?"

```
OBSERVED INTERACTION / EXPECTED INTERACTION = ANOMALY SCORE

Example 1:
A called B 5 times.
If A and B have communicated 2,000 times over 3 years:
  → 5 calls is NORMAL (expected interaction is high)
  → Anomaly score: LOW

Example 2:
A called B 5 times.
If A and B have NEVER communicated before:
  → 5 calls is SUSPICIOUS (expected interaction is zero)
  → Anomaly score: HIGH

RULE: Edge anomaly = observed / expected, not just interaction count.
```

### Temporal Decay Per Relationship Type

Not all relationships decay at the same rate.

```
RELATIONSHIP TYPE         DECAY RATE        PERSISTENCE
FAMILY_OF                 extremely slow     years/decades
ASSOCIATIONAL             slow               months/years
BUSINESS_PARTNER          medium             months
PHONE_CONTACT             fast               weeks/months
CO_OFFENDED               medium             months
TEMPORARY_AD_HOC          very fast          days/weeks

RULE: Decay rate depends on relationship semantics.
      Don't apply uniform decay to all edges.
```

### Suspiciousness Decomposition

Never output a single "SuspicionScore = 0.87." Decompose into components.

```
ANOMALY DECOMPOSITION:
├── communication deviation: 0.81
│   ├── call frequency vs baseline
│   ├── new contacts vs typical
│   └── timing pattern deviation
├── geographic deviation: 0.73
│   ├── location pattern vs baseline
│   ├── co-location with known subjects
│   └── travel pattern deviation
├── financial deviation: 0.21
│   ├── transaction frequency vs baseline
│   ├── amount patterns
│   └── counterparty changes
├── network centrality: 0.66
│   ├── degree centrality
│   ├── betweenness centrality
│   └── community position
└── temporal synchronization: 0.78
    ├── activity timing correlation with others
    ├── meeting pattern coordination
    └── communication burst alignment

HYPOTHESIS ASSESSMENT:
├── H1: Financial fraud ring (confidence: 0.72)
│   ├── supporting: edge_001, edge_005, ano_001
│   ├── contradicting: edge_003
│   ├── missing: bank_statement_Suresh
│   └── alternatives: H2, H3
├── H2: Legitimate business (confidence: 0.15)
├── H3: Coincidence (confidence: 0.08)
└── Null: Nothing criminal (confidence: 0.05)

RULE: Prevent signals from collapsing into one magical score.
      Always decompose. Always show alternatives.
```

---

## Layer 2: Provenance Graph

### Purpose
Tracks where every claim came from. Prevents inference lineage contamination.

### Components

```
PROVENANCE GRAPH
├── Nodes (evidence lifecycle stages)
│   ├── RawEvidence (original data)
│   ├── ExtractedEntity (NER output)
│   ├── ExtractedRelation (relation extraction output)
│   ├── ResolvedEntity (deduplicated entity)
│   ├── EvidenceEdge (graph edge)
│   ├── Inference (ML/analytics output)
│   │   ├── GNNPrediction (GNN model output)
│   │   ├── BNInference (Bayesian network output)
│   │   ├── AdversarialAssessment (adversarial detection output)
│   │   └── InformationGain (information gain calculation)
│   └── Hypothesis (reasoning output)
│
└── Edges (derivation chain)
    ├── extracted_from
    ├── derived_from
    ├── inferred_from
    │   ├── inferred_by_gnn
    │   ├── inferred_by_bn
    │   └── detected_by_adversarial
    └── hypothesized_from
```

### Rules

```
RULE 1: Every node traces back to RawEvidence.
        No claim without original source.

RULE 2: Depth is tracked.
        How many steps from raw observation?

RULE 3: Independence is tracked.
        Is this node based on its own original source?

RULE 4: An inference cannot corroborate another inference
        from the same evidence chain.

RULE 5: Maximum inference depth is configurable.
        Default = 5. Beyond that, confidence decays rapidly.
        Policy version tracked. Different cases may use different depths.
```

### Dependency Types

```
INDEPENDENT: Has its own original source
├── CDR record (automated, objective)
├── Bank record (automated, objective)
├── CCTV footage (automated, visual)
└── Device extraction (automated, forensic)

DEPENDENT: Derived from another source
├── News article (from police report)
├── Social media post (from news article)
├── Investigator note (from multiple sources)
└── ML inference (from extracted data)

MIXED: Partly independent, partly dependent
├── FIR (narrative is subjective, but may reference objective data)
└── Surveillance report (agent observation, but may reference CDR)
```

---

## Layer 3: Coverage Model

### Purpose
Tracks what was observed and what was not. Distinguishes "nothing observed" from "nothing happened."

### Components

```
COVERAGE MODEL
├── Temporal Coverage (per entity, per source)
│   ├── Intervals with status
│   │   ├── OBSERVED (data available)
│   │   ├── NOT_OBSERVED (searched, found nothing)
│   │   ├── NOT_SEARCHED (haven't looked)
│   │   ├── UNKNOWN (no data exists)
│   │   ├── UNAVAILABLE (data exists, can't access)
│   │   └── DESTROYED (data existed, now gone)
│   └── Coverage ratio (observed / total)
│
├── Spatial Coverage (per location)
│   ├── Camera coverage
│   ├── Tower coverage
│   └── Gaps in coverage
│
└── Source Coverage (per data type)
    ├── CDR completeness
    ├── Bank record completeness
    ├── FIR completeness
    └── Overall data completeness
```

### Rules

```
RULE 1: "No record" ≠ "record proves no event."
        Always distinguish absence of evidence from evidence of absence.

RULE 2: Coverage ratio is computed.
        What percentage of time/space is covered?

RULE 3: Gaps are explicit.
        "10:30-12:00: CDR gap, activity unknown."

RULE 4: Coverage affects confidence.
        Low coverage = low confidence in completeness.
```

### Background Rates

```
INDIVIDUAL BASELINE
├── What's normal for THIS person?
├── Avg calls/day, avg transactions/month
├── Typical locations, typical contacts
└── Typical hours

POPULATION BASELINE
├── What's normal for EVERYONE in this environment?
├── Location foot traffic (10,000 people visit Hotel Taj daily)
├── Call patterns for demographic
└── Transaction patterns for area

ENVIRONMENTAL BASELINE
├── What's normal for THIS context?
├── Time of day factor (more calls during business hours)
├── Day of week factor (less activity on Sundays)
├── Seasonal factor (festivals = more activity)
└── Location traffic factor (station area = high traffic)

RULE: Always compare against all three baselines.
      Individual anomaly + population normal = not interesting.
      Individual anomaly + population anomaly = potentially interesting.
```

---

## Layer 4: Entity State Model

### Purpose
Tracks identity uncertainty without contaminating the graph.

### Components

```
ENTITY STATE MODEL
├── Identity Resolution
│   ├── ResolvedEntity (deduplicated)
│   ├── UnknownEntity (unresolved)
│   ├── Merge confidence
│   ├── Contradictions in resolution
│   └── Resolution history
│
├── Role Assignment
│   ├── Per-event roles (suspect, witness, victim, associate)
│   ├── Per-relationship roles (owner, user, driver, etc.)
│   └── Role confidence
│
└── Uncertainty Propagation
    ├── When traversing from uncertain entity
    ├── All downstream inferences reduced by confidence
    └── Never rewrite graph
```

### Rules

```
RULE 1: Entity resolution is probabilistic.
        Never merge with 100% certainty unless government ID match.

RULE 2: UnknownEntity nodes are preserved.
        Don't force into known entity.

RULE 3: Resolution confidence propagates.
        If entity resolved at 0.71, all downstream inferences × 0.71.

RULE 4: Contradictions in resolution are flagged.
        Same phone, different father name → FLAG.

 RULE 5: Identity lifecycle is tracked.
        Name changes, phone changes, address changes over time.
```

---

## Layer 5: Hypothesis & Investigation Layer

### Purpose
Maintains competing explanations and drives investigation.

### Components

```
HYPOTHESIS & INVESTIGATION LAYER
├── Hypotheses
│   ├── Primary hypothesis
│   ├── Alternative explanations
│   ├── Supporting evidence
│   ├── Contradicting evidence
│   ├── Missing evidence
│   └── Confidence scores
│
├── Contradictions
│   ├── What conflicts
│   ├── Source reliability comparison
│   ├── Resolution status
│   └── Impact on hypotheses
│
├── Evidence Gaps
│   ├── What's missing
│   ├── Why it matters
│   ├── Suggested actions
│   └── Priority (information gain)
│
└── Investigator Actions
    ├── What to do next
    ├── Why (addresses which gap)
    ├── Expected information gain
    └── Feasibility
```

### Rules

```
RULE 1: Multiple hypotheses are maintained.
        Never commit to first explanation.

RULE 2: Contradictions have equal structural status.
        Supporting ≠ more important than contradicting.

RULE 3: Missing evidence is explicit.
        "What would distinguish H1 from H2?"

RULE 4: Information gain drives priority.
        "Which evidence would most change our beliefs?"

RULE 5: Legal status ≠ analytical confidence.
        "REASONABLE_SUSPICION" not "GUILTY."
```

---

## Layer 6: ML Engine

### Purpose
The ML engine is the learning layer. The reasoning layer (Layers 1-5) tells the system what to think. The ML engine tells it how to learn from data. It provides pattern detection, uncertainty quantification, and predictive capabilities that feed into the reasoning layer.

### Architecture

```
ML ENGINE LAYERS:
├── Layer 1: Feature Engineering
│   ├── Node features (demographics, communication, financial, geographic)
│   ├── Edge features (type, frequency, temporal, strength)
│   ├── Graph features (density, modularity, community structure)
│   └── Every feature carries uncertainty metadata
│
├── Layer 2: Graph Neural Networks (GNN)
│   ├── Multilayer architecture (communication, financial, social, co-offending)
│   ├── Tasks: link prediction, community detection, node classification, anomaly detection
│   ├── Output: predictions with uncertainty intervals
│   └── Training: synthetic data → fine-tuning → active learning
│
├── Layer 3: Bayesian Networks (BN)
│   ├── Evidence nodes (from Evidence Graph)
│   ├── Hypothesis nodes (from Hypothesis Store)
│   ├── Dependency edges (from Dependency DAG)
│   └── Inference: belief propagation, information gain calculation
│
├── Layer 4: Temporal Models
│   ├── Graph Convolutional Recurrent Networks (GCRN)
│   ├── Time-windowed analysis
│   ├── Change detection and evolution tracking
│   └── Hysteresis modeling
│
└── Layer 5: Adversarial Defense
    ├── Outlier detection (graph autoencoder)
    ├── Source triangulation
    ├── Behavioral consistency checks
    └── Graceful degradation
```

### The One Rule Still Applies

```
THE ML ENGINE MAY:
├── Predict hidden relationships
├── Detect communities
├── Detect anomalies
├── Estimate uncertainty
├── Suggest which evidence to obtain next

THE ML ENGINE MUST NEVER:
├── Upgrade an inference into an observation
├── Treat its own predictions as ground truth
├── Use prediction confidence as evidence quality
├── Ignore uncertainty in its own outputs
└── Make legal conclusions from pattern scores
```

### ML ↔ Reasoning Layer Interface

```
REASONING LAYER ASKS ML:
├── "What hidden relationships might exist?" → GNN: link_prediction
├── "What communities are present?" → GNN: community_detection
├── "What roles do these entities play?" → GNN: node_classification
├── "Are there anomalous patterns?" → GNN + Temporal: anomaly_detection
├── "What's the probability of each hypothesis?" → BN: inference
├── "Which evidence should we obtain next?" → BN: information_gain [not implemented]
├── "Is this network resilient?" → Temporal: resilience_analysis
└── "Are there adversarial manipulations?" → Adversarial: threat_detection

ML ENGINE RETURNS:
├── Predictions with uncertainty
├── Evidence for each prediction
├── Confidence intervals
├── Alternative explanations
└── Limitations and caveats

RULE: ML predictions are INPUTS to reasoning, not CONCLUSIONS.
      The reasoning layer has final authority over all outputs.
```

### ML Stores

```
NEW STORES (in addition to existing stores):
├── FEATURE_STORE
│   ├── Written by: IngestionEngine (Stage 1)
│   ├── Read by: GNNEngine, BNEngine
│   └── Purpose: ML features with uncertainty metadata
│
├── GNN_PREDICTIONS_STORE
│   ├── Written by: GNNEngine (Stage 6 sub-stage)
│   ├── Read by: HypothesisEngine, CriticEngine
│   └── Purpose: GNN predictions with uncertainty
│
├── BN_INFERENCE_STORE [not implemented — no BN in src/]
│   ├── Written by: BNEngine (Stage 7) [not implemented]
│   ├── Read by: CriticEngine (Stage 10, not implemented)
│   └── Purpose: BN inference results with posterior distributions
│
├── TEMPORAL_ANALYSIS_STORE
│   ├── Written by: TemporalEngine (Stage 6 sub-stage)
│   ├── Read by: HypothesisEngine, CriticEngine
│   └── Purpose: Temporal analysis with change metrics
│
├── ADVERSARIAL_ASSESSMENT_STORE
│   ├── Written by: AdversarialEngine (Stage 8)
│   ├── Read by: CriticEngine
│   └── Purpose: Threat assessments with confidence
│
├── INFORMATION_GAIN_STORE [not implemented — no posterior exists]
│   ├── Written by: BNEngine (Stage 7) [not implemented]
│   ├── Read by: (none — Stage 9 does not read it)
│   └── Purpose: Ranked evidence to obtain
│
└── EXPLANATION_STORE
    ├── Written by: GNNEngine, BNEngine, TemporalEngine
    ├── Read by: CriticEngine
    └── Purpose: Human-readable explanations for ML predictions
```

### ML-Specific Failure Modes

```
ML FAILURE MODES:

1. GNN OVERCONFIDENCE
   ├── Symptom: GNN outputs 0.95 confidence for link prediction
   ├── Reality: GNN is overconfident due to graph homophily bias
   ├── Mitigation: Confidence calibration (Platt scaling)
   └── Detection: Calibration drift monitoring

2. BN PRIOR SENSITIVITY
   ├── Symptom: BN posterior changes dramatically with prior
   ├── Reality: Insufficient evidence to overwhelm prior
   ├── Mitigation: Sensitivity analysis, report prior influence
   └── Detection: Prior/posterior ratio monitoring

3. ADVERSARIAL MANIPULATION
   ├── Symptom: System flags wrong person as high priority
   ├── Reality: Adversary planted misleading evidence
   ├── Mitigation: Source reliability assessment, anomaly detection
   └── Detection: Source consistency checks

4. FEATURE LEAKAGE
   ├── Symptom: ML model performs perfectly in training
   ├── Reality: Features leaked information from test set
   ├── Mitigation: Strict train/test splitting, temporal awareness
   └── Detection: Cross-validation, holdout evaluation

5. TEMPORAL DRIFT
   ├── Symptom: Model accuracy degrades over time
   ├── Reality: Distribution shift in incoming data
   ├── Mitigation: Regular retraining, drift monitoring
   └── Detection: Performance metrics over time
```

### Implementation Phases

```
PHASE 1 (Hackathon MVP):
├── Single-layer GCN for link prediction
├── Basic BN for hypothesis evaluation
├── Feature engineering (simplified)
└── Basic integration with existing pipeline

PHASE 2 (Enhanced):
├── Multilayer GNN (2 layers)
├── Temporal models (basic)
├── Contradiction handling in BN
└── Information gain calculation

PHASE 3 (Full):
├── Full multilayer GNN (4 layers)
├── Full temporal models (GCRN)
├── Full adversarial defense
├── Active learning from investigator feedback
└── Model versioning and continuous learning
```

### Technology Stack

```
GNN FRAMEWORK: PyTorch Geometric (PyG)
BN FRAMEWORK: pgmpy (Python)
TEMPORAL: PyTorch Geometric Temporal
VISUALIZATION: NetworkX + Plotly
DEPLOYMENT: Docker container
```

---

## Cross-Case Contamination

The system must prevent information from leaking between cases through shared ML models, training data, or investigator feedback.

### JurisdictionScope

Shared entities do not automatically imply shared criminal activity. Cases operating within overlapping JurisdictionNode hierarchies (NATION → STATE_UT → COMMISSIONERATE → RANGE → DISTRICT → CITY → ZONE → DIVISION → SUB_DIVISION → POLICE_STATION → OUT_POST) share jurisdictional context but remain case-scoped. The JurisdictionResolver maps raw text references to the canonical hierarchy, enabling cross-case alerts when entities appear across jurisdictions while preserving case isolation.

### Data Origin Classes

```
Every piece of data has a provenance class:

OBSERVATIONAL:
├── Directly observed by sensor or person
├── Not influenced by system output
├── Highest quality for analysis
└── Example: CDR record, bank transaction, CCTV footage

DERIVED:
├── Computed from observational data
├── Inherits provenance from source
├── Quality depends on derivation method
└── Example: ML entity extraction, anomaly score

INVESTIGATIVE:
├── Generated by investigation process
├── May be influenced by system output
├── CANNOT be used as training truth without confirmation
└── Example: Investigator labels, system recommendations

MODEL_GENERATED:
├── Produced by ML or reasoning system
├── Must not be used as training data
├── Must be validated by human
└── Example: Hypothesis, anomaly detection, pattern match

GROUND_TRUTH:
├── Confirmed by authoritative source
├── Court verdict, verified confession, etc.
├── Highest quality label
└── Example: Conviction, confirmed alibi
```

### Contamination Prevention Rules

```
RULE 1: INVESTIGATIVE data cannot automatically become training truth.
        It must be confirmed by OBSERVATIONAL or GROUND_TRUTH evidence.

RULE 2: MODEL_GENERATED data cannot be used as training data.
        It must be validated by human investigator.

RULE 3: When training population-level models:
        ├── Tag all training data with provenance class
        ├── Control which provenance classes flow into which models
        ├── Separate case-specific from population data
        └── Note provenance distribution in training set

RULE 4: When reporting model performance:
        ├── Note provenance distribution of test labels
        ├── "Accuracy 85%" means different things with different provenance
        └── OBSERVATIONAL labels are more trustworthy than INVESTIGATIVE

RULE 5: Investigation feedback must not create circular reasoning:
        System recommends → Investigator finds evidence → Evidence supports hypothesis →
        System's recommendation appears validated
        BUT: The evidence was sought BECAUSE of the recommendation.
```

---

## Network Fragility

Rather than claiming to detect adversaries, the system measures how fragile its own conclusions are to edge removal.

### Why Fragility Matters

```
EXAMPLE:
Person X → Person A → Person B → Person C

If X ↔ A is removed, the entire suspicious pattern collapses.

The investigator should know:
├── How dependent is the conclusion on specific edges?
├── Which edges, if wrong, would change the conclusion?
└── How fragile is the network structure?

This is more actionable than:
├── "adversarial probability = 0.73" (which may be meaningless)
└── "edge is genuine" (which we often can't determine)
```

### Network Fragility Model

```
NetworkFragility {
  entity_id:         string
  
  // DEPENDENCY ANALYSIS
  critical_edges:    CriticalEdge[]   // edges whose removal changes conclusions
  critical_entities: string[]         // entities whose removal changes conclusions
  
  // FRAGILITY SCORE
  fragility_score:   float           // 0-1, how fragile is this entity's network position
  fragility_basis:   string[]        // why this score
  
  // SENSITIVITY
  removal_impact:    RemovalImpact[] // what happens if specific edges/entities removed
}

CriticalEdge {
  edge_id:           string
  removal_impact:    string          // "collapses_hypothesis" / "weakens_hypothesis" / "no_change"
  confidence_if_wrong: float         // how confident are we this edge is genuine
  fragility_contribution: float      // how much this edge contributes to fragility
}

RemovalImpact {
  target:            string          // edge or entity ID
  hypothesis_changes: object         // {hypothesis_id: {before: 0.72, after: 0.18}}
  network_changes:   object          // structural changes
}
```

### Fragility in Investigator Interface

```
INVESTIGATOR SEES:

Network Fragility for Person A:
├── Fragility score: 0.73 (HIGH)
├── Critical edges:
│   ├── A ↔ B (removal collapses H1 from 0.72 to 0.18)
│   └── A ↔ C (removal weakens H1 from 0.72 to 0.45)
└── Critical entities:
    └── Person D (removal changes H1 from 0.72 to 0.31)

Warning: Person A's suspiciousness depends heavily on
relationships with B and C. If these relationships
are incorrect, the hypothesis collapses.
```

---

## Temporal Relations

Events have uncertain time intervals. The system must explicitly track temporal relations between events.

### Temporal Relation Types

```
Allen's Interval Algebra (simplified):

BEFORE:     A ends before B starts
AFTER:      A starts after B ends
OVERLAPS:   A starts before B, ends during B
CONTAINS:   A starts before B, ends after B
DURING:     A starts after B, ends before B
SIMULTANEOUS: A and B start and end at approximately same time

UNCERTAIN TEMPORAL RELATIONS:
├── POSSIBLY_BEFORE: intervals may not overlap
├── POSSIBLY_AFTER: intervals may not overlap
├── TEMPORAL_UNKNOWN: insufficient timing information
└── CONFLICTING: different sources give different times
```

### Temporal Uncertainty Model

```
TemporalRelation {
  event_a_id:        string
  event_b_id:        string
  
  // RELATION
  relation:          string          // BEFORE / AFTER / OVERLAPS / etc.
  confidence:        ConfidenceDecomposition
  
  // UNCERTAIN TEMPORAL
  possible_relations: string[]       // all possible relations given uncertainty
  temporal_distance:  TimeDistance    // estimated distance between events
  
  // BASIS
  basis:             string[]        // why this relation
  limitations:       string[]        // what timing information is missing
}

TimeDistance {
  value:             float           // estimated distance
  unit:              string          // "minutes" / "hours" / "days"
  uncertainty:       float           // 0-1, how uncertain is this distance
  basis:             string          // how estimated
}
```

### Temporal Sensitivity in Hypotheses

```
RULE: Hypotheses must carry temporal sensitivity.

Hypothesis {
  temporal_sensitivity: TemporalSensitivity
}

TemporalSensitivity {
  // Does the hypothesis survive timing uncertainty?
  timing_assumptions: string[]       // what timing assumptions are made
  timing_sensitivity: string         // "high" / "medium" / "low" / "unknown"
  timing_testable:   boolean         // can timing assumptions be tested?
  
  // What timing would falsify the hypothesis?
  temporal_falsifiers: TemporalFalsifier[]
}

TemporalFalsifier {
  description:       string          // what timing would falsify
  testability:       string          // "testable" / "partially_testable" / "untestable"
  impact:            string          // "reject_hypothesis" / "weaken_hypothesis"
}
```

### Temporal Relations in Investigation

```
EXAMPLE:
Event A: 14:00–16:00 (meeting at hotel)
Event B: 15:00–15:20 (phone call)

Possible relations: OVERLAPS, DURING, SIMULTANEOUS
Temporal distance: unknown (intervals overlap)

If hypothesis requires A BEFORE B:
├── Temporal sensitivity: HIGH
├── Timing may falsify hypothesis
└── Investigator should verify exact timing

If hypothesis requires A and B SIMULTANEOUS:
├── Temporal sensitivity: MEDIUM
├── Intervals overlap, but exact timing unclear
└── Investigator should verify
```

---

## Negative Evidence Semantics

Absence of evidence must never automatically become evidence of absence.

### The Problem

```
DANGEROUS:
  "No CCTV shows A entering building"
  → System concludes: "A was not at building"

  But:
  ├── Camera didn't cover entrance
  ├── Camera was offline
  ├── Footage was missing
  ├── Person entered another way
  └── Timestamp mismatch

  The absence of CCTV evidence is NOT evidence of absence.
```

### Negative Evidence Classes

```
CONFIRMED_ABSENCE:
├── Search was comprehensive
├── Coverage ratio > 0.80
├── Confidence > 0.80
├── Result: NOT_FOUND
└── Meaning: Evidence likely does not exist

UNCONFIRMED_ABSENCE:
├── Search was partial or minimal
├── Coverage ratio < 0.80
├── OR confidence < 0.80
├── Result: NOT_FOUND
└── Meaning: Evidence may exist but wasn't found

UNKNOWN:
├── No search performed
├── Result: UNKNOWN
└── Meaning: We don't know if evidence exists

UNAVAILABLE:
├── Search performed but access denied
├── Result: DENIED
└── Meaning: Evidence exists but we can't access it

DESTROYED:
├── Evidence known to have existed but was destroyed
├── Result: DESTROYED
└── Meaning: Evidence existed but is no longer available
```

### Negative Evidence Rules

```
RULE 1: UNCONFIRMED_ABSENCE is treated as UNKNOWN, not as negative evidence.
        Only CONFIRMED_ABSENCE can legitimately weaken a hypothesis.

RULE 2: The Critic must never use UNCONFIRMED_ABSENCE to support conclusions.
        "We didn't find X" is not the same as "X doesn't exist."

RULE 3: When reporting negative evidence, always note:
        ├── What was searched
        ├── How thoroughly it was searched
        ├── What wasn't searched
        └── Whether the search was adequate

RULE 4: Exculpatory negative evidence (evidence that would clear someone)
        must be searched for proactively.
        Don't only look for inculpatory evidence.
```

---

## Source Conflict Resolution

Contradiction detected is not equivalent to conflict understood. The system must classify WHY sources conflict, not merely place them in contradicting[].

### Why Conflict Classification Matters

```
EXAMPLE:
CCTV: A at location X at 15:00
CDR: A's phone at location Y at 15:00
Witness: A at X

Multiple explanations:
H1: CCTV identity is wrong
H2: phone was possessed by someone else
H3: location inference is inaccurate
H4: timestamps are misaligned
H5: A was physically at X while phone was at Y

Each explanation implies a different next action.
"Contradiction detected" is not enough.
```

### Contradiction Types

```
ContradictionType:
├── IDENTITY_CONFLICT
│   ├── Different sources identify different people
│   ├── Next action: verify identity through independent means
│   └── Example: "CCTV shows person X, FIR names person Y"
│
├── TEMPORAL_CONFLICT
│   ├── Sources disagree on when event occurred
│   ├── Next action: verify timestamps, check time zones
│   └── Example: "FIR says 14:00, CDR shows 15:00"
│
├── LOCATION_CONFLICT
│   ├── Sources disagree on where event occurred
│   ├── Next action: verify locations, check precision
│   └── Example: "CCTV at Hotel X, CDR at location Y"
│
├── SOURCE_CONTENT_CONFLICT
│   ├── Sources disagree on what happened
│   ├── Next action: verify source accuracy, check for error
│   └── Example: "FIR says fraud, witness says legitimate"
│
├── ATTRIBUTION_CONFLICT
│   ├── Sources disagree on who did what
│   ├── Next action: verify attribution, check for misidentification
│   └── Example: "CDR attributes phone to A, but phone may be shared"
│
├── EVENT_IDENTITY_CONFLICT
│   ├── Sources describe different events
│   ├── Next action: verify whether same event or different events
│   └── Example: "Two meetings described differently"
│
├── DERIVATION_CONFLICT
│   ├── Derived data contradicts source data
│   ├── Next action: check derivation process
│   └── Example: "ML extraction says X, but manual review says Y"
│
└── UNKNOWN_CONFLICT
    ├── Cannot determine why sources conflict
    └── Next action: investigate all possibilities
```

### Conflict Classification Rules

```
RULE 1: Every contradiction must be classified by type.
        "Contradiction detected" is insufficient.
        Must answer: "WHY do sources conflict?"

 RULE 2: Each conflict type implies different next actions.
        IDENTITY_CONFLICT → verify identity
        TEMPORAL_CONFLICT → verify timestamps
        LOCATION_CONFLICT → verify locations
        Don't treat all contradictions the same.

RULE 3: Conflict type affects hypothesis reasoning.
        Some conflict types are more damaging than others:
        ├── IDENTITY_CONFLICT: high damage (identity wrong → everything wrong)
        ├── ATTRIBUTION_CONFLICT: high damage (phone ≠ person)
        ├── LOCATION_CONFLICT: medium damage (location may be imprecise)
        ├── TEMPORAL_CONFLICT: medium damage (timestamps may be misaligned)
        └── SOURCE_CONTENT_CONFLICT: variable (depends on source reliability)

RULE 4: Conflicts may be resolved or unresolved.
        Resolved: conflict explained, consistent narrative found
        Unresolved: conflict remains, investigation needed
```

### Conflict in Investigator Interface

```
INVESTIGATOR SEES:

Contradiction #1:
├── Type: LOCATION_CONFLICT
├── Sources: CCTV (Hotel X) vs CDR (location Y)
├── Timestamp: both at 15:00
├── Severity: significant
├── Possible explanations:
│   ├── H1: CDR location inference is imprecise (cell tower, not GPS)
│   ├── H2: Person was at X, phone was at Y (phone left behind)
│   └── H3: CCTV identity is wrong
├── Recommended action: verify CDR location precision
└── If resolved: note resolution and remaining uncertainty
```

---

## Epistemic Ontology

The system must explicitly distinguish five different epistemic categories. Collapsing them causes investigative errors.

### The Five Categories

```
OBSERVATION:
├── What: Directly observed by sensor or person
├── Example: "A called B at 14:32" (CDR)
├── Example: "Person entered building" (CCTV)
├── Example: "₹2,00,000 transferred" (bank record)
├── Reliability: Depends on source quality
└── Status: Raw data, not interpreted

EVIDENCE:
├── What: Derived from observation, supports or contradicts a proposition
├── Example: "47 calls between A and B" (derived from CDR observations)
├── Example: "Financial relationship exists" (derived from bank observations)
├── Reliability: Depends on derivation quality
└── Status: Interpreted, but still factual

INFERENCE:
├── What: Reasoning system concluded this from evidence
├── Example: "Communication pattern is anomalous" (from baseline comparison)
├── Example: "Activity burst detected" (from anomaly detection)
├── Reliability: Depends on inference model quality
└── Status: Reasoning output, not observation

HYPOTHESIS:
├── What: Possible explanation for evidence
├── Example: "A and B may be coordinating fraud"
├── Example: "This is a money laundering network"
├── Reliability: Always uncertain, always competing
└── Status: Reasoning output, not fact

INVESTIGATIVE LEAD:
├── What: Actionable recommendation for investigator
├── Example: "Obtain Suresh's bank statement"
├── Example: "Interview person at Hotel X"
├── Reliability: Depends on information gain assessment
└── Status: Recommendation, not conclusion
```

### Why Separation Matters

```
DANGEROUS:
  "47 calls between A and B" = evidence
  "Communication pattern is anomalous" = inference
  "A and B may be coordinating" = hypothesis
  "Obtain communication content" = lead

  If these are collapsed:
  ├── Lead becomes hypothesis
  ├── Hypothesis becomes evidence
  ├── Evidence becomes observation
  └── Investigator can't trace reasoning

SAFE:
  OBSERVATION: CDR records show 47 calls
  EVIDENCE: Communication frequency is high (derived from observations)
  INFERENCE: Pattern is anomalous (compared to baseline)
  HYPOTHESIS: A and B may be coordinating (explanation for anomaly)
  LEAD: Obtain communication content (would test hypothesis)

  Each step is traceable.
  Each step has different reliability.
  Investigator can evaluate each step.
```

### Ontology Rules

```
RULE 1: Every claim must be tagged with its epistemic category.
        Never present inference as observation.
        Never present hypothesis as evidence.

RULE 2: Each category has different reliability semantics.
        OBSERVATION: source reliability
        EVIDENCE: derivation quality
        INFERENCE: model quality
        HYPOTHESIS: always uncertain
        LEAD: information gain assessment

RULE 3: The UI must never flatten categories.
        Don't mix observations, evidence, inferences, hypotheses, and leads
        in a single list without clear labeling.

RULE 4: Tracing must go backwards through categories.
        Hypothesis → Inference → Evidence → Observation
        Each step must be traceable.

RULE 5: Investigative leads are recommendations, not conclusions.
        "Obtain bank statement" is a lead.
        "Bank statement will prove guilt" is a hypothesis.
        Never present leads as conclusions.
```

---

## Investigation Feedback Loops

The system's own recommendations can bias the data later used to retrain it.

```
FEEDBACK LOOP:
System flags A → investigators focus on A → more evidence found for A →
A looks more suspicious → system flags A more strongly → ...

This is a self-reinforcing selection loop.

RULE: Distinguish observational data from investigation-generated data.
      Track data origin: was this evidence found because of system recommendation?

SEPARATION:
├── observational_data: Collected independently of system output
│   └── Higher weight in analysis
├── investigation_data: Collected because system recommended it
│   └── Lower weight (may be biased)
└── feedback_tracking: Record which evidence came from which source
    └── Prevent circular reasoning
```

---

## Model Drift

Criminal behavior is not stationary. The model may learn "Pattern X → suspicious" then actors change behavior.

```
DRIFT DETECTION:
├── Training distribution: What was normal when model was trained
├── Current distribution: What is happening now
├── Drift detection: Compare training vs current
└── Retraining trigger: When drift exceeds threshold

RULE: Don't assume historical patterns remain valid.
      Monitor for drift. Retrain when needed.
      Otherwise system becomes detector for historical behavior, not current.
```

---

## Case-Scoped Edge Validity

An edge in one case does not automatically become evidence in another case.

```
EXAMPLE:
Case 1: Rakesh and Suresh co-offend (fraud)
Case 2: Rakesh and Mohan communicate (drug trafficking)

Rakesh appears in both cases.
But the Rakesh-Suresh edge from Case 1 does NOT strengthen Case 2.

RULE: Edges are case-scoped.
      Entity in multiple cases ≠ cases connected.
      Each case maintains its own hypothesis space.
```

---

## Policy Configuration

All thresholds and parameters are configurable, not hardcoded. Policies are versioned.

```
POLICY VERSION: v1.0

MERGE THRESHOLDS:
├── auto_merge: 0.90          # confidence above → automatic merge
├── flag_for_review: 0.70    # confidence between → human review
├── keep_separate: 0.00       # confidence below → keep separate
└── note: Different relationship types may need different thresholds

EDGE CREATION:
├── min_confidence: 0.50      # below this → no edge created
├── min_coverage_ratio: 0.50  # minimum data coverage for conclusion
├── critical_severity: 0.80   # above → critical
├── major_severity: 0.60      # above → major
├── minor_severity: 0.40      # above → minor
├── min_source_reliability: 0.30
└── note: CDR edges may use lower threshold than surveillance edges

INFERENCE DEPTH:
├── max_depth: 5              # maximum steps from raw evidence
├── decay_rate: 0.85          # confidence multiplier per depth step
└── note: May be increased for well-sourced investigations

ANOMALY DETECTION:
├── individual_std_threshold: 2.0    # standard deviations from individual baseline
├── population_std_threshold: 2.0    # standard deviations from population baseline
├── min_sample_size: 30              # minimum data points for baseline
└── note: May be adjusted per entity type

HYPOTHESIS COMPETITION:
├── min_hypotheses: 3         # always maintain at least this many
├── null_hypothesis_always: true
├── max_confidence_without_corroboration: 0.85
└── note: Never commit to single hypothesis

CONFIDENCE CALIBRATION:
├── overconfidence_threshold: 0.95   # flag if single source + high confidence
├── independence_bonus: 0.10         # bonus for independent confirmation
├── dependency_penalty: 0.20         # penalty for dependent evidence
└── note: Calibrated per case

EVIDENCE INDEPENDENCE:
├── Authority: THE_CRITIC.md for independence analysis
├── Source comparison: Heuristic only, not authoritative
├── DAG comparison: Correctly handles partial independence
└── Independence based on root sources, not evidence count

POLICY TRACKING:
├── policy_id: "policy_v1.0"
├── created: "2024-03-20"
├── case_id: "CASE_001"
└── modifications: []         # any case-specific overrides
```

---

## LLM Boundary Rules

The system uses LLMs for specific reasoning tasks. The LLM must never become a hidden source of facts.

```
LLM MAY:
├── Propose hypotheses based on existing evidence
├── Interpret contradictions
├── Identify evidence gaps
├── Explain reasoning
├── Summarize findings
├── Formulate investigator questions
├── Compare competing explanations
├── Generate natural language reports
└── Suggest investigative actions

LLM MAY NOT:
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

VALIDATION RULE:
Every LLM output must reference existing IDs:
├── evidence_id
├── entity_id
├── event_id
├── hypothesis_id
├── contradiction_id
└── gap_id

A deterministic validator checks every LLM response:
1. Do all referenced IDs exist in stores?
2. Does the LLM invent any new IDs?
3. Does the LLM modify any confidence scores?
4. Does the LLM create any new entities/edges?

IF validation fails:
├── Reject LLM output
├── Log violation
├── Fall back to deterministic reasoning
└── Alert investigator

RULE: LLM is a reasoning aid, not a source of truth.
      Everything it produces must be traceable to existing data.
      This directly follows: "Never upgrade an inference into an observation."
      
See THE_CRITIC.md for full LLM validation framework.
```

---

## The Components

### Engines (one per stage)

```
STAGE 1: IngestionEngine
├── Input: Raw files (PDF, CSV, JSON, text)
├── Processing: Parse, validate, normalize
├── Output: RawEvidence[]
└── Reasoning: Source reliability scoring

STAGE 2: ExtractionEngine
├── Input: RawEvidence[]
├── Processing: NER, relation extraction, OCR
├── Output: ExtractedEntity[], ExtractedRelation[]
└── Reasoning: Entity identification, confidence scoring

STAGE 3: ResolutionEngine
├── Input: ExtractedEntity[]
├── Processing: Probabilistic matching, deduplication
├── Output: ResolvedEntity[], UnknownEntity[], Contradiction[]
└── Reasoning: Identity resolution, contradiction detection

STAGE 4: TemporalEngine
├── Input: ExtractedRelation[], RawEvidence[]
├── Processing: Timestamp normalization, precision modeling
├── Output: TemporalInfo[], SpatialInfo[]
└── Reasoning: Precision assessment, interval modeling

STAGE 5: GraphBuilderEngine
├── Input: ResolvedEntity[], TemporalInfo[], SpatialInfo[]
├── Processing: Create nodes, edges, provenance chains
├── Output: EvidenceEdge[]
└── Reasoning: Edge creation thresholds, relationship classification

STAGE 6: AnalyticsEngine
├── Input: EvidenceEdge[], ResolvedEntity[]
├── Processing: Centrality, communities, anomalies, baselines
├── Output: AnomalySignal[], Community[], CentralityScore[]
└── Reasoning: Pattern detection, baseline comparison

STAGE 7: HypothesisEngine
├── Input: AnomalySignal[], EvidenceEdge[], BehavioralBaseline[]
├── Processing: Generate competing hypotheses, score, rank
├── Output: Hypothesis[]
└── Reasoning: Explanation generation, plausibility scoring

STAGE 8: ContradictionEngine
├── Input: Hypothesis[], Contradiction[], EvidenceEdge[], Stage 1 flags
├── Processing: Attribute disputed values, admissible elimination,
│               resolvability, hypothesis linkage
├── Output: Contradiction[] (extended: resolvable, resolution_evidence,
│                            hypothesis_id, impact_on_hypothesis)
└── Reasoning: Survivorship, cross-class resolvability, impact recomputation

STAGE 9: GapDetectionEngine
├── Input: Hypothesis[], Contradiction[], MissingEdge[], EvidenceEdge[],
│          CommunityAssignment[], extraction source classes
├── Processing: Identify missing evidence requirements, derive data sources,
│               recompute conditional impact
├── Output: EvidenceGap[]
└── Reasoning: Identity/deduplication, data-source derivation, impact
              recomputation (no ranking, no classification, no thresholds)

STAGE 10: CriticEngine
├── Input: All stores
├── Processing: Full investigation review, query answering
├── Output: InvestigationReport, QueryResult
└── Reasoning: Meta-reasoning, evidence assembly

GLOBAL STORES (Multi-Case):
├── GlobalEntityStore: manages cross-case entity identity
├── ScopeResolver: computes scoped analytical graphs on-demand
├── JurisdictionResolver: maps raw text to JurisdictionNode hierarchy
```

### Stores (data persistence)

```
STORES:
├── raw_evidence_store          (Stage 1 writes)
├── extracted_entities_store    (Stage 2 writes)
├── extracted_relations_store   (Stage 2 writes)
├── resolved_entities_store     (Stage 3 writes)
├── unknown_entities_store      (Stage 3 writes)
├── contradictions_store        (Stage 3, 8 writes; append-only with run_id versioning)
├── temporal_spatial_store      (Stage 4 writes)
├── evidence_edges_store        (Stage 5 writes)
├── provenance_store            (Stage 5 writes)
├── analytics_results_store     (Stage 6 writes)
├── behavioral_baselines_store  (Stage 6 writes)
├── deduplicated_events_store   (Stage 6 writes)
├── hypotheses_store            (Stage 7 writes)
├── evidence_gaps_store         (Stage 9 writes only)
├── investigator_actions_store  (deferred; Stage 9 does not produce it)
├── investigation_feedback_store (investigator writes)
├── audit_store                 (all stages write)
│
├── ML STORES:
├── feature_store               (ML pipeline writes)
├── gnn_predictions_store       (GNN writes)
├── bn_inference_store          (BN writes)
├── adversarial_assessment_store (adversarial detection writes)
├── information_gain_store      (not implemented; no posterior exists)
└── explanation_store           (explanation writes)

Note: See OUTPUTS.md for exact counts of what each stage produces.
```

### Interfaces (connections between components)

```
ENGINE → STORE:  Write results
STORE → ENGINE:  Read data
ENGINE → ENGINE:  Never directly (always through stores)
REASONING → STORE:  Query data
STORE → REASONING:  Return results
```

### Deprecation Note

PoliceStation has been replaced by JurisdictionNode. All references to PoliceStation in stores, schemas, and pipeline stages should be migrated to the JurisdictionNode hierarchy.

### Pipeline Run Versioning

Each pipeline run produces versioned output. All records include a `run_id` and a `jurisdiction_node_id` field linking to the JurisdictionNode hierarchy for provenance and multi-case scope resolution.

---

## The Layout

```
                    ┌─────────────────────┐
                    │    RAW DATA INPUT   │
                    │ FIRs, CDRs, Bank,   │
                    │ Surveillance, etc.  │
                    └──────────┬──────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  STAGE 1          STAGE 2          STAGE 3          STAGE 4     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐│
│  │Ingestion │────►│Extraction│────►│Resolution│────►│Temporal  ││
│  │Engine    │     │Engine    │     │Engine    │     │Engine    ││
│  └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘│
│       │                │                │                │      │
│       ▼                ▼                ▼                ▼      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              INTERRELATIONAL MODEL                       │   │
│  │              (All Stores Connected)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│       │                │                │                │      │
│       ▼                ▼                ▼                ▼      │
│  STAGE 5          STAGE 6          STAGE 7          STAGE 8     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐│
│  │Graph     │────►│Analytics │────►│Hypothesis│────►│Contradic ││
│  │Builder   │     │Engine    │     │Engine    │     │Engine    ││
│  └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘│
│       │                │                │                │      │
│       ▼                ▼                ▼                ▼      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              INTERRELATIONAL MODEL                       │   │
│  │              (All Stores Connected)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│       │                │                │                │      │
│       ▼                ▼                ▼                ▼      │
│  STAGE 9          ┌──────────────────────────────────────┐      │
│  ┌──────────┐     │                                      │      │
│  │Gap       │────►│         CRITIC ENGINE                │      │
│  │Detection │     │         (The Reasoner)               │      │
│  └──────────┘     │                                      │      │
│                   │  Queries ALL stores                  │      │
│                   │  Answers investigator questions      │      │
│                   │  Generates investigation report      │      │
│                   │                                      │      │
│                   └──────────────┬───────────────────────┘      │
│                                  │                              │
│                                  ▼                              │
│                   ┌──────────────────────────────────────┐      │
│                   │     INVESTIGATOR INTERFACE            │      │
│                   │     Dashboard, Query, Report          │      │
│                   └──────────────────────────────────────┘      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```
