# Database Table Persistence Classification

Status: **audit complete — decisions recorded, no further writers planned**
Scope: the 61 tables in `criminal_network_db`; 16 were already wired, 47 were permanently 0 rows.

## Method

For every zero-row table:

1. FK graph and column types from `information_schema`.
2. `grep` across `src/**`, **excluding** `src/models/schema.py` ORM definitions.
3. Traced whether the same data reaches `output_geo/*.json`.
4. Distinguished "writer exists, legitimately 0 rows" from "never written".

## Root cause

`src/db/connection.py` (738 lines, async Prisma) defines `create_fir`, `create_case`,
`create_person`, `create_suspect`, `create_evidence`, `create_face_embedding`,
`create_audit_log` and re-implements the run/entity/edge writers. It is imported only
by `migrate.py` (`get_client`, `disconnect`) and never at runtime — the Prisma client
hangs in this environment. Runtime persistence uses psycopg2 in `src/pipeline.py` and
`src/global_push/engine.py`.

Do not revive `connection.py` to populate legacy tables.

## Classification

### Category 1 — Out-of-scope / intentionally unused (25)

Product, auth and workspace features that have no pipeline source of truth.

`User`, `WorkspaceMember`, `WorkspaceCase`, `InvestigationWorkspace`, `CaseAccess`,
`AnalysisRun`, `AnalysisRunCase`, `AnalysisRunResult`, `CaseNarrativeEmbedding`,
`CaseRelationship`, `CaseRelationshipHistory`, `CaseEntityLink`, `CaseJurisdictionLink`
(`Case.jurisdictionNodeId` already set at `pipeline.py:209`),
`JurisdictionHistory`, `UnresolvedJurisdiction` (no computation exists),
`EvidenceFile`, `FIRLifecycleHistory`, `AudioTranscript`, `OcrResult`, `Finding`
(only non-schema hit is a print at `resolution/engine.py:147`).

Domain-entity tables superseded by `ResolvedEntity` — wiring them would duplicate
authoritative data: `Phone`, `Location`, `BankAccount`, `Vehicle`, `PersonAlias`.
Evidence these already exist in `ResolvedEntity`: `attributes.phone` holds
213/210/211/212/214; `aliases` holds
`["Meena Devi","Meena Ji","meena_devi_2024","मीना देवी"]` and Rakesh's `Bhai`.

`audit_trail.json` (11 records) covers *pipeline-stage* audit but is **not** `AuditLog`
(user-action semantics: `userId`, `ipAddress`, `resourceType`).

### Category 2 — Pipeline-adjacent, should be persisted (1) — **WIRED**

`AdversarialCheck` — see "AdversarialCheck wiring" below.

### Category 3 — Computed but surfaced elsewhere (13) — stay JSON-only

Wiring would create a second copy of authoritative pipeline output.

| Table | Computed at | Authoritative surface |
|---|---|---|
| AdversarialEdgeScore | `builder.py:305` | `adversarial_scores.json` (79 records) |
| MissingEdge | `builder.py:1318,1464` | `missing_edges.json` (6) |
| RejectedEdge | `builder.py:1265,1275,1694` | `rejected_edges.json` (written only when non-empty; 0 records) |
| CoverageInterval | `temporal/engine.py:753` | `coverage_intervals.json` (22) |
| EventCluster | `temporal/engine.py:114` | `event_clusters.json` (5) |
| ResolutionHistory | `merger.py:239` | `resolution_history.json` (14) + `resolution_log.json` |
| CrimeZoneScore | analytics zone scoring | `zone_scores.json` (15) |
| ExtractionLog | pipeline stages | `extraction_summary.json → extraction_log` |
| DependencyGroup | `ingestion/engine.py:245` | `extraction_summary.json → dependency_groups` |
| EvidenceIntegrity | `ingestion/engine.py:132` | `extraction_summary.json → evidence_integrity` (+ `chain_of_custody`, `file_hash`) |
| DataQualityScore | `ingestion/engine.py:666` | `ingestion_summary.data_quality` + per-file `files[].quality_score` |
| CrossCaseAlert | writer exists `global_push/engine.py:576` | `cross_case_alerts.json` (0 — 0 alerts is correct) |
| CrossCaseAlertCase | writer exists `global_push/engine.py:587` | same |

### Category 4 — Schema/support (1)

`GeographicJurisdiction` — reference/boundary layer for `Location`.

### Category 5 — Obsolete / legacy (6)

Dead writers in `src/db/connection.py`: `FIR` (`create_fir:464`), `Person` (`:518`),
`Suspect` (`:548`), `Evidence` (`:584`), `FaceEmbedding` (`:610`), `AuditLog` (`:667`).

Caveat: `FIRFeeder` is live (`pipeline.py:27`) and parses `FIR_MANIFEST.json` into
`fir_number`/`fir_id`, used only for file grouping. The data exists in memory if a FIR
row is ever wanted — that is a product decision, not a pipeline gap.

