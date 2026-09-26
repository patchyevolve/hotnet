/**
 * CrimeNet — Graph Transform Library
 *
 * Converts raw API responses (NetworkGraph + AnalyticsData + EntityRecord[])
 * into the enriched GraphNode / GraphEdge model the Canvas renderer consumes.
 *
 * Also provides:
 *  - filter application
 *  - node size normalisation for each SizeMetric
 *  - BFS shortest-path for path analysis
 *  - neighbourhood expansion (1/2/3 hop)
 *  - community colour assignment (deterministic, Okabe-Ito safe palette)
 */

import type {
  AnalyticsData,
  ColorMode,
  EnrichedGraph,
  EntityKind,
  EntityRecord,
  GraphEdge,
  GraphFilterState,
  GraphNode,
  GraphSelectionState,
  NetworkGraph,
  RiskLevel,
  SizeMetric,
} from "./types";

// ---------------------------------------------------------------------------
// Colour palette — design-system tokens resolved to hex for Canvas use.
// ---------------------------------------------------------------------------

/** Risk-level hex colours matching the OKLCH tokens in index.css. */
export const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "#d97706", // oklch(0.6 0.181 43)
  high: "#ca8a04", // oklch(0.75 0.163 78)
  medium: "#ca9a04", // oklch(0.9 0.16 100)
  low: "#16a34a", // oklch(0.62 0.13 165)
};

/** Entity-kind hex colours — Okabe-Ito categorical safe palette. */
export const KIND_COLORS: Record<EntityKind, string> = {
  person: "#6b9dea", // accent-blue
  phone: "#4ade80", // teal-green
  account: "#fb923c", // orange
  vehicle: "#a78bfa", // purple
  organization: "#38bdf8", // sky-blue
  location: "#f472b6", // pink
  amount: "#facc15", // yellow
  date: "#94a3b8", // slate
  event: "#f87171", // red
  device: "#67e8f9", // cyan
};

/** Community colour palette — 12 distinct, colorblind-safe hues. */
const COMMUNITY_PALETTE = [
  "#6b9dea",
  "#4ade80",
  "#fb923c",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
  "#facc15",
  "#67e8f9",
  "#86efac",
  "#fca5a5",
  "#c4b5fd",
  "#7dd3fc",
];

/** Neutral canvas colours (hardcoded so Canvas code doesn't touch the DOM). */
export const CANVAS_COLORS = {
  background: "#151a2e",
  card: "#1a2035",
  border: "#2a3050",
  foreground: "#f0f2fa",
  mutedFg: "#8891b0",
  selectedRing: "#6b9dea",
  pathHighlight: "#fbbf24",
  dimOverlay: "rgba(15,18,40,0.55)",
  edgeDefault: "#3a4460",
  edgeActive: "#8891b0",
  gridLine: "rgba(240,242,250,0.03)",
  communityHull: "rgba(107,157,234,0.07)",
  labelBg: "rgba(21,26,46,0.85)",
};

// ---------------------------------------------------------------------------
// Edge style resolution
// ---------------------------------------------------------------------------

type EdgeStyle = {
  lineStyle: "solid" | "dashed" | "dotted" | "thick-solid";
  thickness: number;
  directed: boolean;
};

/** Map a lower-cased relationship label onto a visual style. */
export function resolveEdgeStyle(label: string): EdgeStyle {
  const key = label.toLowerCase().replace(/[\s-]/g, "_");

  if (/^call|^called|^communicates/.test(key))
    return { lineStyle: "solid", thickness: 1.5, directed: true };
  if (/^message|^sms/.test(key))
    return { lineStyle: "dashed", thickness: 1.2, directed: true };
  if (/^transfer|^paid|^sent_money|^transaction/.test(key))
    return { lineStyle: "thick-solid", thickness: 2.5, directed: true };
  if (/^knows|^know/.test(key))
    return { lineStyle: "solid", thickness: 1.0, directed: false };
  if (/^owns|^own|^registered/.test(key))
    return { lineStyle: "solid", thickness: 1.4, directed: true };
  if (/^works_for|^member_of|^employed/.test(key))
    return { lineStyle: "dotted", thickness: 1.2, directed: true };
  if (/^located_at|^location|^visited|^traveled/.test(key))
    return { lineStyle: "dashed", thickness: 0.9, directed: false };
  if (/^associated|^linked|^connected|^shared/.test(key))
    return { lineStyle: "solid", thickness: 1.0, directed: false };
  if (/^participated|^appears_in|^mentioned/.test(key))
    return { lineStyle: "dashed", thickness: 1.0, directed: false };

  return { lineStyle: "solid", thickness: 1.0, directed: false };
}

