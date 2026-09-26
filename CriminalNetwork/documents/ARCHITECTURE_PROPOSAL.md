# Architecture Proposal — Crime Network Analysis System

## Stage → Model Mapping

The architecture is built on five analytical models (see SYSTEM_STRUCTURE.md):

```
Stage 1: Ingestion     → Model 1: Evidence Model
Stage 2: Extraction    → Model 1: Evidence Model
Stage 3: Resolution    → Model 2: Provenance + Model 3: Coverage + Model 4: Entity State
Stage 4: Temporal      → Model 2: Provenance + Model 3: Coverage
Stage 5: Graph Build   → Model 4: Entity State + Model 5: Hypothesis
Stage 6: Analytics     → Model 5: Hypothesis & Investigation
Stage 7: Hypothesis    → Model 5: Hypothesis & Investigation
Stage 8: Contradiction → Model 5: Hypothesis & Investigation
Stage 9: Gap Detection → Model 5: Hypothesis & Investigation
Stage 10: Critic       → Reads ALL models (read-only), writes audit
```

---

## 1. Why I Prepared This

I reviewed the existing playbook while thinking about one specific question:

> Could this system cause an investigator to pursue the wrong person, miss the right person, misunderstand an event, or become overconfident because the graph looks convincing?

The playbook gives us a solid implementation structure. But when I traced what happens to evidence as it moves through a conventional graph + ML pipeline — from raw document to entity to edge to centrality score — I found several places where the system could silently make wrong assumptions about what it actually knows.

I built a separate architecture to address those gaps. This proposal explains what I found and how the two structures might fit together.

---

## 2. Existing Team Structure

The playbook proposes a practical six-module pipeline:

| Module | Role |
|--------|------|
| **A — Data Ingestion** | Parse multi-format files (PDF, CSV, Excel, images), OCR scanned documents |
| **B — NLP Extraction** | Extract people, locations, phones, organizations using spaCy + IndicBERT |
| **C — Graph DB & API** | Design Neo4j schema, build CRUD and query API |
| **D — Network Analytics** | Centrality analysis, community detection, path finding |
| **E — Dashboard** | Interactive graph visualization, search, filter, highlight |
| **F — Integration & Testing** | End-to-end pipeline testing, demo data creation |

**Tech stack:** NestJS + Neo4j + spaCy + React + vis.js/D3 + Docker Compose

**Demo flow:** Upload documents → Extract entities → Populate graph → Visualize network with centrality highlighting

This is a workable product structure. The team can build it, demo it, and present it. It covers the "how do we build this system" question well.

---

## 3. What I Found Missing

When I reviewed the playbook from the perspective of an investigator actually using the system, I identified gaps that matter in real investigation scenarios. These are not cosmetic issues — they are places where the system could produce misleading results.

### Gap 1: All data treated as equivalent facts

**What the playbook handles:** Documents are parsed and entities extracted.

**What remains underspecified:** The system does not distinguish between:
- A CDR record (automated, high reliability for "call occurred")
- An FIR narrative (human report, subjective)
- A news article (derived, secondhand)
- A social media post (unverified)

**Why it matters:** These have radically different trustworthiness. Treating them equally means the system's confidence scores reflect data volume, not evidence quality.

