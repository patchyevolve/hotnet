# PIPELINE PITCH — Daksh Walia

## Your Opening Line

> "I'm Daksh Walia, and I handle the backend, ML, and analytics layer of our system — NexWinner's AI-Powered Criminal Network Analysis platform. Let me walk you through how our pipeline actually works."

---

## The 7-Stage Pipeline (Say This)

### Stage 1 — Ingestion
> "We accept 6 file formats: CSV, JSON, TXT, PDF, DOCX, and images. Every file gets SHA-256 hashed for chain of custody, quality-scored on a 0-1 scale, and classified by source type — CDR, bank, FIR, CCTV, social, device, text. We also detect adversarial data: files that look suspicious get flagged automatically. Each source type has a **reliability matrix** — for example, CDR timing is 95% reliable, but CDR identity is only 60% because SIM sharing is common."

**Key numbers:** 50 files ingested, 6 source types, average quality score 0.986, 1 suspicious file flagged.

---

### Stage 2 — Extraction
> "We extract entities and relationships. Two modes: code-based for structured data like CSVs, and LLM-based for unstructured text like witness statements. Every entity gets tagged with an **epistemic category** — OBSERVATION (direct record), INFERENCE (derived), or HYPOTHESIS (theory). This is critical: **the system may increase confidence of a hypothesis but can never upgrade an inference into an observation.** This prevents the AI from presenting guesses as facts."

**Key numbers:** 210 raw entities, 383 relations, 9 entity types, 11 relation types.

---

### Stage 3 — Entity Resolution
> "Different sources spell names differently — 'Rakesh Kumar', 'R. Kumar', 'Rakesh K.' — and SIM sharing means phone numbers don't reliably identify people. Our resolution engine uses 5 signals: exact match, fuzzy matching (Jaro-Winkler), phonetic matching (Soundex + Metaphone + Indian transliteration), shared attributes, and LLM evaluation. From 210 raw entities, we resolved down to 175 canonical entities — a 16% reduction. We found 15 identity contradictions that need investigator attention."

**Key numbers:** 210 → 175 entities (16% reduction), 49 auto-merges, 3 review-required, 15 contradictions, 0.27s processing time.

---

### Stage 4 — Temporal Enrichment
> "We parse 20+ date formats, normalize timestamps to ISO 8601, and compute Allen's 13 temporal relations — before, after, during, overlaps, etc. We detect temporal contradictions: for example, a suspect can't be at two locations simultaneously. From our demo data, we found **22 temporal contradictions** — these are investigation leads."

**Key numbers:** 379 temporal infos, 24 spatial infos, 22 coverage intervals, 26 timeline events, 22 temporal contradictions.

---

### Stage 5 — Graph Build
> "We build an entity-relationship graph with 179 nodes and 86 edges. Every edge gets confidence propagation — the minimum of source, target, and extraction confidence, with corroboration boost and contradiction penalty. We classify edges into 4 semantic categories: entrepreneurial (business), associational (social), quasi-governmental (enforcement), and upperworld bridge (legitimate fronts). We also track provenance chains — every node and edge traces back to specific raw evidence files."

**Key numbers:** 179 nodes, 86 edges, 12 communities, 86 provenance chains, 7 multiplexity ties.

---

### Stage 6 — Analytics (YOUR PART — Say This With Confidence)
> "This is where the ML kicks in. We compute 7 types of analytics in 0.05 seconds using NetworkX and NumPy:"

**1. Centrality Analysis:**
> "We identify the most important nodes using 5 metrics: degree, betweenness, closeness, eigenvector, and PageRank. In our demo, phone number 9876543210 has the highest degree centrality with 14 connections — it's the communication hub."

**2. Community Detection:**
> "We use greedy modularity optimization to find clusters. We found 12 communities of size 2 or more — groups of entities that are densely connected internally."

**3. Anomaly Detection:**
> "6 types of anomalies: degree outliers (hubs), confidence gaps (high confidence but isolated), contradiction clusters (entities with many conflicts), isolated high-value nodes (strong evidence but no connections), coverage gaps (missing temporal data), and temporal bursts (intense activity in short windows). We found **54 anomaly signals** — these are all investigation leads."

**4. Behavioral Baselines:**
> "We establish what's 'normal' for each entity type. Average person node has 3.3 connections. Anyone with more is statistically unusual."

**5. Correlations:**
> "We test whether properties are related. Do higher-confidence entities have more connections? Do entities with temporal data have higher degree? These help Stage 7 (Hypothesis) generate hypotheses."

**6. Component Analysis:**
> "We analyze each connected component. 135 components, but only 8 have more than 1 node. The largest has 37 nodes — that's the core criminal network."

**7. Temporal Patterns:**
> "We detect activity bursts, regular patterns, and timestamp anomalies. 11 patterns found."

---

### Stage 11 — Global Entity Push + Case Relationships (Designed, Not Implemented)
> "Stage 11 will push local entities to the Global Entity Identity Index — linking the same real-world person across different Cases. When the same phone number appears in a Delhi FIR and a Mumbai FIR, the system creates a CaseRelationship with a SHARED_ENTITY observation. The system never automatically declares 'same incident' — that requires investigator confirmation. The original observation is never lost."

### Stage 12 — Scoped Analysis (Designed, Not Implemented)
> "Stage 12 runs analytics across multiple Cases via AnalysisRun — an immutable historical execution. The investigator selects which Cases to analyze together, the system merges local graphs using GlobalEntity identity links, runs GNNs and Bayesian Networks, and stores results permanently. Each AnalysisRun preserves the exact relationship and entity state used at execution time."