// ---------------------------------------------------------------------------
// Community colour assignment
// ---------------------------------------------------------------------------

/** Assign deterministic hex colours to community ids. */
export function buildCommunityColors(
  communityIds: string[],
): Record<string, string> {
  const unique = [...new Set(communityIds)].sort();
  const result: Record<string, string> = {};
  unique.forEach((id, i) => {
    result[id] = COMMUNITY_PALETTE[i % COMMUNITY_PALETTE.length];
  });
  return result;
}

// ---------------------------------------------------------------------------
// Core enrichment — merges all three API payloads into GraphNode[]
// ---------------------------------------------------------------------------

export function enrichGraph(
  network: NetworkGraph,
  analytics: AnalyticsData,
  entities: EntityRecord[],
): EnrichedGraph {
  // -- Build lookup maps ------------------------------------------------
  const centralityByNodeId = new Map(
    (analytics.centrality ?? []).map((row) => [row.nodeId, row]),
  );

  // community membership: nodeId → communityId
  const communityByNodeId = new Map<string, string>();
  for (const community of analytics.communities ?? []) {
    const cid = community.communityId ?? "";
    if (!cid) continue;
    for (const nodeId of community.nodeIds ?? []) {
      communityByNodeId.set(nodeId, cid);
    }
  }

  const entityByNodeId = new Map(entities.map((e) => [e.id, e]));

  // -- Enrich nodes ------------------------------------------------------
  const nodes: GraphNode[] = network.nodes.map((n) => {
    const centrality = centralityByNodeId.get(n.id);
    const entity = entityByNodeId.get(n.id);
    const communityId = communityByNodeId.get(n.id);

    return {
      id: n.id,
      label: n.label,
      kind: n.kind,
      risk: n.risk,
      x: n.x,
      y: n.y,
      radius: n.radius,

      // centrality
      degree: centrality?.degree,
      degreeCentrality: centrality?.degreeCentrality,
      betweenness: centrality?.betweenness,
      closeness: centrality?.closeness,
      eigenvector: centrality?.eigenvector,
      pageRank: centrality?.pageRank,

      communityId,

      // entity metadata
      alias: entity?.alias,
      summary: entity?.summary,
      firstSeen: entity?.firstSeen,
      lastSeen: entity?.lastSeen,
      linkedCaseIds: entity?.linkedCaseIds,
      linkedEntityIds: entity?.linkedEntityIds,
      tags: entity?.tags,
      attributes: entity?.attributes,
      identifiers: entity?.identifiers,
      evidenceCount: entity?.identifiers?.length,

      sizeScore: 0, // computed below
    };
  });

  // -- Enrich edges -------------------------------------------------------
  const edges: GraphEdge[] = network.edges.map((e) => {
    const style = resolveEdgeStyle(e.label);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      relationshipType: e.label.toLowerCase().replace(/\s+/g, "_"),
      weight: e.weight,
      risk: e.risk,
      directed: style.directed,
      lineStyle: style.lineStyle,
      thickness: style.thickness,
      confidence: e.weight,
    };
  });

  // -- Community colours --------------------------------------------------
  const communityColors = buildCommunityColors([...communityByNodeId.values()]);

  return {
    caseId: network.caseId,
    nodes,
    edges,
    communityColors,
    statistics: analytics.statistics,
  };
}

// ---------------------------------------------------------------------------
// Size normalisation
// ---------------------------------------------------------------------------

/** Compute normalised sizeScore 0-1 for every node under the chosen metric. */
export function applyNodeSizing(
  nodes: GraphNode[],
  metric: SizeMetric,
): GraphNode[] {
  const values = nodes.map((n) => getNodeMetricValue(n, metric));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return nodes.map((n, i) => ({
    ...n,
    sizeScore: span > 0 ? (values[i] - min) / span : 0.5,
  }));
}