**What my architecture adds:** Every incoming data point carries `provenance_class` (where it came from), `verification_status` (how well it's verified), and contextual `source_reliability` (trustworthy for *what specific claim*).

**Where it fits:** Ingestion stage (Workstream A).

---

### Gap 2: Source independence not properly tracked

**What the playbook handles:** Documents are processed individually.

**What remains underspecified:** If a news article summarizes an FIR, and a social media post references the news article, the system may count all three as independent sources confirming the same fact. They are not — they all trace back to one original observation.

**Why it matters:** Inflated independence artificially boosts confidence. The system may say "three independent sources confirm X" when really one source was copied three times.

**What my architecture adds:** A claim-aware dependency DAG. Every piece of evidence traces its lineage to root sources. Independence is calculated by counting unique root sources, not evidence items. The DAG is authoritative; simple source comparison is a fallback heuristic.

**Where it fits:** Ingestion + NLP stages (Workstreams A + B).

---

### Gap 3: Source reliability is a single number

**What the playbook handles:** Implicit trust assumptions (CDR reliable, FIR less so).

**What remains underspecified:** CDR is strong for "a call happened" but weak for "person A physically held the phone." CCTV is strong for "someone appeared" but weak for "someone is definitely person X." One reliability number per source type is not enough.

**Why it matters:** The system may treat CDR identity attribution (weak) with the same confidence as CDR occurrence recording (strong). This compounds through the graph.

**What my architecture adds:** `SourceReliabilityMatrix[source_type][claim_type]` with calibration provenance (basis, validation status, last tested). Reliability is conditional on what the source is being used to establish.

**Where it fits:** Ingestion stage (Workstream A).

---

### Gap 4: Entity resolution is binary

**What the playbook handles:** Entity matching and merging.

**What remains underspecified:** When "Rakesh" in the FIR is linked to "Rakesh Kumar" in the CDR, the system records this as a resolved entity. If the match is wrong — similar name, different person — every edge, community, and centrality score built on that resolution is contaminated.

**Why it matters:** A wrong identity merge is one of the most damaging graph errors. It silently corrupts everything downstream.

**What my architecture adds:** Entity resolution carries confidence with decomposition (supporting factors, contradicting factors, unknown factors). A pipeline invariant ensures no high-impact inference depends on weakly resolved identity without propagating that uncertainty. The investigator sees "this conclusion depends on identity resolution" when resolution is uncertain.

**Where it fits:** Entity Resolution (Workstream C).

---

### Gap 5: Contradictions are stored, not understood

**What the playbook handles:** Contradictions detected and stored.

**What remains underspecified:** "CCTV says person at location X, CDR says phone at location Y" could mean:
- The CCTV identity is wrong
- The phone was possessed by someone else
- The location inference is imprecise
- The timestamps are misaligned

Each explanation implies a different next action. The system treats all contradictions the same.

**Why it matters:** Investigating the wrong explanation wastes time. The system should tell the investigator *why* sources might conflict, not just *that* they conflict.

**What my architecture adds:** `ContradictionType` classification (identity, temporal, location, attribution, source-content, event-identity, derivation). Each type maps to different investigative actions.

**Where it fits:** Hypothesis + Critic stages (new modules).

---

### Gap 6: Missing evidence means nothing without search context

**What the playbook handles:** Evidence gaps identified.

**What remains underspecified:** "No phone records found for Suresh" could mean:
- Phone records don't exist
- Searched wrong date range
- Searched wrong provider
- Records were destroyed
- Search was inadequate

The system may treat "not found" as "doesn't exist," weakening a hypothesis that should not be weakened.

**Why it matters:** `NOT_FOUND` + inadequate search ≠ evidence of absence. This is a major real-world investigation problem.

**What my architecture adds:** Search completeness tracking (what was searched, coverage ratio, search quality, limitations). `CONFIRMED_ABSENCE` vs `UNCONFIRMED_ABSENCE` distinction. Only confirmed absence can legitimately weaken a hypothesis.

**Where it fits:** Gap Detection + Critic stages (new modules).

---

### Gap 7: No falsification

**What the playbook handles:** System supports hypotheses with evidence.

**What remains underspecified:** The system never asks "what would disprove this hypothesis?" Without falsification, confirmation bias builds. The system keeps finding supporting evidence and never looks for disconfirming evidence.

**Why it matters:** A hypothesis that survives active falsification attempts is much stronger than one that was never tested. The investigator needs to know what evidence would prove the system wrong.

**What my architecture adds:** Every major hypothesis carries `falsifiers[]` with status (not searched / searched not found / found / unavailable) and impact. The system actively recommends searching for falsifiers.

**Where it fits:** Hypothesis + Critic stages (new modules).

---

### Gap 8: Centrality scores misinterpreted

**What the playbook handles:** Centrality analysis (degree, betweenness, eigenvector).

**What remains underspecified:** A taxi driver, dispatcher, lawyer, hotel employee, or bank employee can have extremely high network centrality without criminal involvement. Exposing "centrality = 0.91" implies criminal importance.

**Why it matters:** High centrality means structural position, not criminal importance. The system must not let the investigator conflate the two.

**What my architecture adds:** `StructuralRole` classification (broker, hub, bridge, peripheral, isolated) with innocent explanations always provided. Suspiciousness is a separate score that considers centrality plus other factors.

**Where it fits:** Analytics + Dashboard stages (Workstreams D + E).

---

### Gap 9: Investigation creates its own evidence

**What the playbook handles:** Static analysis of provided documents.

**What remains underspecified:** When the system flags Person A, investigators focus on A, find more records for A, and A's graph becomes denser. The system raises A's confidence. This is a self-reinforcing feedback loop. Meanwhile, Person B receives little attention and appears innocent by comparison.

**Why it matters:** "We know more about A" can silently become "A is more likely guilty." The evidence difference may reflect investigation effort, not actual guilt.

**What my architecture adds:** Investigative attention tracking (attention ratio, evidence来源: observational vs investigation-generated). The Critic reports attention distribution and flags when confidence may reflect unequal investigation effort.

**Where it fits:** Critic + Dashboard stages (new module + Workstream E).

---

### Gap 10: Information gain measures the wrong thing

**What the playbook handles:** Not modeled.

**What remains underspecified:** "Which evidence should we obtain next?" is not answered by raw information gain. Evidence that changes abstract probabilities but doesn't help the investigator decide what to do next is less valuable than evidence that distinguishes between actionable alternatives.

**Why it matters:** The investigator cares about which next action most reduces the uncertainty that matters for decision-making.

**What my architecture adds:** `InvestigativeValue = EIG × decision_relevance × feasibility × timeliness_modifier`. Expected information gain uses Shannon entropy over the full hypothesis distribution. Preservation risk affects urgency, not information content.

**Where it fits:** Critic stage (new module).

---

## 4. The Architecture I Developed

I produced seven documents that together form one architecture:

```
The architecture is built on five interacting analytical models
(see SYSTEM_STRUCTURE.md):

1. EVIDENCE MODEL (Stages 1-2: Ingestion + Extraction)
   How incoming information becomes trustworthy,
   contextualized evidence with provenance,
   integrity, dependencies and uncertainty.

2. PROVENANCE MODEL (Stages 3-4: Resolution + Temporal)
   Where claims came from, derivation depth,
   source independence tracking.

3. COVERAGE MODEL (Stages 3-4: Resolution + Temporal)
   What was observed vs what was not observed,
   search completeness, absence vs confirmed absence.

4. ENTITY STATE MODEL (Stage 3: Resolution + Stage 5: Graph Build)
   Identity uncertainty propagation,
   entity resolution confidence, event clustering.

5. HYPOTHESIS & INVESTIGATION MODEL (Stages 5-9: Graph through Gap Detection)
   Competing hypotheses, falsification,
   information gain, investigative actions.

Additionally, Stage 10 (Critic) reads ALL five models
and provides independence checking, bias detection,
calibration, and "why this person?" explanations.
```

These models do not replace the existing pipeline. They wrap around it.

---

## 5. How the Structure Differs

**Existing playbook (flat pipeline):**

```
Raw data → Extraction → Entity resolution → Knowledge graph
→ Graph analytics / ML → Dashboard
```

**My proposed structure (5 analytical models):**

```
REAL WORLD → observations
    ↓
MODEL 1: EVIDENCE (Ingestion + Extraction)
    ↓
    ├→ MODEL 2: PROVENANCE (Resolution + Temporal)
    │   where claims came from
    │
    └→ MODEL 3: COVERAGE (Resolution + Temporal)
        what was/wasn't seen
    ↓
MODEL 4: ENTITY STATE (Resolution + Graph Build)
    identity uncertainty propagation
    ↓
MODEL 5: HYPOTHESIS & INVESTIGATION (Graph → Analytics → Hypothesis → Contradiction → Gaps)
    competing theories, falsification, information gain
    ↓
STAGE 10: CRITIC (reads ALL models)
    independence check, bias detection, calibration
    ↓
Investigative leads → New evidence → reasoning loop
```

**How they combine (5-model structure):**

```
MODEL 1: EVIDENCE (Stages 1-2)
  Ingestion:     + provenance, integrity, reliability policy
  NLP:           + epistemic tagging (observation vs inference), dependency DAG

MODEL 2: PROVENANCE (Stages 3-4)
  Resolution:    + derivation depth, source independence tracking
  Temporal:      + timestamp lineage, provenance chain

MODEL 3: COVERAGE (Stages 3-4)
  Resolution:    + unknown entity preservation, search completeness
  Temporal:      + spatial gaps, NOT_SEARCHED vs NOT_OBSERVED

MODEL 4: ENTITY STATE (Stages 3+5)
  Resolution:    + identity uncertainty propagation, event clustering
  Graph:         + claim-aware edges, temporal relations, centrality roles

MODEL 5: HYPOTHESIS & INVESTIGATION (Stages 5-9)
  Analytics:     + contradiction classification, negative evidence handling
  Hypothesis:    multi-level alternatives, falsification tracking
  Gap Detection: evidence gaps, information gain, action prioritization

STAGE 10: CRITIC
  Independence check, bias detection, calibration, "why this person?"
```

---

## 6. What the Seven Documents Represent

| Document | Role |
|----------|------|
| **INPUT_DATA.md** | How incoming information becomes evidence with provenance, integrity, dependencies, and contextual reliability |
| **OUTPUTS.md** | What the system is allowed to claim; how confidence, uncertainty, and epistemic status are represented |
| **SYSTEM_STRUCTURE.md** | The five analytical models (evidence, provenance, coverage, entity state, hypotheses) and their interactions |
| **STAGE_REASONERS.md** | How reasoning changes across pipeline stages; what judgment calls each stage makes |
| **THE_CRITIC.md** | The reasoning engine that challenges hypotheses, evaluates alternatives, identifies gaps, and prioritizes investigative actions |
| **DATA_FLOW.md** | How information moves through the complete system and returns through the investigative loop |
| **INTERNAL_BINDINGS.md** | How objects, provenance, dependencies, labels, attention, and graph structures remain connected across stages |

Together these form one coherent architecture, not seven unrelated documents.

---

## 7. Why These Additions Matter in Real Investigation

**Example 1 — The graph looks convincing but the identity is wrong**

The system shows:
```
Person A → 47 calls → Person B
Person A → ₹2,00,000 → Person B
Person A → meeting at Hotel X
Confidence: 0.72
```

But Person A was resolved from "Rakesh" in the FIR with 0.81 confidence. If that resolution is wrong, the entire graph is contaminated. The investigator sees 0.72 and acts on it.

With the proposed architecture:
```
Confidence: 0.58 (adjusted for identity uncertainty)
Identity: "Rakesh" resolved to Person A with 0.81 confidence
If resolution wrong: confidence drops to 0.18
Recommendation: verify identity before drawing conclusions
```

**Example 2 — Three sources confirm the same thing (but they don't)**

The system shows:
```
Source 1: FIR — Rakesh accused of fraud
Source 2: News article — Rakesh accused of fraud
Source 3: Social media — Rakesh is a fraudster
Independent sources: 3
```

But Source 2 summarizes Source 1, and Source 3 references Source 2. There is one independent source, not three.

With the proposed architecture:
```
Source 1: FIR (root source, independent)
Source 2: News (derived from FIR, dependent)
Source 3: Social media (derived from news, dependent)
Independent sources: 1 (not 3)
Confidence based on 1 source, not 3
```

**Example 3 — No phone records means nothing if nobody searched properly**

The system shows:
```
Phone records for Suresh: NOT_FOUND
Hypothesis weakened
```

But the search only covered one provider, one date range, and postpaid numbers. Suresh may use prepaid from a different provider.

With the proposed architecture:
```
Phone records for Suresh: NOT_FOUND
Search coverage: 0.40 (partial)
Search quality: incomplete
Assessment: UNCONFIRMED_ABSENCE
Rule: Cannot weaken hypothesis with inadequate search
Recommendation: complete search before drawing conclusions
```

**Example 4 — High centrality does not mean criminal importance**

The system shows:
```
Person A: Centrality 0.91 — HIGH PRIORITY
```

But Person A is a taxi driver who happens to transport multiple suspects.

With the proposed architecture:
```
Person A: Hub (connected to 47 people)
Innocent explanations: taxi driver, dispatcher, hotel employee
Suspicious patterns: connections include known offenders
Assessment: structural position, not criminal importance
Recommendation: verify role before assuming criminal involvement
```

---

## 8. How This Can Fit the Existing Playbook

| Existing Module | Proposed Addition |
|-----------------|-------------------|
| **Workstream A — Ingestion** | Add provenance tracking, source integrity (hash, chain of custody), contextual reliability policy |
| **Workstream B — NLP** | Add epistemic tagging (observation vs inference), claim-level dependency tracking |
| **Workstream C — Graph** | Add identity uncertainty propagation, event clustering states, claim-aware edge properties |
| **Workstream D — Analytics** | Add structural role interpretation for centrality, contradiction classification |
| **Workstream E — Dashboard** | Add confidence decomposition display, falsification status, "why this person?" explanations |
| **Workstream F — Integration** | Add investigative loop testing (evidence → gap → acquisition → re-run) |
| *New module* | Hypothesis engine (alternatives, falsification, information gain) |
| *New module* | Critic (independence check, bias detection, calibration, investigative value) |
| *New module* | Evidence acquisition planner (feasibility, preservation risk, action prioritization) |

---

## 9. What Would Remain the Same

The following components from the existing playbook are preserved as-is:

- **Neo4j graph database** — remains the core storage engine
- **NLP extraction** — spaCy + IndicBERT for entity extraction
- **Entity resolution** — matching and merging logic (with added uncertainty tracking)
- **Network analytics** — centrality, community detection, path finding (with added interpretation)
- **React dashboard** — interactive visualization (with added explanation layers)
- **Docker Compose deployment** — remains the deployment model
- **Demo flow** — documents → entities → graph → visualization (extended with reasoning)

The additions are layered on top, not inserted into the middle.

---

## 10. Proposed Review

I have prepared this as a proposal rather than assuming we should adopt it.

The existing playbook gives us a practical implementation structure that can be built and demonstrated. The deeper architecture I developed addresses reasoning and evidence lifecycle concerns that a conventional graph + ML pipeline does not handle by default.

If the approach looks technically appropriate for the problem statement, I can send the complete seven-document architecture for review and we can decide which parts should actually enter the implementation. The MVP boundary I identified suggests we can start with the core pipeline and add reasoning capabilities incrementally — provenance and confidence decomposition first, then falsification and the Critic, then the investigative loop.

The goal is not to make the system perfect on day one. The goal is to make sure the architecture can grow into something an investigator would actually trust.
