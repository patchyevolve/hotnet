# CrimeNet — Judges' Demo Guide

Everything you need to explain the system, walk the demo, and answer the
questions judges actually ask. All numbers below are from the running system.

---

## 1. The pitch (30 seconds)

> CrimeNet is an **intelligence workstation for law-enforcement teams**. You
> feed it raw case evidence — CDR dumps, bank statements, FIRs, CCTV logs,
> witness notes, photos — and a **12-stage pipeline** turns it into a resolved
> entity graph, money trails, call networks, timelines, risk scores, and
> **AI-generated hypotheses that critique themselves**. Investigators work in
> one dark-mode console: cases, graph analytics, a hex-map of India, face
> review, and a full audit chain. Every number on screen traces back to a real
> file in the evidence vault — nothing is invented.

---

## 2. System at a glance

| Layer | What it is |
|---|---|
| Frontend | React 19 + Vite 5 + TypeScript, Tailwind + shadcn/ui, TanStack Router/Query, Recharts, h3-js — 16 routes, 13 nav sections, EN/हिंदी bilingual |
| API | FastAPI on :8000 — cases, FIRs, evidence, runs, jobs, findings, faces, audit |
| Pipeline | Python 12-stage subprocess per case run (ingest → … → critic → global push) |
| Data stores | PostgreSQL (pgvector), Neo4j, MinIO S3 — plus per-case JSON run outputs |
| Infra | Docker Compose: `criminal_network_api`, `criminal_network_frontend` (:8080), postgres, neo4j, minio |

**Data flow:** Evidence upload → `FIR_MANIFEST.json` → pipeline subprocess
(job with live stage progress) → per-case `output/` JSON → API *projection
layer* (typed, read-only) → UI.

---

## 3. The pipeline (what happens when you press Run)

Job progress maps 1:1 to these stages — you can show them ticking live:

1. **Ingestion** — parses CSV/JSON/TXT/PDF/XLSX/DOCX **and images (jpg/png via
   OCR, English + Hindi)**; records sha256 + chain-of-custody; flags
   adversarial/trap files rather than rejecting them ("at their own risk"
   contract).
2. **Extraction** — LLM/rule extraction of entities and relations from every
   file, with provenance back to the source line/file.
3. **Entity resolution** — merges aliases ("Rakesh Kumar" / "Rakesh") into
   canonical entities; unresolved names become explicit unknowns, never silent
   drops.