function getNodeMetricValue(node: GraphNode, metric: SizeMetric): number {
  switch (metric) {
    case "degree":
      return node.degree ?? node.radius;
    case "betweenness":
      return node.betweenness ?? 0;
    case "pageRank":
      return node.pageRank ?? 0;
    case "riskScore":
      return riskToScore(node.risk);
    case "evidenceCount":
      return node.evidenceCount ?? 0;
    case "radius":
    default:
      return node.radius;
  }
}

function riskToScore(risk: RiskLevel): number {
  return { critical: 1, high: 0.75, medium: 0.5, low: 0.25 }[risk] ?? 0.25;
}

/** Map sizeScore → pixel radius for the Canvas renderer.
 *  Range: minPx..maxPx — enforced so no node is unreadably tiny or enormous. */
export function nodePxRadius(sizeScore: number, minPx = 8, maxPx = 28): number {
  return Math.round(minPx + sizeScore * (maxPx - minPx));
}

// ---------------------------------------------------------------------------
// Colour resolution per mode
// ---------------------------------------------------------------------------

export function resolveNodeColor(
  node: GraphNode,
  mode: ColorMode,
  communityColors: Record<string, string>,
): string {
  switch (mode) {
    case "entityType":
      return KIND_COLORS[node.kind] ?? CANVAS_COLORS.mutedFg;
    case "riskLevel":
      return RISK_COLORS[node.risk];
    case "community":
      return node.communityId && communityColors[node.communityId]
        ? communityColors[node.communityId]
        : CANVAS_COLORS.mutedFg;
    case "confidence":
      return confidenceToColor(node.degreeCentrality ?? 0.5);
    case "evidenceStrength":
      return confidenceToColor((node.evidenceCount ?? 0) / 10);
    case "caseAssociation":
      return (node.linkedCaseIds?.length ?? 0) > 0
        ? KIND_COLORS.organization
        : CANVAS_COLORS.mutedFg;
    case "activity":
      return node.lastSeen ? KIND_COLORS.event : CANVAS_COLORS.mutedFg;
    default:
      return KIND_COLORS[node.kind] ?? CANVAS_COLORS.mutedFg;
  }
}

/** Interpolate a 0-1 score into a blue→amber gradient. */
function confidenceToColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped > 0.75) return "#fb923c";
  if (clamped > 0.5) return "#facc15";
  if (clamped > 0.25) return "#6b9dea";
  return CANVAS_COLORS.mutedFg;
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

export function applyFilters(
  graph: EnrichedGraph,
  filters: GraphFilterState,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const {
    entityTypes,
    relationshipTypes,
    riskLevels,
    minConfidence,
    minDegree,
    communityIds,
    caseId,
    dateFrom,
    dateTo,
    searchQuery,
  } = filters;

  const cutoffFrom = dateFrom ? new Date(dateFrom).getTime() : null;
  const cutoffTo = dateTo ? new Date(dateTo).getTime() : null;
  const query = searchQuery.toLowerCase().trim();

  const nodes = graph.nodes.filter((n) => {
    if (entityTypes.size > 0 && !entityTypes.has(n.kind)) return false;
    if (riskLevels.size > 0 && !riskLevels.has(n.risk)) return false;
    if (
      communityIds.size > 0 &&
      (!n.communityId || !communityIds.has(n.communityId))
    )
      return false;
    if (caseId !== "all" && !n.linkedCaseIds?.includes(caseId)) return false;
    if ((n.degree ?? n.radius) < minDegree) return false;
    if (cutoffFrom && n.lastSeen && new Date(n.lastSeen).getTime() < cutoffFrom)
      return false;
    if (cutoffTo && n.firstSeen && new Date(n.firstSeen).getTime() > cutoffTo)
      return false;
    if (query && !n.label.toLowerCase().includes(query)) return false;
    return true;
  });

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = graph.edges.filter((e) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
    if (e.weight < minConfidence) return false;
    if (
      relationshipTypes.size > 0 &&
      !relationshipTypes.has(e.relationshipType)
    )
      return false;
    return true;
  });

  return { nodes, edges };
}

/** Build a default (pass-all) filter state. */
export function defaultFilters(): GraphFilterState {
  return {
    entityTypes: new Set(),
    relationshipTypes: new Set(),
    riskLevels: new Set(),
    minConfidence: 0,
    minDegree: 0,
    communityIds: new Set(),
    caseId: "all",
    dateFrom: "",
    dateTo: "",
    searchQuery: "",
  };
}

// ---------------------------------------------------------------------------
// BFS shortest path
// ---------------------------------------------------------------------------

