/**
 * CrimeNet — centralized domain types.
 *
 * Every screen in the app reads from these types. `services.ts` is the only
 * module that turns them into HTTP responses, so changing where the data comes
 * from means changing that one file.
 */

export type RiskLevel = "critical" | "high" | "medium" | "low";

export type CaseStatus =
  | "open"
  | "active"
  | "under_review"
  | "charge_sheet"
  | "closed";

export type CasePriority = "p1" | "p2" | "p3" | "p4";

export type EntityKind =
  | "person"
  | "phone"
  | "account"
  | "vehicle"
  | "organization"
  | "location"
  | "amount"
  | "date"
  | "event"
  | "device";

export type Role = "INSPECTOR" | "SUPERVISOR" | "ADMIN" | "AUDIT_LOGGER";

/**
 * Who is signed in. Issued by `POST /api/session`; the signed token itself is
 * kept out of this object and stored separately so it is never rendered.
 */
export interface GraphStatistics {
  totalNodes?: number;
  totalEdges?: number;
  nodeTypeCounts?: Record<string, number>;
  edgeTypeCounts?: Record<string, number>;
  relationshipTypeCounts?: Record<string, number>;
  avgDegree?: number;
  maxDegree?: number;
  connectedComponents?: number;
  density?: number;
  multiplexityTies?: number;
}

export interface CentralityRow {
  nodeId: string;
  name?: string;
  nodeType?: string;
  degree?: number;
  degreeCentrality?: number;
  betweenness?: number;
  closeness?: number;
  eigenvector?: number;
  pageRank?: number;
}

export interface CommunityRow {
  communityId?: string;
  nodeIds?: string[];
  size?: number;
  dominantNodeType?: string;
  density?: number;
  internalEdgeCount?: number;
  modularityContribution?: number;
}

export interface ComponentRow {
  componentId?: number;
  size?: number;
  edgeCount?: number;
  density?: number;
  nodeTypes?: Record<string, number>;
  avgConfidence?: number;
  pathLength?: number;
  keyEntities?: string[];
  hasPerson?: boolean;
  hasFinancial?: boolean;
  hasCommunication?: boolean;
  hasTemporalData?: boolean;
  hasSpatialData?: boolean;
  isCandidateForInvestigation?: boolean;
}

export interface MultiHopPath {
  sourceId?: string;
  targetId?: string;
  path?: string[];
  hops?: number;
  relationshipTypes?: string[];
  pathConfidence?: number;
  epistemicStatus?: string;
}

export interface ZoneScore {
  hexId?: string;
  latitude?: number;
  longitude?: number;
  locationNames?: string[];
  evidenceCount?: number;
  suspectCount?: number;
  riskScore?: number;
  riskBand?: string;
}

export interface AnalyticsData {
  runId?: string;
  statistics?: GraphStatistics;
  centrality: CentralityRow[];
  communities: CommunityRow[];
  components: ComponentRow[];
  multiHopPaths: MultiHopPath[];
  zones: ZoneScore[];
  summary?: Record<string, unknown>;
}

export interface SessionIdentity {
  userId: string;
  displayName: string;
  role: Role;
  jurisdictionId: string;
  provider: string;
}

export type Language = "en" | "hi";

export interface CaseRecord {
  id: string;
  firNumber: string;
  title: string;
  summary: string;
  status: CaseStatus;
  /** Absent — the pipeline does not assign a priority. */
  priority?: CasePriority;
  risk: RiskLevel;
  /** Absent when the case has no jurisdiction in the registry. */
  district?: string;
  station?: string;
  /** Absent — the pipeline does not classify a crime category. */
  category?: string;
  openedAt: string;
  updatedAt: string;
  leadOfficer: string;
  leadOfficerId: string;
  entityIds: string[];
  evidenceCount: number;
  linkedCaseIds: string[];
  progress: number;
}

export interface EntityRecord {
  id: string;
  kind: EntityKind;
  name: string;
  alias: string[];
  risk: RiskLevel;
  /** Absent — resolved entities carry no district attribute. */
  district?: string;
  summary: string;
  identifiers: EntityIdentifier[];
  linkedCaseIds: string[];
  linkedEntityIds: string[];
  firstSeen: string;
  lastSeen: string;
  tags: string[];
  attributes: Record<string, string>;
}

export interface EntityIdentifier {
  label: string;
  value: string;
  kind: EntityKind;
}

export interface NetworkNode {
  id: string;
  label: string;
  kind: EntityKind;
  risk: RiskLevel;
  x: number;
  y: number;
  radius: number;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  weight: number;
  risk: RiskLevel;
}

