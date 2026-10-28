import { decodeToken } from "@/lib/crimenet/identity";
import {
  AUDIT_ROLES,
  CASE_AUTHOR_ROLES,
  FACE_DECISION_ROLES,
  STATION_BASELINE,
} from "@/lib/crimenet/rbac";
import type { AccessLevel, FirView, StoredFile } from "@/lib/crimenet/services";
import type { CaseRecord, SessionIdentity } from "@/lib/crimenet/types";
import rawFixtures from "./fixtures/api-fixtures.json?raw";
import {
  ADMIN_DELHI,
  AUDIT_LOGGER_DELHI,
  INSPECTOR_DELHI,
  SUPERVISOR_DELHI,
  SUPERVISOR_MUMBAI,
  makeToken,
} from "./identity";

/**
 * Fetch-level stand-in for the FastAPI server.
 *
 * Read endpoints answer from `fixtures/api-fixtures.json`, which is dumped from
 * a real pipeline run — no value in this file (or in any test) is hand-written
 * mock data. Write endpoints keep their own state so the upload → run → poll
 * flow can be exercised end to end.
 *
 * The auth endpoints behave like `api/app.py`: credentials are checked, the
 * issued token is the real signed shape, and every role-gated route re-checks
 * the bearer's claims so a 403 can be asserted from the UI.
 */

/** Shared demo credential — documented in README/SETUP and seeded by the
 *  backend when `CRIMENET_SEED_DEMO_USERS=1`. */
export const DEMO_PASSWORD = "Cr1menet!Demo";

interface DemoAccount {
  password: string;
  claims: {
    userId: string;
    displayName: string;
    role: SessionIdentity["role"];
    jurisdictionId: string;
  };
}

const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  "admin@crimenet.local": { password: DEMO_PASSWORD, claims: ADMIN_DELHI },
  "supervisor@crimenet.local": {
    password: DEMO_PASSWORD,
    claims: SUPERVISOR_DELHI,
  },
  "supervisor.mumbai@crimenet.local": {
    password: DEMO_PASSWORD,
    claims: SUPERVISOR_MUMBAI,
  },
  "inspector@crimenet.local": {
    password: DEMO_PASSWORD,
    claims: INSPECTOR_DELHI,
  },
  "auditor@crimenet.local": {
    password: DEMO_PASSWORD,
    claims: AUDIT_LOGGER_DELHI,
  },
};

export interface JobView {
  jobId: string;
  caseId: string;
  kind: "full" | "incremental";
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage: number;
  totalStages: number;
  detail: string;
  stagesDone: string[];
  fileCount: number;
  requestedBy: string;
  jurisdictionId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  returncode: number | null;
  runId: string | null;
}

const fixtures = JSON.parse(rawFixtures) as Record<string, unknown>;
const fixtureCaseId = String(fixtures._caseId ?? "CASE_000001");
const fixtureFirId = String(fixtures._firId ?? "FIR_000001");