### Category 6 — Unclear, persistence semantics unresolved (1)

`EntityResolutionCandidate` — see design note below.

**Totals: 25 + 1 + 13 + 1 + 6 + 1 = 47.**

---

## AdversarialCheck wiring (implemented)

Constraint honoured: persistence of the existing in-memory result only.

```
ingestion → adversarial analysis → IngestionEngine.adversarial_checks
                                        ├── existing JSON output (untouched)
                                        └── NEW DB persistence (pipeline.py step 0b)
```

- Writer: `src/pipeline.py` step `0b`, inside `_persist_to_database`, using the
  already-built `file_id_map` (filename → `IngestedFile.id`).
- Fields written: `id`, `runId`, `ingestedFileId`, `isSuspicious`,
  `behavioralAnomaly`, `temporalAnomaly`, `contentAnomaly`, `duplicateSuspect`,
  `score`, `reasons` (jsonb array).
- Idempotency: `id = generate_id("ADVCHK", f"{run_id}:{file_name}")` + `ON CONFLICT
  ("id") DO UPDATE`. Re-persisting a run upserts; a new run mints new ids and the
  runId prune reclaims the old rows (`AdversarialCheck` added to `stale_tables`
  **before** `IngestedFile` for FK safety).
- Non-blocking: guarded by its own `try/except`; a failure prints a warning and
  cannot abort the prune, the run-status update, or the run itself. The analytical
  result already exists in JSON before this block runs, so the DB copy is never
  authoritative.
- No detection logic, thresholds or JSON output were modified.

### LIMITATION — `AdversarialCheck.riskLevel`

`riskLevel` is schema-required but has **no defined pipeline derivation**. The
computation produces `score`, `reasons` and the four anomaly flags, but no risk
classification, and none is documented in `OUTPUTS.md` or `11_STAGE1_INGESTION.md`.
Persisted records therefore use the schema default `LOW`.

> Consumers must not interpret `AdversarialCheck.riskLevel` as an analytically
> derived risk classification. Until a risk classification policy is specified,
> the field carries no signal. The other nine columns are the authoritative
> computed signals.

Locking test: `test_adversarial_check_has_no_risk_level_in_computation`.

---

## EntityResolutionCandidate — design note (no schema or writer changes)

**Classification:** *computed partially, persistence semantics unresolved.*

### What exists today

- `MergeCandidate` objects are produced by `rule_pass.py` (fuzzy, rule-based and
  phonetic passes) and consumed in-memory by the resolution engine.
- The **pairs** are not persisted anywhere. Only counts survive, in
  `resolution_log.json`: `phonetic_candidates: 18`, `fuzzy_index_candidates: 23`,
  `disambiguated_pairs: 35`.
- The only per-pair persistence is `confirmation_log.json` (7 entries), and it
  covers **pending** candidates only — rejected/decided pairs are discarded.
- No code produces a row matching the table's shape
  (`sourceEntityId → ExtractedEntity`, `candidateEntityId → ResolvedEntity`,
  `similarityScore`, `matchType`, `status`).

### Open questions before wiring

Do not persist the bounded candidate set until each is decided explicitly:

1. **Which candidate-generation stages qualify** — rule-based, fuzzy, phonetic,
   disambiguation? Each emits different evidence.
2. **Candidate vs rejected pair** — a rejected pair is not a non-event; today it is
   lost entirely, which weakens the "track uncertainty" requirement in
   `INPUT_DATA.md` §Scenario 3.
3. **Status/state semantics** — the `status` enum is undefined in both prisma and
   code. Inventing values would be new analytical policy, not persistence.
4. **Relationship to `confirmation_log.json`** — decide whether this table becomes
   the authoritative store that the JSON mirrors, or whether the JSON stays
   authoritative (Category 3 rule) and the table is redundant.
5. **Retention** — candidates are per-run; confirm run-scoped prune vs cross-run
   history before choosing a PK strategy.

### Related requirement

`documents/ML_ENGINE.md` (THREAT 2) specifies detection as *"Identity resolution
uncertainty propagation"*, and `INPUT_DATA.md` §Scenario 3 says *"Track uncertainty"*.
Any wiring decision should be assessed against that requirement — the current
`resolution_history.json` records merges (14) but not the uncertainty around
rejected alternatives.

---

## Decision summary

| Category | Count | Action |
|---|---|---|
| 1 Out-of-scope | 25 | remain unwired |
| 2 Pipeline-adjacent | 1 | **wired** (`AdversarialCheck`) |
| 3 Surfaced elsewhere | 13 | remain JSON-only (wiring duplicates authoritative output) |
| 4 Schema/support | 1 | remain unwired |
| 5 Obsolete/legacy | 6 | remain unwired; do not revive `connection.py` |
| 6 Semantics unresolved | 1 | design note only (`EntityResolutionCandidate`) |
