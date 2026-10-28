# netroncrime — CrimeNet

CrimeNet is an intelligence workstation for law-enforcement teams: raw case
evidence (CDR dumps, bank statements, FIRs, CCTV logs, photos) goes through a
12-stage pipeline and comes back as a resolved entity graph, money trails, call
networks, risk scores and self-critiquing hypotheses — all worked in one
dark-mode console behind role-based access control.

| Path | What it is |
|---|---|
| `CriminalNetwork/system/` | FastAPI API, pipeline, stores, backend test suite |
| `frontend and backend/src/frontend/` | React 19 + Vite 5 console (the SPA) |
| `SETUP.md` | fresh-machine setup and Docker walkthrough |
| `JUDGES_DEMO_GUIDE.md` | scripted demo (numbers, talk track, FAQ) |

## Run it

```bash
cd CriminalNetwork/system
docker compose up -d --build     # api :8000, frontend :8080, pg/neo4j/minio
# open http://localhost:8080
```

Full instructions (`.env`, first build, reset): see `SETUP.md`.

## Sign in — credentials, not a role picker

The sign-in screen takes an **email/badge + password**. The API answers with a
signed bearer token (`POST /api/auth/login`), the SPA stores it, and every
request carries it automatically; a 401 or a sign-out returns you to
`/signin`. The old demo identity picker and top-bar role switcher are gone —
your role comes from the token and the UI (navigation, buttons, pages) follows.

Demo accounts (seeded by `docker-compose.yml` via `CRIMENET_SEED_DEMO_USERS=1`):

| Email | Role | Station |
|---|---|---|
| `admin@crimenet.local` | ADMIN | Delhi Cybercrime |
| `supervisor@crimenet.local` | SUPERVISOR | Delhi Cybercrime |
| `supervisor.mumbai@crimenet.local` | SUPERVISOR | Mumbai Cybercrime |
| `inspector@crimenet.local` | INSPECTOR | Delhi Cybercrime |
| `auditor@crimenet.local` | AUDIT_LOGGER | Delhi Cybercrime |

Shared password: **`Cr1menet!Demo`** (override with `CRIMENET_DEMO_PASSWORD`).
Seeding is **off by default** — only a deployment that sets
`CRIMENET_SEED_DEMO_USERS=1` gets these accounts, and an existing account is
never overwritten.

## Access control (RBAC)

Server (`CriminalNetwork/system/api/rbac.py`) and client
(`src/lib/crimenet/rbac.ts`) enforce the same matrix:

| Role | Nav sections | Case level (own station) | Register case | Evidence / runs / face decisions | Audit trail |
|---|---|---|---|---|---|
| ADMIN | all 13 | ADMIN (any station) | yes, any station | yes | global |
| SUPERVISOR | all 13 | ADMIN | own station only | yes | own station |
| INSPECTOR | 12 (no Security & Audit) | WRITE | no | yes | 403 |
| AUDIT_LOGGER | Command Center + Security & Audit | READ | no | no | own station |

Mechanics: role ladder `INSPECTOR < SUPERVISOR < ADMIN`; `AUDIT_LOGGER` sits
outside the ladder and matches only routes that name it. Per-case level
(`READ < WRITE < ADMIN`) = station baseline + creator grant + explicit
`CaseAccess` rows (`POST /api/cases/{id}/access`). The UI's one lookup is
`GET /api/auth/effective-level[?caseId=…]`, with a client-side fallback that
fails closed. Cross-station requests are `NONE` until granted.

## Development

```bash
# frontend (run from frontend and backend/)
pnpm install
pnpm typecheck        # tsc --noEmit (gates)
pnpm test             # Vitest + Testing Library (jsdom)
pnpm build            # vite build

# backend (run from CriminalNetwork/system/)
python -m pytest tests/ -q
```

Testing note: the spec's Cypress end-to-end suite is covered by **Vitest +
@testing-library/react** (jsdom) — same user-visible assertions, no browser
binary, wired into `pnpm test`. Role/mocking harness lives in
`src/test/` (`identity.ts` mints signed tokens, `api-mock.ts` answers `/api/*`
with the RBAC rules above).