export interface NetworkGraph {
  caseId: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface CdrRecord {
  id: string;
  caller: string;
  callerName: string;
  callee: string;
  calleeName: string;
  startedAt: string;
  durationSec: number;
  /** Absent for the few rows where no tower resolved. */
  cellTower?: string;
  /** Absent — CDR rows carry no district. */
  district?: string;
  type: "voice" | "sms" | "data";
  flagged: boolean;
}

export interface CdrTimelineEntry {
  id: string;
  time: string;
  label: string;
  detail: string;
  risk: RiskLevel;
}

export interface CdrSummary {
  totalCalls: number;
  uniqueNumbers: number;
  commonNumbers: number;
  anomalies: number;
  flaggedCalls: number;
  nightCalls: number;
  topContacts: { number: string; name: string; count: number }[];
  hourly: { hour: string; count: number }[];
  timeline: CdrTimelineEntry[];
}

export interface MoneyTransaction {
  id: string;
  fromAccount: string;
  fromName: string;
  toAccount: string;
  toName: string;
  amount: number;
  currency: string;
  /** Absent — the bank rows carry no channel column. */
  channel?: "upi" | "neft" | "imps" | "atm" | "crypto" | "cash";
  occurredAt: string;
  flagged: boolean;
  risk: RiskLevel;
  note?: string;
}

export interface MoneyFlowStage {
  id: string;
  label: string;
  kind: "victim" | "upi" | "shell" | "wallet" | "cluster" | "coordinator";
  risk: RiskLevel;
  amount: number;
  timestamp: string;
  transactionId: string;
  linkedEntity: string;
  indicators: string[];
}

export interface MoneyFlow {
  caseId: string;
  totalVolume: number;
  flaggedVolume: number;
  tracedLabel: string;
  stages: MoneyFlowStage[];
  accounts: {
    id: string;
    name: string;
    /** Absent — no bank column in the source rows. */
    bank?: string;
    risk: RiskLevel;
  }[];
  transactions: MoneyTransaction[];
  byChannel: { channel: string; amount: number }[];
}

export interface MapMarker {
  id: string;
  label: string;
  kind: EntityKind | "incident" | "tower";
  risk: RiskLevel;
  x: number;
  y: number;
  /** Absent — only spatial_infos rows with city precision carry one. */
  district?: string;
  detail: string;
  /** Zone markers only — the pipeline's own H3 risk band/score. */
  riskBand?: string;
  riskScore?: number;
  evidenceCount?: number;
  latitude?: number;
  longitude?: number;
  precision?: string;
}

export interface MapLink {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface MapData {
  markers: MapMarker[];
  links: MapLink[];
}

export interface FaceRecord {
  id: string;
  subject: string;
  entityId: string;
  confidence: number;
  camera: string;
  capturedAt: string;
  district?: string;
  risk: RiskLevel;
  matchStatus: "confirmed" | "probable" | "unverified";
  notes?: string;
}

export interface EvidenceRecord {
  id: string;
  /** Absent — the integrity ledger is per-run, not per-case. */
  caseId?: string;
  label: string;
  kind: "document" | "image" | "audio" | "video" | "device" | "forensic";
  collectedAt: string;
  collectedBy?: string;
  storageRef: string;
  /** sha256 of the file as ingested, prefixed `sha256:`. */
  hash?: string;
  integrity: "verified" | "pending" | "tampered";
  sizeLabel?: string;
}

export interface CustodyEvent {
  id: string;
  evidenceId: string;
  action: "collected" | "transferred" | "analyzed" | "returned" | "sealed";
  actor: string;
  at: string;
  location?: string;
  note?: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  /** Absent — the pipeline's audit log records no acting user. */
  role?: Role;
  action: string;
  target: string;
  at: string;
  /** Absent — no source address is recorded against a stage transition. */
  ip?: string;
  /** Absent — the audit log is not hash-chained. */
  hash?: string;
  prevHash?: string;
  severity: RiskLevel;
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: "case" | "cdr" | "money" | "evidence" | "network" | "face";
  risk: RiskLevel;
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: RiskLevel | "info";
  series: number[];
}

export interface DashboardWidget {
  id: string;
  title: string;
  kind: "metric" | "chart" | "list" | "map";
  description: string;
}

export interface DashboardData {
  metrics: DashboardMetric[];
  widgets: DashboardWidget[];
  riskBreakdown: { label: string; value: number; tone: RiskLevel }[];
  caseTrend: { label: string; value: number }[];
  districtLoad: { label: string; value: number }[];
  recentActivity: TimelineEvent[];
  alerts: {
    id: string;
    title: string;
    detail: string;
    risk: RiskLevel;
    at: string;
  }[];
}

export interface AiMessage {
  id: string;
  author: "analyst" | "ai";
  text: string;
  at: string;
  citations?: string[];
  confidence?: number;
}

export interface AiInsight {
  id: string;
  title: string;
  detail: string;
  confidence: number;
  risk: RiskLevel;
  citations: string[];
}

export interface SearchResultGroup {
  kind: EntityKind | "case";
  label: string;
  items: SearchResultItem[];
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  risk: RiskLevel;
  route: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  at: string;
  risk: RiskLevel;
  read: boolean;
}

export interface IntelligenceFeedEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  severity: RiskLevel;
  route: string;
  actionLabel: string;
}
