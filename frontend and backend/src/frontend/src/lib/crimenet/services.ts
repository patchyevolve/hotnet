/**
 * CrimeNet — service abstraction layer.
 *
 * Every screen reads data through these async functions, and they all hit the
 * FastAPI service in `CriminalNetwork/system/api/app.py`.
 *
 * Two deliberate rules:
 *
 * 1. **Reads never reject.** Pages call these inside `useEffect().then()` with
 *    no catch, so a rejected promise would strand them on a loading skeleton
 *    forever. A read that fails returns an empty collection and logs — which is
 *    also the honest empty state before the first run.
 * 2. **Writes do reject.** Creating a case, uploading evidence or triggering a
 *    run must surface the server's reason to the investigator, so those throw.
 */

import type {
  AiInsight,
  AiMessage,
  AnalyticsData,
  AuditEvent,
  CaseRecord,
  CdrRecord,
  CdrSummary,
  CustodyEvent,
  DashboardData,
  DashboardMetric,
  EntityRecord,
  EvidenceRecord,
  FaceRecord,
  IntelligenceFeedEvent,
  MapData,
  MoneyFlow,
  NetworkGraph,
  NotificationItem,
  Role,
  SearchResultGroup,
  SessionIdentity,
  TimelineEvent,
} from "./types";

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

export interface FirView {
  firId: string;
  firNumber: string;
  caseId: string;
  description: string;
  filedById?: string;
  status?: string;
  createdAt: string;
  fileCount: number;
}

export interface StoredFile {
  storedName: string;
  originalName: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  firId: string;
  uploadedAt: string;
}

export interface SessionStart {
  displayName: string;
  role: Role;
  jurisdictionId: string;
}

