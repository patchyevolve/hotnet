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
  matchStatus: "confirmed" | "probable" | "unverified" | "rejected";
  /** Subject name of the counterpart face in the identity match, if any. */
  matchedWith?: string;
  /** Source files the match drew evidence from. */
  matchedFrom?: string[];
  /** Raw ArcFace cosine similarity (0-1) behind this record. */
  similarity?: number;
  /** Investigator who confirmed/rejected this match. */
  decidedBy?: string;
  decidedAt?: string;
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

// =============================================================================
// Graph Visualization — rich types for the criminal network analysis view
// =============================================================================

/** Enriched node used by the graph visualization layer. Extends NetworkNode
 *  with analytics data merged from /api/analytics and /api/entities. */
export interface GraphNode {
  // --- identity ---
  id: string;
  label: string;
  kind: EntityKind;
  risk: RiskLevel;
  /** Pre-computed canvas position, 0-100 range, from the backend layout. */
  x: number;
  y: number;
  /** Degree-proportional radius from the API (2.5–9.5). Used as size seed. */
  radius: number;

  // --- centrality metrics (from /api/analytics centrality[]) ---
  degree?: number;
  degreeCentrality?: number;
  betweenness?: number;
  closeness?: number;
  eigenvector?: number;
  pageRank?: number;

  // --- community assignment (from /api/analytics communities[]) ---
  communityId?: string;

  // --- entity metadata (from /api/entities) ---
  alias?: string[];
  summary?: string;
  firstSeen?: string;
  lastSeen?: string;
  linkedCaseIds?: string[];
  linkedEntityIds?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
  identifiers?: EntityIdentifier[];
  evidenceCount?: number;

  // --- computed on the client ---
  /** Normalized 0-1 score used for visual sizing under the current metric. */
  sizeScore?: number;
  /** Whether this node was flagged as suspicious (adversarial edge involved). */
  suspicious?: boolean;
}

/** Relationship type vocabulary — the values the backend writes in edge labels.
 *  The label arrives title-cased ("Called"); we compare lowercase. */
export type RelationshipType =
  | "calls"
  | "called"
  | "communicates_with"
  | "messages"
  | "messages_with"
  | "transfers_money_to"
  | "transferred_to"
  | "transfer"
  | "knows"
  | "owns"
  | "owned_by"
  | "works_for"
  | "employed_by"
  | "member_of"
  | "associated_with"
  | "associated"
  | "located_at"
  | "location"
  | "traveled_to"
  | "visited"
  | "uses"
  | "used_by"
  | "connected_to"
  | "linked_to"
  | "mentioned_in"
  | "appears_in"
  | "participated_in"
  | "shared_phone"
  | "shared_account"
  | string; // open for unknown types from the backend

/** Enriched edge used by the graph visualization layer. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Title-cased label from the backend, e.g. "Called", "Shared Phone". */
  label: string;
  /** Normalised lowercase key for style lookup. */
  relationshipType: RelationshipType;
  /** Confidence / strength score 0-1 from the API weight field. */
  weight: number;
  risk: RiskLevel;
  /** Whether the edge carries a direction arrow. */
  directed: boolean;
  /** Visual line style category, resolved from relationshipType. */
  lineStyle: "solid" | "dashed" | "dotted" | "thick-solid";
  /** Relative line weight multiplier 1-3. */
  thickness: number;
  // optional metadata when the backend provides it
  timestamp?: string;
  evidenceCount?: number;
  confidence?: number;
}

/** Graph visualization modes — change the visual encoding, not the data. */
export type GraphMode =
  | "network" // default relationship view
  | "risk" // emphasize risk
  | "community" // emphasize clusters
  | "evidence" // emphasize evidence-backed edges
  | "temporal" // emphasize time-stamped activity
  | "centrality"; // emphasize important nodes

/** Dimension used to color nodes. */
export type ColorMode =
  | "entityType"
  | "riskLevel"
  | "community"
  | "evidenceStrength"
  | "caseAssociation"
  | "confidence"
  | "activity";

/** Metric used to size nodes. */
export type SizeMetric =
  | "degree"
  | "betweenness"
  | "pageRank"
  | "riskScore"
  | "evidenceCount"
  | "radius"; // default — the API's degree weight

/** Active filter state for the graph. */
export interface GraphFilterState {
  entityTypes: Set<EntityKind>;
  relationshipTypes: Set<string>;
  riskLevels: Set<RiskLevel>;
  minConfidence: number; // 0-1
  minDegree: number;
  communityIds: Set<string>;
  caseId: string; // "all" or a specific caseId
  dateFrom: string; // ISO or ""
  dateTo: string; // ISO or ""
  searchQuery: string;
}

/** Complete selection state for the graph. */
export interface GraphSelectionState {
  /** Primary selected node id. */
  selectedNodeId: string | null;
  /** Multiple selected node ids (shift-click). */
  selectedNodeIds: Set<string>;
  /** Selected edge id. */
  selectedEdgeId: string | null;
  /** Hover target. */
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  /** Highlight scope — nodes in the neighbourhood of the selected node. */
  highlightedNodeIds: Set<string>;
  /** Highlight scope — edges incident on the selected node. */
  highlightedEdgeIds: Set<string>;
  /** Path analysis: source and target node ids. */
  pathSource: string | null;
  pathTarget: string | null;
  /** Node ids on the found shortest path (empty if no path). */
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
}

/** Enriched graph — the fully-resolved graph passed to the Canvas renderer. */
export interface EnrichedGraph {
  caseId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Community palette: communityId → hex color. */
  communityColors: Record<string, string>;
  /** Stats derived from the analytics endpoint. */
  statistics?: GraphStatistics;
}

/** Viewport transform used by the Canvas renderer. */
export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}
