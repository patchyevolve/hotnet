# CrimeNet — Fresh Machine Setup

Everything required to stand the full system up on a new PC, in order.
Verified against the current repo state (Sept 2026).

---

## 1. Prerequisites

| Tool | Version / notes |
|---|---|
| Docker Engine + Compose | v2 (`docker compose` syntax). ~5–8 GB disk for images + build cache after first build |
| Git | any recent |
| Node.js + pnpm | Node 20+, pnpm 9+ — only for frontend dev/tests |
| Python | 3.12 — only for backend tests / running the pipeline natively |
| Internet | first `compose build` pulls base images (python:3.12-slim, pgvector, neo4j, minio, node) |

Everything else (tesseract OCR eng+hin, opencv, insightface, FastAPI deps) is
baked into the Docker images — no host Python setup is needed just to run it.

---

## 2. Get the code

```bash
git clone https://github.com/patchyevolve/hotnet.git
cd hotnet
```

---

## 3. Secrets — create `.env` (NOT in git)

Create `CriminalNetwork/system/.env` with your provider keys (the API reads it
via the bind mount; names are all the pipeline looks for):

```dotenv
GROQ_API_KEY=...
SILICONFLOW_API_KEY=...
OPENROUTER_API_KEY=...
GOOGLE_API_KEY=...
MISTRAL_API_KEY=...

APP_ENV=production
APP_DEBUG=false
```

- Infrastructure credentials (postgres/neo4j/minio) are supplied by
  `docker-compose.yml` itself — you do **not** put them in `.env`.
- `.env` is gitignored. **Never commit it.** Copy it verbatim from the old
  machine instead of re-typing keys.
- Without keys the system still boots and the pipeline still runs; LLM-backed
  stages record `llm_status: rate_limited/failed` instead of enriching.

---

## 4. What git does NOT bring over (copy these from the old machine)

These exist only on the old PC — decide whether you need them:

| Path | Why it matters |
|---|---|
| `CriminalNetwork/system/.state/` (entire dir) | Case registry, all evidence files, run outputs, faces, `session.secret`. Without it you start with **zero cases** and rebuild the demo (step 7). |
| `CriminalNetwork/demo_data/*.jpeg` (4 files: `amit`, `rakesh`, `atmcctv`, `confectionaryCCTV`) | Face-recognition demo images — untracked; needed only if re-seeding with faces. |
| `CriminalNetwork/system/.env` | step 3 |

Fast transfer from the old machine:

```bash
rsync -a old-pc:hotnet/CriminalNetwork/system/.state/ \
          ./CriminalNetwork/system/.state/
scp old-pc:hotnet/CriminalNetwork/system/.env ./CriminalNetwork/system/.env
scp old-pc:hotnet/CriminalNetwork/demo_data/*.jpeg ./CriminalNetwork/demo_data/
```

---

## 5. Start the stack

```bash
cd CriminalNetwork/system
docker compose up -d --build
docker compose ps          # wait until criminal_network_api is "healthy"
```

First build takes a few minutes (API image compiles tesseract/opencv/
insightface; frontend bundle is baked in). Then open:

**http://localhost:8080**

| Service | Port | Notes |
|---|---|---|
| Frontend | 8080 | nginx serving the built SPA |
| API (FastAPI) | 8000 | health: `GET /api/meta` |
| PostgreSQL (pgvector) | 5432 | `init.sql` auto-runs on a fresh volume |
| Neo4j | 7474 (UI) / 7687 (bolt) | auth `neo4j/criminal_secret` |
| MinIO | 9000 / 9001 (console) | auth `criminal/criminal_secret` |

---

## 6. Sign in

The sign-in screen is an **identity picker** (no password): type any display
name, choose a role (INSPECTOR / SUPERVISOR / ADMIN / AUDIT_LOGGER) and a
jurisdiction → the API signs a session token (secret auto-created at
`.state/session.secret`). This is the demo identity provider; swapping in
`CredentialIdentityProvider` changes nothing in the UI.