/** Find shortest path between two nodes using BFS.
 *  Returns { nodeIds, edgeIds } on the path, or empty sets if none found. */
export function findShortestPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  targetId: string,
): { pathNodeIds: Set<string>; pathEdgeIds: Set<string> } {
  if (sourceId === targetId)
    return { pathNodeIds: new Set([sourceId]), pathEdgeIds: new Set() };

  // adjacency list (undirected for path finding)
  const adj = new Map<string, { nodeId: string; edgeId: string }[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    adj.get(edge.source)?.push({ nodeId: edge.target, edgeId: edge.id });
    adj.get(edge.target)?.push({ nodeId: edge.source, edgeId: edge.id });
  }

  // BFS
  const prev = new Map<string, { nodeId: string; edgeId: string }>();
  const visited = new Set<string>([sourceId]);
  const queue = [sourceId];

  outer: while (queue.length > 0) {
    const current = queue.shift()!;
    for (const { nodeId, edgeId } of adj.get(current) ?? []) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        prev.set(nodeId, { nodeId: current, edgeId });
        if (nodeId === targetId) break outer;
        queue.push(nodeId);
      }
    }
  }

  if (!prev.has(targetId))
    return { pathNodeIds: new Set(), pathEdgeIds: new Set() };

  // Reconstruct
  const pathNodeIds = new Set<string>();
  const pathEdgeIds = new Set<string>();
  let cursor = targetId;
  while (cursor !== sourceId) {
    pathNodeIds.add(cursor);
    const step = prev.get(cursor)!;
    pathEdgeIds.add(step.edgeId);
    cursor = step.nodeId;
  }
  pathNodeIds.add(sourceId);

  return { pathNodeIds, pathEdgeIds };
}

// ---------------------------------------------------------------------------
// Neighbourhood expansion
// ---------------------------------------------------------------------------

/** Return node and edge ids reachable within `hops` from `nodeId`. */
export function getNeighbourhood(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeId: string,
  hops: 1 | 2 | 3,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const adj = new Map<string, { nodeId: string; edgeId: string }[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push({ nodeId: e.target, edgeId: e.id });
    adj.get(e.target)?.push({ nodeId: e.source, edgeId: e.id });
  }

  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();
  let frontier = [nodeId];

  for (let h = 0; h < hops; h++) {
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      for (const { nodeId: nid, edgeId } of adj.get(current) ?? []) {
        edgeIds.add(edgeId);
        if (!nodeIds.has(nid)) {
          nodeIds.add(nid);
          nextFrontier.push(nid);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { nodeIds, edgeIds };
}

// ---------------------------------------------------------------------------
// Selection state helpers
// ---------------------------------------------------------------------------

export function buildSelectionState(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedNodeId: string | null,
  hops: 1 | 2 | 3 = 1,
): Pick<GraphSelectionState, "highlightedNodeIds" | "highlightedEdgeIds"> {
  if (!selectedNodeId)
    return { highlightedNodeIds: new Set(), highlightedEdgeIds: new Set() };
  const { nodeIds, edgeIds } = getNeighbourhood(
    nodes,
    edges,
    selectedNodeId,
    hops,
  );
  return { highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds };
}

/** Check whether any filter is active (not default). */
export function hasActiveFilters(f: GraphFilterState): boolean {
  return (
    f.entityTypes.size > 0 ||
    f.relationshipTypes.size > 0 ||
    f.riskLevels.size > 0 ||
    f.minConfidence > 0 ||
    f.minDegree > 0 ||
    f.communityIds.size > 0 ||
    f.caseId !== "all" ||
    f.dateFrom !== "" ||
    f.dateTo !== "" ||
    f.searchQuery !== ""
  );
}

// ---------------------------------------------------------------------------
// Unique relationship labels from an edge list
// ---------------------------------------------------------------------------

export function uniqueRelationshipTypes(
  edges: GraphEdge[],
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of edges) {
    counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

// ---------------------------------------------------------------------------
// Community hull points (convex hull — Graham scan for visual grouping)
// ---------------------------------------------------------------------------

/** Return the convex hull vertices for a set of node positions.
 *  Used to draw community boundary polygons on the canvas. */
export function convexHull(
  points: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) =>
    a.x !== b.x ? a.x - b.x : a.y - b.y,
  );

  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}
