# BACKEND & ML PITCH — Daksh Walia

## Tech Stack (Say This)

> "Our backend is built on Python 3.14 for the pipeline, Express.js v5 for the prototype API, PostgreSQL 16 with pgvector for structured data and vector search, Neo4j 5 for graph queries, and Cloudflare R2 for encrypted file storage. The ML layer uses NetworkX and NumPy for graph analytics, with PyTorch Geometric and pgmpy planned for GNNs and Bayesian Networks."

---

## ML Architecture (Deep Dive)

### Two-Layer Design

> "The ML architecture has two layers: a **learning layer** and a **reasoning layer**."

### Learning Layer

> "The learning layer uses **Graph Neural Networks** — specifically a 4-layer multilayer GNN with cross-layer attention. It processes 4 network layers:"

1. **Communication Layer** — CDR data (who called whom)
2. **Financial Layer** — Bank transactions (who transferred money to whom)
3. **Social Layer** — Relationship data (family, friends, associates)
4. **Co-offending Layer** — Inferred criminal associations

> "The GNN does 4 tasks: link prediction (finding undiscovered relationships), community detection (which nodes cluster together), node classification (what type is this entity?), and anomaly detection (which nodes are unusual?)."

### Scoped Analysis (Designed, Not Implemented)

> "The same ML algorithms — GNNs, Bayesian Networks, community detection, centrality, anomaly detection — can run on scoped graphs across multiple Cases via **AnalysisRun**. An AnalysisRun is an immutable historical execution over a fixed set of Cases. The exact Case scope and relationship state used at execution time are preserved as input snapshots in AnalysisRunResult. This means a completed analysis never silently changes, even if underlying relationships later evolve."

### Reasoning Layer

> "The reasoning layer uses **Bayesian Networks** — probabilistic models that calculate the likelihood of hypotheses given evidence."

**Example:**
> "Hypothesis: 'Rakesh and Suresh are collaborators.' Evidence: '5 phone calls, shared bank account, same location.' The BN uses conditional probability tables to compute the posterior probability. It also maintains competing hypotheses — maybe they're not collaborators, maybe they just happen to share a bank account."

### Findings and Critic

> "AnalysisRuns generate **Findings** — persistent objects that capture hypotheses, anomalies, patterns, and critic verdicts. The Critic evaluates each Finding as CORROBORATED, REFUTED, or INCONCLUSIVE. Findings have stable references to supporting Cases, entities, and evidence. The Critic evaluates persisted data, not a temporary session."

### Information Gain

> "The BN calculates **information gain** — which piece of evidence would most change our belief? Example: a bank statement has information gain of 0.37 bits, while an unknown male witness has only 0.03 bits. This tells investigators what to collect next — high information gain evidence first."

### Key Rule

> "**ML predictions are hypothesis generators, not conclusions.** The reasoning layer has final authority. Every ML output goes through 6 quality checks: confidence calibration, contradiction check, explainability check, uncertainty check, sanity check, and bias check."

### Bias Detection

> "We check for 8 types of bias: confirmation bias (seeing what we expect), anchoring bias (over-weighting first evidence), availability bias (over-weighting recent evidence), source bias (trusting certain sources more), independence bias (treating dependent evidence as independent), investigation feedback bias (investigator influence), adversarial manipulation (fake data), and model drift (ML degrading over time)."

---

## Face Recognition System

### Pipeline Flow

> "Input sources — CCTV, photos, FIRs, seized phones, social media, witness sketches — go through: Face Detection (RetinaFace) → Face Alignment (affine transformation) → Feature Extraction (ArcFace, 512-d embedding) → Quality Scoring → Candidate Generation (HNSW nearest neighbor search) → Re-ranking → Investigator Verification → Multi-modal Reasoning."

### Key Tech

| Component | Technology |
|-----------|-----------|
| Detection | RetinaFace (96.9% mAP, ~50ms on GPU) |
| Recognition | ArcFace via InsightFace (99.83% LFW, 512-d embedding) |
| Vector Search | pgvector with HNSW index (~20ms for 1M faces) |
| Storage | Cloudflare R2 (AES-256 encrypted) |
| Async | Celery + Redis job queue |

### Multi-Modal Reasoning