---

## 7. Rebuilding the demo data (only if you didn't copy `.state/`)

1. **Case Intake** → register an FIR (title, FIR number).
2. Attach evidence: all files from `CriminalNetwork/demo_data/`
   (CSVs, TXTs, JSONs — and the 4 `.jpeg` photos if you copied them).
3. **Run pipeline** — watch the 12 stages (ingest → … → critic → persist),
   a few minutes.
4. Results appear across Command Center, Graph Analytics, CDR, Money Trail,
   Command Map, Faces, AI Investigator, Evidence Vault.
5. Repeat for a second case if you want multi-case views.

---

## 8. Development mode (optional, alongside Docker)

Frontend (`frontend and backend/`):

```bash
pnpm install
pnpm --dir src/frontend dev   # Vite dev server
pnpm typecheck                # gates (run in frontend and backend/)
pnpm test                     # 96 tests
pnpm build
```

Backend (`CriminalNetwork/system/`):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/ -q     # 389 tests
```

Edit–run loop:
- **API** source is bind-mounted (`./:/app`) — edit `api/*.py`, then
  `docker compose restart api` (no rebuild; uvicorn has no `--reload`).
- **Frontend** bundle is baked into the image — after changing
  `frontend and backend/src/frontend/**`:
  `docker compose build frontend && docker compose up -d frontend`.
- **Pipeline** changes (`src/**`, `run.py`) are also bind-mounted — a new run
  picks them up; only `docker/api` Python under `api/` needs the restart above.

---

## 9. Reset / troubleshooting

```bash
docker compose logs -f api              # API logs
docker compose down -v                  # HARD RESET: wipes DB/neo4j/minio
                                        # volumes; init.sql re-runs on next up.
                                        # .state/ case files are untouched.
docker compose build api && docker compose up -d api   # rebuild one service
```

- **Port already in use** → edit the left side of `ports:` in `docker-compose.yml`.
- **Stale images / low disk** → `docker image prune -a && docker builder prune -a`.
- **API unhealthy** → check `.env` parses (`KEY=value`, no quotes mismatch)
  and `docker compose ps` shows postgres/neo4j/minio healthy first.
- **Demo looks empty after a fresh clone** → you skipped step 4/7 (git ships
  code + `demo_data` inputs, not processed `.state/`).

---

## 10. New-PC checklist (print this)

- [ ] Install Docker + git
- [ ] `git clone https://github.com/patchyevolve/hotnet.git`
- [ ] Copy `.env` → `CriminalNetwork/system/.env`
- [ ] Copy `.state/` (+ demo_data `*.jpeg`) if you want the existing demo intact
- [ ] `cd CriminalNetwork/system && docker compose up -d --build`
- [ ] Wait for `criminal_network_api` healthy → open http://localhost:8080
- [ ] Sign in (name + role + jurisdiction)
- [ ] Smoke test: Command Center loads, Case Intake runs a job, Command Map
      shows India hexes
- [ ] (Dev) `pnpm install && pnpm typecheck && pnpm test && pnpm build`
- [ ] (Dev) `python -m pytest tests/ -q`

---

## 11. Notes on data & disk

- **Git ships**: all source, `demo_data/` evidence inputs (66 files), India
  basemap JSONs (`frontend and backend/src/frontend/src/data/`), fixtures.
- **Git does not ship**: `.state/` (processed cases), `.env`, demo face JPEGs.
- Computed results (postgres/neo4j/minio) are **derived** — losing them is
  safe; re-running a case rebuilds them from `.state` evidence.
- A full teardown (`containers + images + volumes + build cache`) reclaimed
  ~19 GB on this machine (Docker reported 12.3 GB images + 26.3 GB build
  cache; overlay sharing makes `df` show less). One volume,
  `codepracticedaily_pgdata`, belongs to a different project and was kept —
  delete it with `docker volume rm codepracticedaily_pgdata` if unwanted.