4. **Temporal enrichment** — incident dates, intervals, contradictions in time.
5. **Graph build** — nodes/edges + provenance chains.
6. **Analytics** — centrality, communities, anomalies, behavioural baselines.
7. **Hypothesis engine** — falsifiable hypotheses (e.g. "the group is
   coordinated…").
8. **Contradiction adjudication** — every hypothesis is challenged; resolved or
   routed to a human.
9. **Gap detection** — what evidence is *missing* to prove the claim (shown in
   the Live Intelligence Feed as "Evidence gap · Close gap").
10. **Critic review** — read-only consistency pass over the run's own outputs.
11. **Global entity push** — cross-case identity index (matched 146 globals in
    the demo run).
12. **Persist** — results written to PostgreSQL.
    *(+ Stage 2.5 — **face recognition** runs between extraction and
    resolution: detects faces in image evidence, embeds, links them to person
    entities.)*

**Honesty by design:** counts may be 0, but *measurements never are* — a
record without a timestamp is dropped rather than shown as a fabricated 0.
Hypotheses always display their confidence and citations.

---

## 4. Demo script (~3 minutes)

Sign-in uses the demo token; pick a role from the top-bar switcher
(INSPECTOR / SUPERVISOR / ADMIN / AUDIT_LOGGER — each role sees different
metrics).

1. **Command Center** — metric cards, Risk Distribution donut (160 cases: 7
   critical / 29 high / 26 medium / 98 low), **Case Activity** bars (per-day
   timeline + pipeline-run days, fresh bar = the actual run), **Live
   Intelligence Feed** (hypotheses + evidence gaps, scrollable), **Network
   Activity** timeline with distinct events and real dates.
2. **Case Intake** — register an FIR → attach evidence files → **Run
   pipeline**. Watch the 12 stages tick. *Talk track: "re-run with more files
   later — it re-processes only the new files, everything else is preserved."*
3. **Cases → Case Workbench** — case record, FIRs, evidence, per-case metrics.
4. **Graph Analytics** — communities, centrality, components (risk-colored).
5. **Network Intelligence / CDR / Money Trail** — call networks, CDR analysis,
   and staged transaction flows (metrics + searchable flow tables).
6. **Command Map** — real India basemap (outline + 36 state borders) with
   **H3 hex risk cells**: zoom out → red critical hexes + aggregated count
   badges; zoom in → hexes subdivide (resolution follows zoom, capped for
   performance) and individual pins appear; click a pin/hex → detail panel;
   "H3 Risk Areas" toggle hides/shows the layer. Fully client-side (no map
   server), pan/drag + wheel zoom.
7. **Face Intelligence** — side-by-side face comparison with
   confirm/reject decisions persisted as investigator review.
8. **AI Investigator** — the hypothesis/contradiction/gap/critic conversation.
9. **Evidence Vault** — every file with hash + custody chain (collected →
   analyzed).
10. **Security & Audit** — audit trail of every action.

---

## 5. Page catalogue (one line each)

| Route | What judges see |
|---|---|
| `/` Command Center | Mission-control dashboard: metrics, risk donut, case activity, live feed, network activity, system status |
| `/intake` Case Intake | Register FIR → upload evidence → run/append pipeline with live stage progress |
| `/cases`, `/cases/$id` | Case list + workbench (FIRs, evidence, metrics, recent activity) |
| `/analytics` Graph Analytics | Communities, centrality, components on the graph |
| `/network` Network Intelligence | Entity/relationship network with risk bands |
| `/cdr` CDR Analysis | Call detail records, patterns, hot numbers |
| `/money-trail` Money Trail | Transaction flows across accounts |
| `/map` Command Map | India basemap + H3 hex risk layer + tappable pins |
| `/entities`, `/entities/$id` | Entity list + dossier (aliases, identifiers, risk) |
| `/face` Face Intelligence | Face matches with investigator confirm/reject |
| `/ai-investigator` | Hypotheses, contradictions, evidence gaps, critic review |
| `/evidence` Evidence Vault | Files, hashes, chain of custody |
| `/security` Security & Audit | Audit events, problem-flagged runs |

---

## 6. Questions judges ask (short answers)

**"What's real vs. demo data?"**
The *application and pipeline are real*: uploads, runs, OCR, resolution,
graph, faces, audit all execute live. The preloaded cases are **fictional
demo evidence** (clearly labelled "All records are fictional demonstration
data" in the footer).

**"Can you add files to an existing case?"**
Yes. Evidence append never overwrites (duplicate names get suffixed), the FIR
manifest is rewritten, and the next run processes **only new files** while
re-running the full downstream chain over old + new state. Same-session
uploads on Case Intake show an **"Append and re-run"** button.

**"Do images work?"**
jpg/jpeg/png: ingested, **OCR'd with Tesseract (English + Hindi installed)**,
text flows into extraction like any document; face stage detects and links
faces. Low-quality scans are flagged (not hallucinated). Note: webp/bmp/tiff
upload but aren't ingested.

**"Is the AI trustworthy?"**
It never states findings as fact — every claim carries a confidence score and
citations, is attacked by a contradiction stage, gap-checked (what's missing
to prove it), and re-reviewed by a critic. Output is shown as *hypotheses*.

**"Why hexes and not Google Maps?"**
Zero API keys/costs/offline-capable; H3 gives uniform risk aggregation with
zoom-driven detail (resolution follows zoom, r2 when fitted → r9 zoomed in)
entirely client-side over a bundled Natural Earth basemap.

**"Accessibility / design?"**
Colorblind-safe Okabe-Ito palette in OKLCH tokens (risk bands), keyboard-
operable map cells, EN/हिंदी localization, dark-first professional console.

---

## 7. Verification (say this if asked "how do you know it works")

- **Backend: 389 pytest tests** (pipeline stages, API, ML baselines, integrity).
- **Frontend: 96 vitest tests** across 13 files (flows incl. command center,
  map, faces, intake, evidence).
- **Gates:** `pnpm typecheck` · biome lint · `pnpm build` — all green.
- Live verification via CDP screenshots (map fitted z4.5/r2 → zoomed z8.5/r5,
  dashboards populated from the real API).
- Frontend is test-backed by a **real-run API fixture dump** — no hand-written
  mock values in tests.

## 8. Known limitations (volunteer these — judges respect honesty)

- Vision-model OCR fallback is wired but not enabled (low-quality scans yield
  faces only).
- Evidence upload UI is scoped to the intake session; adding files to an
  *older* case goes through the API today.
- Demo metrics come from the seeded run; a fresh upload changes them live.

## 9. Run it

```bash
cd CriminalNetwork/system
docker compose up -d          # api :8000, frontend :8080, pg/neo4j/minio
# open http://localhost:8080  → sign in with the demo token
```

Gates: `pnpm typecheck && pnpm test && pnpm build` (in `frontend and backend`),
`python -m pytest tests/ -q` (in `CriminalNetwork/system`).