> "Face matches are combined with CDR, location, temporal, and financial data: `combined = (face*0.35 + cdr*0.25 + location*0.20 + temporal*0.20) * corroboration_boost`. If a face match is corroborated by CDR data and location data, confidence increases. If it contradicts, the contradiction is flagged."

### Integration with Pipeline

| Stage | Face Integration |
|-------|-----------------|
| Ingestion | Images scanned, face crops stored, FaceEmbedding records created |
| Extraction | Embeddings extracted (512-d), quality assessed |
| Face Processing | pgvector similarity search, candidate ranking |
| Resolution | Face + text candidates combined: `1 - (1-text) * (1-face)` |
| Temporal | Face appearances tracked, contradictions detected |
| Graph | FACE_MATCH and SEEN_WITH edges added |

---

## Bayesian Network — How It Actually Works

> "The BN has three node types:"

1. **Evidence Nodes** — Observed facts (CDR entry exists, bank transaction confirmed, face match detected)
2. **Hypothesis Nodes** — Things we want to prove (person X is involved, transaction Y is suspicious)
3. **Background Priors** — Base rates (how common is this type of crime?)

> "Belief propagation flows from evidence to hypothesis. When new evidence arrives, the BN updates all hypothesis probabilities. The BN also maintains **competing hypotheses** — if 'Rakesh is the mastermind' and 'Suresh is the mastermind' are both hypotheses, the BN tracks both and updates both as evidence arrives."

> "The BN uses **information gain** to rank evidence: `IG(E) = H(P(H)) - H(P(H|E))`. This measures how much a piece of evidence reduces uncertainty about hypotheses. High IG evidence should be collected first."

---

## Numbers to Memorize

| Metric | Value |
|--------|-------|
| GNN layers | 4 |
| Network layers processed | 4 (communication, financial, social, co-offending) |
| BN hypothesis types | Competing (multiple maintained) |
| Quality checks on ML | 6 |
| Bias types checked | 8 |
| Face embedding dimensions | 512 |
| Face detection accuracy | 96.9% (RetinaFace) |
| Face recognition accuracy | 99.83% (ArcFace on LFW) |
| Vector search time | ~20ms for 1M faces |
| Multi-modal formula | face*0.35 + cdr*0.25 + location*0.20 + temporal*0.20 |
| Pipeline time (with face) | ~102s (vs ~70s without) |
| GPU usage | 40% |

---

## Tricky Questions

**Q: What ML algorithms do you actually use right now?**
> "Currently: NetworkX for graph algorithms (centrality, community detection, PageRank), NumPy for statistics. Planned: PyTorch Geometric for GNNs, pgmpy for Bayesian Networks. The same algorithms run on both local Case graphs and scoped cross-case graphs via AnalysisRun. We chose these because they're production-proven and don't require massive GPU clusters."

**Q: How does the GNN work?**
> "A Graph Neural Network passes messages between nodes — each node aggregates features from its neighbors, then updates its own representation. After 4 layers, each node has a rich embedding that captures its neighborhood structure. We use this for link prediction, community detection, and anomaly detection."

**Q: What about adversarial attacks on the ML?**
> "We have a dedicated adversarial defense layer. It detects graph poisoning (fake entities/edges injected to mislead), identity manipulation (fake aliases), and temporal manipulation (fabricated timestamps). Every edge gets an adversarial score — edges with score > 0.3 are flagged. In our demo, we detected 1 suspicious file out of 50."

**Q: How do you handle ML being wrong?**
> "ML predictions are hypothesis generators, not conclusions. Every ML output goes through 6 quality checks. The Critic maintains competing hypotheses and evaluates Findings as CORROBORATED, REFUTED, or INCONCLUSIVE. If the GNN says 'these people are connected' but the CDR shows they never called each other, the contradiction is flagged. The reasoning layer has final authority — it can override ML outputs. Findings are persistent objects with stable references — the Critic evaluates actual persisted data, not a temporary session."

**Q: Can this be gamed by criminals?**
> "We have adversarial defense that detects graph poisoning, identity manipulation, and temporal fabrication. But honestly, a sophisticated adversary could potentially inject noise. That's why the Critic maintains competing hypotheses and the investigator has final authority. The system is a tool, not a judge."