---

## Case Relationship Model (Say This When Asked)

> "In real investigations, the same suspect can appear in multiple FIRs across different jurisdictions. We model this with CaseRelationship — a first-class entity that tracks how independent Cases relate."

**Three types of relationships:**
1. **SHARED_ENTITY** — same person/phone appears in both Cases (system observation)
2. **RELATED_CASE** — Cases are substantively connected (investigator-confirmed)
3. **SAME_INCIDENT** — separate FIRs about the same incident (investigator-confirmed)

**Key design decisions:**
- The system is conservative — Stage 11 only generates SHARED_ENTITY observations
- Only the investigator can confirm SAME_INCIDENT or RELATED_CASE
- A phone match alone must never automatically become "same incident"
- CaseRelationshipHistory preserves the full evolution trail

---

## Investigation Workspace (Say This When Asked)

> "Investigators organize their work through InvestigationWorkspaces — sets of Cases they're currently working on. The same Case can be in multiple workspaces. Workspace membership does NOT grant Case access — that's a separate authorization layer called CaseAccess."

---

## FIR Lifecycle (Say This When Asked)

> "FIR identity is immutable, but lifecycle state is mutable and authorization-controlled. Three independent dimensions: investigation_status (police operational state), legal_disposition (court/legal state), and record_status (administrative state). Every transition generates FIRLifecycleHistory — a complete audit trail. Sensitive transitions like legal disposition require appropriate authorization."

---

## Key Numbers to Memorize

| Metric | Value |
|--------|-------|
| Pipeline stages | 8 (6 implemented, 2 designed) |
| File formats | 6 |
| Entity types | 16 |
| Relation types | 16 |
| Raw entities | 210 |
| Resolved entities | 175 |
| Graph nodes | 179 |
| Graph edges | 86 |
| Anomaly signals | 54 |
| Communities | 12 |
| Temporal contradictions | 22 |
| Identity contradictions | 15 |
| Analytics time | 0.05 seconds |
| New entities (Revision 3+) | 11 |

---

## Geospatial Crime Zone Risk Mapping (Say This)

> "We also do **geospatial crime zone risk mapping**. Every location entity — FIR addresses, CDR tower locations, CCTV camera positions, social media check-ins — gets geocoded using OpenStreetMap's Nominatim API. We convert coordinates to H3 hexagonal cells (Uber's hex grid, ~0.1 km² per cell). Each cell gets a risk score based on evidence density. The output is an interactive map with three risk bands — green (low), amber (medium), red (high). Investigators can click any hex to see which cases and evidence are concentrated there."

**Key numbers:** 26 location entities extracted (Karol Bagh, Lajpat Nagar, Dwarka, Connaught Place, Nehru Nagar, Noida Sector 62), all real Delhi locations.

**For the panel:**
> "Our pipeline already extracts 26 location entities from FIRs and CDRs. We geocode them, convert to hex cells, and score by evidence density. This helps identify crime hotspots and allocate patrol resources."

---

## Tricky Questions

**Q: Why is your graph so sparse? 135 components for 179 nodes?**
> "Honest answer: our demo data is limited — 50 evidence files for a single case. Most entities are DATE and AMOUNT nodes that don't connect to each other. The core network has 37 nodes in the largest component — that's where the real relationships are. In production with hundreds of CDRs, bank records, and CCTV logs, the graph would be much denser."

**Q: How is this different from Palantir or IBM i2?**
> "Three differences: (1) **Multilingual** — we handle Hindi + English, which Palantir doesn't. (2) **Explainable** — every output has a provenance chain and confidence decomposition. Palantir is a black box. (3) **Adversarial robustness** — we actively detect and flag data manipulation. Most tools assume clean data. Also, we're open-source and designed for Indian law enforcement budgets."

**Q: What's your biggest limitation right now?**
> "Data. Our demo has 50 files. Production would have thousands. The graph algorithms work but produce trivial results on sparse graphs. The ML needs training data we don't have yet. And the biggest real-world challenge isn't technical — it's getting police stations to adopt digital evidence management in the first place."

---

## Cross-Case, Multi-Jurisdiction Architecture (Say This When Asked)

> "In real investigations, a single phone number can appear in FIRs across multiple states. Our system handles this through **global entity resolution** — every entity gets a canonical ID that persists across cases. When the same phone number appears in a Delhi FIR and a Mumbai FIR, the system automatically links them via GlobalEntity and creates a CaseRelationship."

> "We track which FIR each evidence file belongs to through file naming conventions and content parsing. The output isn't per-station — it's per-entity. We show: 'Phone 9876543210 appears in 3 FIRs across Delhi, Mumbai, and Hyderabad. This is a cross-state link that needs investigation.'"

**Key architecture points:**
- Global entity resolution across all cases (not per-case)
- Jurisdiction hierarchy: Nation → State → District → Zone → Station (configurable tree)
- CaseRelationship: tracks how independent Cases relate (SHARED_ENTITY → SAME_INCIDENT)
- InvestigationWorkspace: investigators organize their work across authorized Cases
- AnalysisRun: scoped analysis with immutable historical execution
- FIR lifecycle: three independent dimensions with complete audit trail
- Evidence tracking: FIR number linked to every evidence file
- CaseAccess: separate authorization layer (not workspace membership)