/** Deterministic stand-in for a content hash (jsdom has no SubtleCrypto). */
function fakeHash(name: string, size: number): string {
  let value = 0x811c9dc5;
  const seed = `${name}:${size}`;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return `sha256:${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(path: string): Response {
  return json({ detail: `No fixture for ${path}` }, 404);
}

/** Decode the bearer a request carries, exactly as the server's guards do. */
function identityFromHeaders(headers?: HeadersInit): SessionIdentity | null {
  if (!headers) return null;
  const auth = new Headers(headers).get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return decodeToken(auth.slice("Bearer ".length));
}

/** Filter params that cannot change the answer for a one-case state: the
 *  fixtures were dumped unscoped, so `?caseId=` / `?role=` fall back to the
 *  base endpoint. Query params that *are* the request (e.g. `q`) are kept. */
function withoutScope(path: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("caseId") && !params.has("role")) return path;
  params.delete("caseId");
  params.delete("role");
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

interface RuntimeState {
  cases: Map<string, CaseRecord>;
  firs: Map<string, FirView[]>;
  evidence: Map<string, StoredFile[]>;
  jobs: Map<string, { view: JobView; polls: number }>;
  uploads: StoredFile[];
}

function freshState(): RuntimeState {
  return {
    cases: new Map(),
    firs: new Map(),
    evidence: new Map(),
    jobs: new Map(),
    uploads: [],
  };
}

export const apiMock = {
  /** Read paths the fixtures did not cover — tests should assert this is empty. */
  missing: [] as string[],
  state: freshState(),
  reset() {
    this.missing = [];
    this.state = freshState();
  },
  /** Everything uploaded through the mock, in order. */
  get uploads(): StoredFile[] {
    return this.state.uploads;
  },
};

const JOB_STEPS: Array<Partial<JobView>> = [
  {
    status: "running",
    progress: 0.1,
    stage: 1,
    detail: "Running Stage 1",
    stagesDone: ["Stage 1"],
  },
  {
    status: "running",
    progress: 0.4,
    stage: 5,
    detail: "Running Stage 5",
    stagesDone: ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"],
  },
  {
    status: "running",
    progress: 0.7,
    stage: 9,
    detail: "Running Stage 9",
    stagesDone: [
      "Stage 1",
      "Stage 2",
      "Stage 3",
      "Stage 4",
      "Stage 5",
      "Stage 6",
      "Stage 7",
      "Stage 8",
      "Stage 9",
    ],
  },
  {
    status: "completed",
    progress: 1,
    stage: 12,
    detail: "Completed",
    returncode: 0,
    runId: "run_test_0001",
  },
];

function readFixture(path: string): Response {
  if (path in fixtures) return json(fixtures[path]);
  const scoped = withoutScope(path);
  if (scoped !== path && scoped in fixtures) return json(fixtures[scoped]);
  apiMock.missing.push(path);
  return notFound(path);
}

async function handleWrite(path: string, init: RequestInit): Promise<Response> {
  const state = apiMock.state;
  const method = (init.method ?? "GET").toUpperCase();

  if (method === "POST" && path === "/api/auth/login") {
    const body = JSON.parse(String(init.body ?? "{}")) as {
      emailOrBadge?: string;
      password?: string;
    };
    const key = (body.emailOrBadge ?? "").trim().toLowerCase();
    const account = DEMO_ACCOUNTS[key];
    if (!account || account.password !== body.password) {
      return json({ detail: "Invalid badge/email or password." }, 401);
    }
    const { claims } = account;
    return json({
      token: makeToken(claims),
      user: {
        id: claims.userId,
        email: key,
        name: claims.displayName,
        role: claims.role,
        status: "ACTIVE",
        jurisdictionNodeId: claims.jurisdictionId,
      },
    });
  }

  if (method === "POST" && path === "/api/session") {
    const body = JSON.parse(
      String(init.body ?? "{}"),
    ) as Partial<SessionIdentity>;
    const base = (fixtures._session ?? {}) as SessionIdentity;
    const identity = { ...base, ...body } satisfies SessionIdentity;
    return json({
      identity,
      token: makeToken({
        userId: identity.userId,
        displayName: identity.displayName,
        role: identity.role,
        jurisdictionId: identity.jurisdictionId,
      }),
    });
  }

  if (method === "POST" && path === "/api/cases") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    if (!CASE_AUTHOR_ROLES.includes(identity.role)) {
      // `POST /api/cases` is limited to supervisors and administrators.
      return json(
        { detail: "Case registration requires SUPERVISOR or ADMIN." },
        403,
      );
    }
    const body = JSON.parse(String(init.body)) as {
      firNumber: string;
      title: string;
      description?: string;
      jurisdictionId?: string;
    };
    const base = (fixtures[`/api/cases/${fixtureCaseId}`] ?? {}) as CaseRecord;
    const id = `CASE_${String(state.cases.size + 2).padStart(6, "0")}`;
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const record: CaseRecord = {
      ...base,
      id,
      firNumber: body.firNumber,
      title: body.title,
      summary: body.description ?? "",
      station: body.jurisdictionId ?? identity.jurisdictionId,
      leadOfficerId: identity.userId,
      openedAt: now,
      updatedAt: now,
      entityIds: [],
      evidenceCount: 0,
      progress: 0,
    };
    const fir: FirView = {
      firId: `FIR_${String(state.firs.size + 2).padStart(6, "0")}`,
      firNumber: body.firNumber,
      caseId: id,
      description: body.description ?? "",
      status: "UNDER_INVESTIGATION",
      createdAt: now,
      fileCount: 0,
    };
    state.cases.set(id, record);
    state.firs.set(id, [fir]);
    state.evidence.set(id, []);
    return json(record, 201);
  }

  if (method === "POST" && path === "/api/faces/decision") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    if (!FACE_DECISION_ROLES.includes(identity.role)) {
      return json(
        { detail: "Face decisions require ADMIN, SUPERVISOR or INSPECTOR." },
        403,
      );
    }
    const body = JSON.parse(String(init.body)) as {
      faceId: string;
      decision: "confirm" | "reject";
      reviewer: string;
      note?: string;
    };
    const rows = (fixtures["/api/faces"] as Array<Record<string, unknown>>).map(
      (row) =>
        row.id === body.faceId
          ? {
              ...row,
              matchStatus:
                body.decision === "confirm" ? "confirmed" : "rejected",
              decidedBy: body.reviewer,
              decidedAt: new Date().toISOString(),
              ...(body.note ? { notes: body.note } : {}),
            }
          : row,
    );
    const updated = rows.find((row) => row.id === body.faceId);
    if (!updated) return json({ detail: `No face ${body.faceId}` }, 404);
    fixtures["/api/faces"] = rows;
    return json(updated);
  }

  const firNumberCase = path.match(/^\/api\/cases\/([^/]+)\/firs$/);
  if (method === "POST" && firNumberCase) {
    const caseId = firNumberCase[1];
    const body = JSON.parse(String(init.body)) as { firNumber: string };
    const existing = state.firs.get(caseId) ?? [];
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const fir: FirView = {
      firId: `FIR_${String(existing.length + 10).padStart(6, "0")}`,
      firNumber: body.firNumber,
      caseId,
      description: "",
      status: "UNDER_INVESTIGATION",
      createdAt: now,
      fileCount: 0,
    };
    state.firs.set(caseId, [...existing, fir]);
    return json(fir, 201);
  }

  const uploadMatch = path.match(
    /^\/api\/cases\/([^/]+)\/firs\/([^/]+)\/evidence$/,
  );
  if (method === "POST" && uploadMatch) {
    const [, caseId, firId] = uploadMatch;
    const form = init.body as FormData;
    const files = (form.getAll("files") as File[]).filter(
      // Mirrors the server's rule: narrative/pipeline files are not evidence.
      (file) => file.name !== "00_CRIME_STORY.md" && !file.name.startsWith("."),
    );
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const rows: StoredFile[] = files.map((file) => ({
      storedName: file.name,
      originalName: file.name,
      sizeBytes: file.size,
      contentType: file.type || "application/octet-stream",
      sha256: fakeHash(file.name, file.size),
      firId,
      uploadedAt: now,
    }));
    const prior = state.evidence.get(caseId) ?? [];
    state.evidence.set(caseId, [...prior, ...rows]);
    state.uploads.push(...rows);
    return json({ files: rows }, 201);
  }

  const runMatch = path.match(/^\/api\/cases\/([^/]+)\/run$/);
  if (method === "POST" && runMatch) {
    const caseId = runMatch[1];
    const body = JSON.parse(String(init.body ?? "{}")) as { append?: boolean };
    const fileId = `${state.jobs.size + 1}${state.jobs.size}${state.jobs.size + 7}`;
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const view: JobView = {
      jobId: `job_${fileId}`,
      caseId,
      kind: body.append ? "incremental" : "full",
      status: "queued",
      progress: 0,
      stage: 0,
      totalStages: 12,
      detail: "Starting pipeline",
      stagesDone: [],
      fileCount: (state.evidence.get(caseId) ?? []).length,
      requestedBy: "USER_TEST",
      jurisdictionId: "JURISDICTION_DELHI_CYBERCRIME",
      createdAt: now,
      startedAt: now,
      finishedAt: null,
      error: null,
      returncode: null,
      runId: null,
    };
    state.jobs.set(view.jobId, { view, polls: 0 });
    return json(view, 200);
  }

  return notFound(path);
}

function handleRead(path: string, init: RequestInit = {}): Response {
  const state = apiMock.state;
  const [methodless, query = ""] = path.split("?");

  if (methodless === "/api/auth/effective-level") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    const caseId = new URLSearchParams(query).get("caseId");
    if (!caseId) {
      // No case in scope: the role's station baseline (ADMIN is global).
      const level: AccessLevel =
        identity.role === "ADMIN" ? "ADMIN" : STATION_BASELINE[identity.role];
      return json({ level });
    }
    const record =
      state.cases.get(caseId) ??
      (fixtures[`/api/cases/${caseId}`] as CaseRecord | undefined);
    if (!record) return json({ detail: `Unknown case ${caseId}` }, 404);
    if (identity.role === "ADMIN") return json({ level: "ADMIN" });
    // The creator of a case may always work on it.
    if (record.leadOfficerId && record.leadOfficerId === identity.userId) {
      return json({ level: "ADMIN" });
    }
    const level: AccessLevel =
      record.station && record.station === identity.jurisdictionId
        ? STATION_BASELINE[identity.role]
        : "NONE";
    return json({ level });
  }

  if (methodless === "/api/audit") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    if (!AUDIT_ROLES.includes(identity.role)) {
      return json(
        { detail: "Audit access requires ADMIN, SUPERVISOR or AUDIT_LOGGER." },
        403,
      );
    }
  }

  if (methodless === "/api/me") return json(fixtures._session);
  if (methodless === "/api/cases") {
    return json([
      ...(fixtures["/api/cases"] as CaseRecord[]),
      ...state.cases.values(),
    ]);
  }

  const caseMatch = methodless.match(/^\/api\/cases\/([^/]+)$/);
  if (caseMatch) {
    const runtime = state.cases.get(caseMatch[1]);
    if (runtime) return json(runtime);
  }
  const firsMatch = methodless.match(/^\/api\/cases\/([^/]+)\/firs$/);
  if (firsMatch) {
    const runtime = state.firs.get(firsMatch[1]);
    if (runtime) return json(runtime);
  }
  const evidenceMatch = methodless.match(/^\/api\/cases\/([^/]+)\/evidence$/);
  if (evidenceMatch) {
    const runtime = state.evidence.get(evidenceMatch[1]);
    if (runtime) return json(runtime);
  }
  const caseJobsMatch = methodless.match(/^\/api\/cases\/([^/]+)\/jobs$/);
  if (caseJobsMatch) {
    return json(
      [...state.jobs.values()]
        .filter((entry) => entry.view.caseId === caseJobsMatch[1])
        .map((entry) => entry.view),
    );
  }

  const jobMatch = methodless.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const entry = state.jobs.get(jobMatch[1]);
    if (!entry) {
      apiMock.missing.push(path);
      return notFound(path);
    }
    // Each poll advances the job one stage so the UI reaches a terminal state.
    entry.polls += 1;
    const step = JOB_STEPS[Math.min(entry.polls - 1, JOB_STEPS.length - 1)];
    entry.view = {
      ...entry.view,
      ...step,
      finishedAt:
        step.status === "completed"
          ? new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
          : null,
    };
    return json(entry.view);
  }

  if (methodless === "/api/health") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    const caseRows = (fixtures["/api/cases"] as CaseRecord[] | undefined) ?? [];
    const evidenceRows = (fixtures["/api/evidence"] as unknown[]) ?? [];
    const faceRows = (fixtures["/api/faces"] as unknown[]) ?? [];
    const auditRows = (fixtures["/api/audit"] as unknown[]) ?? [];
    const network = fixtures["/api/network"] as
      | { nodes?: unknown[] }
      | undefined;
    return json({
      status: "ok",
      services: [
        {
          id: "api",
          label: "API Service",
          status: "operational",
          detail: "fixture server responding · test scope",
        },
        {
          id: "registry",
          label: "Case Registry",
          status: "operational",
          detail: `${caseRows.length} case(s) registered · active ${fixtureCaseId}`,
        },
        {
          id: "pipeline",
          label: "Pipeline Output",
          status: "operational",
          detail: `run output present · ${network?.nodes?.length ?? 0} graph nodes · ${fixtureCaseId}`,
        },
        {
          id: "chain",
          label: "Activity Chain",
          status: "operational",
          detail: `0 chained user entries verified · ${auditRows.length} pipeline events append-only`,
        },
        {
          id: "vault",
          label: "Evidence Vault",
          status: "operational",
          detail: `${evidenceRows.length} evidence files registered`,
        },
        {
          id: "faces",
          label: "Face Engine",
          status: "operational",
          detail: `${faceRows.length} face records indexed`,
        },
      ],
      checkedAt: new Date().toISOString(),
    });
  }

  if (methodless === "/api/activity") {
    const identity = identityFromHeaders(init.headers);
    if (!identity) return json({ detail: "Not authenticated" }, 401);
    const caseId = new URLSearchParams(query).get("caseId") ?? "";
    const auditRows =
      (fixtures["/api/audit"] as Record<string, string>[]) ?? [];
    const entries = auditRows
      .slice()
      .reverse()
      .map((row) => ({
        source: "pipeline",
        caseId: fixtureCaseId,
        hash: "",
        prevHash: "",
        actorId: "",
        actorName: "",
        actorRole: "",
        ...row,
      }));
    return json({
      caseId,
      entries,
      chainValid: true,
      chainLength: 0,
      pipelineEvents: entries.length,
      caseIds: [fixtureCaseId],
      checkedAt: new Date().toISOString(),
    });
  }

  return readFixture(path);
}

let installed = false;

/** Swap `globalThis.fetch` for the fixture-backed server. Idempotent. */
export function installApiMock(): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = raw.startsWith("http")
      ? new URL(raw).pathname + new URL(raw).search
      : raw;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return handleWrite(path, init ?? {});
    return handleRead(path, init ?? {});
  }) as typeof fetch;
  // Kept so a test can restore the environment if it needs a real rejection.
  (globalThis.fetch as unknown as { __restore?: () => void }).__restore =
    () => {
      globalThis.fetch = original;
    };
}

export const fixtureCase = fixtureCaseId;
export const fixtureFir = fixtureFirId;