const TOKEN_KEY = "crimenet.token";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply will not persist */
  }
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registered once by the app shell. Called when the stored token no longer
 * verifies (the signing secret rotated, or the token expired) so the shell can
 * send the investigator to sign-in instead of leaving them on a page whose
 * writes keep failing.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && token) {
    // A rejected signature means the token this client holds is unusable.
    // Drop it and hand back a message an investigator can act on; the
    // registered handler navigates to sign-in.
    setToken(null);
    unauthorizedHandler?.();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

/** Read helpers swallow failures so pages land on the empty state, not a hang. */
async function read<T>(path: string, fallback: T): Promise<T> {
  try {
    return await request<T>(path);
  } catch (error) {
    console.error(`[crimenet] GET ${path} failed:`, error);
    return fallback;
  }
}

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

const withCase = (caseId?: string) => qs({ caseId });

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export async function getMeta(): Promise<{
  roles: Role[];
  jurisdictions: string[];
}> {
  return read("/api/meta", { roles: [], jurisdictions: [] });
}

export async function startSession(
  input: SessionStart,
): Promise<{ identity: SessionIdentity; token: string }> {
  const result = await request<{ identity: SessionIdentity; token: string }>(
    "/api/session",
    { method: "POST", body: JSON.stringify(input) },
  );
  setToken(result.token);
  return result;
}

export function signOut(): void {
  setToken(null);
}

// ---------------------------------------------------------------------------
// Cases, FIRs, evidence, runs
// ---------------------------------------------------------------------------
export async function getCases(): Promise<CaseRecord[]> {
  return read<CaseRecord[]>("/api/cases", []);
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  const row = await read<CaseRecord | null>(`/api/cases/${id}`, null);
  return row;
}

export async function createCase(input: {
  firNumber: string;
  title: string;
  description?: string;
  jurisdictionId?: string;
}): Promise<CaseRecord> {
  return request<CaseRecord>("/api/cases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listFirs(caseId: string): Promise<FirView[]> {
  return read<FirView[]>(`/api/cases/${caseId}/firs`, []);
}

export async function createFir(
  caseId: string,
  input: {
    firNumber: string;
    description?: string;
    jurisdictionId?: string;
  },
): Promise<FirView> {
  return request<FirView>(`/api/cases/${caseId}/firs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadEvidence(
  caseId: string,
  firId: string,
  files: File[],
): Promise<StoredFile[]> {
  const body = new FormData();
  for (const file of files) body.append("files", file, file.name);
  const result = await request<{ files: StoredFile[] }>(
    `/api/cases/${caseId}/firs/${firId}/evidence`,
    { method: "POST", body },
  );
  return result.files;
}

export async function listCaseEvidence(caseId: string): Promise<StoredFile[]> {
  return read<StoredFile[]>(`/api/cases/${caseId}/evidence`, []);
}

export async function runCase(
  caseId: string,
  input: { append?: boolean } = {},
): Promise<JobView> {
  return request<JobView>(`/api/cases/${caseId}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getJob(jobId: string): Promise<JobView> {
  return request<JobView>(`/api/jobs/${jobId}`);
}

export async function listCaseJobs(caseId: string): Promise<JobView[]> {
  return read<JobView[]>(`/api/cases/${caseId}/jobs`, []);
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
export async function getEntities(): Promise<EntityRecord[]> {
  return read<EntityRecord[]>("/api/entities", []);
}

export async function getEntity(id: string): Promise<EntityRecord | null> {
  return read<EntityRecord | null>(`/api/entities/${id}`, null);
}

export async function getNetworkGraph(caseId?: string): Promise<NetworkGraph> {
  return read<NetworkGraph>(`/api/network${withCase(caseId)}`, {
    caseId: caseId ?? "",
    nodes: [],
    edges: [],
  });
}

export async function getCdrRecords(): Promise<CdrRecord[]> {
  const data = await read<{ records: CdrRecord[] }>("/api/cdr", {
    records: [],
  });
  return data.records;
}

export async function getCdrSummary(caseId?: string): Promise<CdrSummary> {
  const data = await read<{ summary: CdrSummary }>(
    `/api/cdr${withCase(caseId)}`,
    {
      summary: {
        totalCalls: 0,
        uniqueNumbers: 0,
        commonNumbers: 0,
        anomalies: 0,
        flaggedCalls: 0,
        nightCalls: 0,
        topContacts: [],
        hourly: [],
        timeline: [],
      },
    },
  );
  return data.summary;
}

export async function getCaseCdr(caseId: string): Promise<CdrRecord[]> {
  const data = await read<{ records: CdrRecord[] }>(
    `/api/cdr${withCase(caseId)}`,
    { records: [] },
  );
  return data.records;
}

export async function getMoneyFlow(caseId?: string): Promise<MoneyFlow> {
  return read<MoneyFlow>(`/api/money${withCase(caseId)}`, {
    caseId: caseId ?? "",
    totalVolume: 0,
    flaggedVolume: 0,
    tracedLabel: "",
    stages: [],
    accounts: [],
    transactions: [],
    byChannel: [],
  });
}

export async function getMapData(): Promise<MapData> {
  return read<MapData>("/api/map", { markers: [], links: [] });
}

export async function getFaceRecords(): Promise<FaceRecord[]> {
  return read<FaceRecord[]>("/api/faces", []);
}

/**
 * Record an investigator's confirm/reject decision on a face match.
 * Returns the updated projection record (persisted server-side).
 */
export async function postFaceDecision(input: {
  faceId: string;
  decision: "confirm" | "reject";
  reviewer: string;
  note?: string;
}): Promise<FaceRecord> {
  return request<FaceRecord>("/api/faces/decision", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getEvidence(): Promise<EvidenceRecord[]> {
  return read<EvidenceRecord[]>("/api/evidence", []);
}

export async function getCustodyEvents(): Promise<CustodyEvent[]> {
  return read<CustodyEvent[]>("/api/custody", []);
}

export async function getAuditEvents(): Promise<AuditEvent[]> {
  return read<AuditEvent[]>("/api/audit", []);
}

export async function getTimeline(): Promise<TimelineEvent[]> {
  return read<TimelineEvent[]>("/api/timeline", []);
}

export async function getDashboard(role: Role): Promise<DashboardData> {
  return read<DashboardData>(`/api/dashboard${qs({ role })}`, {
    metrics: [],
    widgets: [],
    riskBreakdown: [],
    caseTrend: [],
    districtLoad: [],
    recentActivity: [],
    alerts: [],
  });
}

export async function getCommandCenterMetrics(): Promise<DashboardMetric[]> {
  return read<DashboardMetric[]>("/api/metrics", []);
}

export async function getIntelligenceFeed(): Promise<IntelligenceFeedEvent[]> {
  return read<IntelligenceFeedEvent[]>("/api/feed", []);
}

export async function getAiInsights(): Promise<AiInsight[]> {
  return read<AiInsight[]>("/api/insights", []);
}

export async function getAiMessages(): Promise<AiMessage[]> {
  return read<AiMessage[]>("/api/messages", []);
}

export async function getNotifications(): Promise<NotificationItem[]> {
  return read<NotificationItem[]>("/api/notifications", []);
}

const emptyAnalytics: AnalyticsData = {
  centrality: [],
  communities: [],
  components: [],
  multiHopPaths: [],
  zones: [],
};

export async function getAnalytics(caseId?: string): Promise<AnalyticsData> {
  return read<AnalyticsData>(
    `/api/analytics${withCase(caseId)}`,
    emptyAnalytics,
  );
}

/**
 * Global search across cases and resolved entities.
 * Returns grouped results so the UI can render sectioned dropdowns.
 */
export async function search(query: string): Promise<SearchResultGroup[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  return read<SearchResultGroup[]>(`/api/search${qs({ q: term })}`, []);
}

// ---------------------------------------------------------------------------
// Enriched graph data — merges /api/network + /api/analytics + /api/entities
// ---------------------------------------------------------------------------

export async function getEnrichedGraphData(caseId?: string): Promise<{
  network: NetworkGraph;
  analytics: AnalyticsData;
  entities: EntityRecord[];
}> {
  const [network, analytics, entities] = await Promise.all([
    getNetworkGraph(caseId),
    getAnalytics(caseId),
    getEntities(),
  ]);
  return { network, analytics, entities };
}
