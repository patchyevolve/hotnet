/**
 * graphTransform — unit tests
 *
 * Tests cover the pure transformation functions:
 *   - resolveEdgeStyle
 *   - buildCommunityColors
 *   - enrichGraph
 *   - applyNodeSizing / nodePxRadius
 *   - applyFilters
 *   - findShortestPath
 *   - getNeighbourhood
 *   - convexHull
 *   - hasActiveFilters / defaultFilters
 *   - uniqueRelationshipTypes
 */

import { describe, expect, it } from "vitest";
import {
  applyFilters,
  applyNodeSizing,
  buildCommunityColors,
  convexHull,
  defaultFilters,
  enrichGraph,
  findShortestPath,
  getNeighbourhood,
  hasActiveFilters,
  nodePxRadius,
  resolveEdgeStyle,
  uniqueRelationshipTypes,
} from "./graphTransform";
import type {
  AnalyticsData,
  EntityRecord,
  NetworkEdge,
  NetworkGraph,
  NetworkNode,
} from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  overrides: Partial<NetworkNode> = {},
): NetworkNode {
  return {
    id,
    label: `Node ${id}`,
    kind: "person",
    risk: "low",
    x: Math.random() * 100,
    y: Math.random() * 100,
    radius: 4,
    ...overrides,
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  overrides: Partial<NetworkEdge> = {},
): NetworkEdge {
  return {
    id,
    source,
    target,
    label: "Knows",
    weight: 0.8,
    risk: "low",
    ...overrides,
  };
}

const emptyAnalytics: AnalyticsData = {
  centrality: [],
  communities: [],
  components: [],
  multiHopPaths: [],
  zones: [],
};

const emptyEntities: EntityRecord[] = [];

// ---------------------------------------------------------------------------
// resolveEdgeStyle
// ---------------------------------------------------------------------------

describe("resolveEdgeStyle", () => {
  it("returns directed solid for call relationships", () => {
    const s = resolveEdgeStyle("Called");
    expect(s.directed).toBe(true);
    expect(s.lineStyle).toBe("solid");
  });

  it("returns dashed directed for message relationships", () => {
    const s = resolveEdgeStyle("Messages");
    expect(s.directed).toBe(true);
    expect(s.lineStyle).toBe("dashed");
  });

  it("returns thick-solid directed for transfer relationships", () => {
    const s = resolveEdgeStyle("Transferred To");
    expect(s.directed).toBe(true);
    expect(s.lineStyle).toBe("thick-solid");
    expect(s.thickness).toBeGreaterThan(2);
  });

  it("returns undirected thin solid for knows", () => {
    const s = resolveEdgeStyle("Knows");
    expect(s.directed).toBe(false);
    expect(s.lineStyle).toBe("solid");
  });

  it("returns dotted for member_of", () => {
    const s = resolveEdgeStyle("Member Of");
    expect(s.directed).toBe(true);
    expect(s.lineStyle).toBe("dotted");
  });

  it("returns dashed for located_at", () => {
    const s = resolveEdgeStyle("Located At");
    expect(s.lineStyle).toBe("dashed");
  });

  it("returns solid undirected for unknown types", () => {
    const s = resolveEdgeStyle("MYSTERY_RELATIONSHIP");
    expect(s.lineStyle).toBe("solid");
    expect(s.directed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCommunityColors
// ---------------------------------------------------------------------------

describe("buildCommunityColors", () => {
  it("assigns a colour string to each community id", () => {
    const colors = buildCommunityColors(["C1", "C2", "C3"]);
    expect(Object.keys(colors)).toHaveLength(3);
    for (const color of Object.values(colors)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("deduplicates community ids", () => {
    const colors = buildCommunityColors(["C1", "C1", "C2"]);
    expect(Object.keys(colors)).toHaveLength(2);
  });

  it("returns empty object for empty input", () => {
    expect(buildCommunityColors([])).toEqual({});
  });

  it("assigns the same colour for the same id across calls", () => {
    const a = buildCommunityColors(["X", "Y"]);
    const b = buildCommunityColors(["X", "Y"]);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// enrichGraph
// ---------------------------------------------------------------------------

describe("enrichGraph", () => {
  it("returns a graph with the same node/edge count", () => {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [makeNode("n1"), makeNode("n2")],
      edges: [makeEdge("e1", "n1", "n2")],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    expect(eg.nodes).toHaveLength(2);
    expect(eg.edges).toHaveLength(1);
  });

  it("merges centrality data onto nodes", () => {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [makeNode("n1")],
      edges: [],
    };
    const analytics: AnalyticsData = {
      ...emptyAnalytics,
      centrality: [
        { nodeId: "n1", degree: 5, betweenness: 0.42, pageRank: 0.09 },
      ],
    };
    const eg = enrichGraph(network, analytics, emptyEntities);
    const n = eg.nodes[0];
    expect(n.degree).toBe(5);
    expect(n.betweenness).toBeCloseTo(0.42);
    expect(n.pageRank).toBeCloseTo(0.09);
  });

  it("assigns communityId from analytics", () => {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [makeNode("n1"), makeNode("n2")],
      edges: [],
    };
    const analytics: AnalyticsData = {
      ...emptyAnalytics,
      communities: [{ communityId: "C1", nodeIds: ["n1", "n2"] }],
    };
    const eg = enrichGraph(network, analytics, emptyEntities);
    expect(eg.nodes[0].communityId).toBe("C1");
    expect(eg.nodes[1].communityId).toBe("C1");
  });

  it("merges entity metadata onto nodes", () => {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [makeNode("n1")],
      edges: [],
    };
    const entities: EntityRecord[] = [
      {
        id: "n1",
        kind: "person",
        name: "Node n1",
        alias: ["Alias1"],
        risk: "high",
        summary: "A test entity",
        identifiers: [],
        linkedCaseIds: ["CASE_000001"],
        linkedEntityIds: [],
        firstSeen: "2024-01-01T00:00:00Z",
        lastSeen: "2024-06-01T00:00:00Z",
        tags: ["suspect"],
        attributes: {},
      },
    ];
    const eg = enrichGraph(network, emptyAnalytics, entities);
    const n = eg.nodes[0];
    expect(n.alias).toEqual(["Alias1"]);
    expect(n.summary).toBe("A test entity");
    expect(n.linkedCaseIds).toContain("CASE_000001");
    expect(n.tags).toContain("suspect");
  });

  it("resolves edge styles from labels", () => {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [makeNode("n1"), makeNode("n2")],
      edges: [makeEdge("e1", "n1", "n2", { label: "Called" })],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    expect(eg.edges[0].directed).toBe(true);
    expect(eg.edges[0].lineStyle).toBe("solid");
  });
});

// ---------------------------------------------------------------------------
// applyNodeSizing / nodePxRadius
// ---------------------------------------------------------------------------

describe("applyNodeSizing", () => {
  it("sets sizeScore between 0 and 1 inclusive", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [
        makeNode("n1", { radius: 2.5 }),
        makeNode("n2", { radius: 6 }),
        makeNode("n3", { radius: 9.5 }),
      ],
      edges: [],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const sized = applyNodeSizing(eg.nodes, "radius");
    for (const n of sized) {
      expect(n.sizeScore).toBeGreaterThanOrEqual(0);
      expect(n.sizeScore).toBeLessThanOrEqual(1);
    }
  });

  it("largest node gets sizeScore 1 and smallest gets 0", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [makeNode("n1", { radius: 2 }), makeNode("n2", { radius: 8 })],
      edges: [],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const sized = applyNodeSizing(eg.nodes, "radius");
    const scores = sized.map((n) => n.sizeScore ?? 0);
    expect(Math.min(...scores)).toBeCloseTo(0);
    expect(Math.max(...scores)).toBeCloseTo(1);
  });

  it("handles a single node (all same value) without NaN", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [makeNode("n1", { radius: 5 })],
      edges: [],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const sized = applyNodeSizing(eg.nodes, "radius");
    expect(Number.isFinite(sized[0].sizeScore ?? 0)).toBe(true);
  });

  it("risk metric maps critical higher than low", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [
        makeNode("n1", { risk: "critical" }),
        makeNode("n2", { risk: "low" }),
      ],
      edges: [],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const sized = applyNodeSizing(eg.nodes, "riskScore");
    const critical = sized.find((n) => n.id === "n1")!;
    const low = sized.find((n) => n.id === "n2")!;
    expect(critical.sizeScore).toBeGreaterThan(low.sizeScore ?? 0);
  });
});

describe("nodePxRadius", () => {
  it("returns minPx for score 0", () => {
    expect(nodePxRadius(0, 8, 28)).toBe(8);
  });

  it("returns maxPx for score 1", () => {
    expect(nodePxRadius(1, 8, 28)).toBe(28);
  });

  it("returns midpoint for score 0.5", () => {
    expect(nodePxRadius(0.5, 8, 28)).toBe(18);
  });

  it("clamps values outside 0-1 to the range bounds", () => {
    expect(nodePxRadius(-0.5, 8, 28)).toBeLessThanOrEqual(8);
    expect(nodePxRadius(1.5, 8, 28)).toBeGreaterThanOrEqual(28);
  });
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe("applyFilters", () => {
  function makeGraph() {
    const network: NetworkGraph = {
      caseId: "CASE_000001",
      nodes: [
        makeNode("p1", { kind: "person", risk: "critical" }),
        makeNode("p2", { kind: "person", risk: "low" }),
        makeNode("ph1", { kind: "phone", risk: "medium" }),
        makeNode("loc1", { kind: "location", risk: "high" }),
      ],
      edges: [
        makeEdge("e1", "p1", "p2", { label: "Knows", weight: 0.9 }),
        makeEdge("e2", "p1", "ph1", { label: "Uses", weight: 0.5 }),
        makeEdge("e3", "p2", "loc1", { label: "Located At", weight: 0.3 }),
      ],
    };
    const analytics: AnalyticsData = {
      ...emptyAnalytics,
      centrality: [
        { nodeId: "p1", degree: 3 },
        { nodeId: "p2", degree: 2 },
        { nodeId: "ph1", degree: 1 },
        { nodeId: "loc1", degree: 1 },
      ],
    };
    return enrichGraph(network, analytics, emptyEntities);
  }

  it("returns all nodes/edges when filters are empty", () => {
    const eg = makeGraph();
    const result = applyFilters(eg, defaultFilters());
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
  });

  it("filters by entity type", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    f.entityTypes = new Set(["person"]);
    const result = applyFilters(eg, f);
    expect(result.nodes.every((n) => n.kind === "person")).toBe(true);
    // edges whose both endpoints are persons should remain
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const e of result.edges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });

  it("filters by risk level", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    f.riskLevels = new Set(["critical"]);
    const result = applyFilters(eg, f);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].risk).toBe("critical");
  });

  it("filters by minimum confidence", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    f.minConfidence = 0.6;
    const result = applyFilters(eg, f);
    for (const e of result.edges) {
      expect(e.weight).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("filters by search query (case-insensitive)", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    f.searchQuery = "node p1";
    const result = applyFilters(eg, f);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("p1");
  });

  it("drops edges whose endpoints are filtered out", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    f.entityTypes = new Set(["phone"]);
    const result = applyFilters(eg, f);
    // only ph1 survives; no edges have both endpoints as phone
    expect(result.edges).toHaveLength(0);
  });

  it("filters by relationship type", () => {
    const eg = makeGraph();
    const f = defaultFilters();
    // applyFilters checks edge.relationshipType (lowercased label, spaces→underscores)
    f.relationshipTypes = new Set(["knows"]);
    const result = applyFilters(eg, f);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].label).toBe("Knows");
  });
});

// ---------------------------------------------------------------------------
// findShortestPath
// ---------------------------------------------------------------------------

describe("findShortestPath", () => {
  function makeLinearGraph() {
    // n1 — n2 — n3 — n4
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [makeNode("n1"), makeNode("n2"), makeNode("n3"), makeNode("n4")],
      edges: [
        makeEdge("e1", "n1", "n2"),
        makeEdge("e2", "n2", "n3"),
        makeEdge("e3", "n3", "n4"),
      ],
    };
    return enrichGraph(network, emptyAnalytics, emptyEntities);
  }

  it("finds path on a linear graph", () => {
    const eg = makeLinearGraph();
    const { pathNodeIds, pathEdgeIds } = findShortestPath(
      eg.nodes,
      eg.edges,
      "n1",
      "n4",
    );
    expect(pathNodeIds.has("n1")).toBe(true);
    expect(pathNodeIds.has("n4")).toBe(true);
    expect(pathNodeIds.size).toBe(4);
    expect(pathEdgeIds.size).toBe(3);
  });

  it("returns empty sets when no path exists", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [makeNode("n1"), makeNode("n2")],
      edges: [], // disconnected
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const { pathNodeIds, pathEdgeIds } = findShortestPath(
      eg.nodes,
      eg.edges,
      "n1",
      "n2",
    );
    expect(pathNodeIds.size).toBe(0);
    expect(pathEdgeIds.size).toBe(0);
  });

  it("returns trivial path when source equals target", () => {
    const eg = makeLinearGraph();
    const { pathNodeIds, pathEdgeIds } = findShortestPath(
      eg.nodes,
      eg.edges,
      "n2",
      "n2",
    );
    expect(pathNodeIds.has("n2")).toBe(true);
    expect(pathEdgeIds.size).toBe(0);
  });

  it("finds shortest path (not just any path) on a diamond graph", () => {
    // n1 → n2 → n4 (short)
    // n1 → n3 → n3b → n4 (long)
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [
        makeNode("n1"),
        makeNode("n2"),
        makeNode("n3"),
        makeNode("n3b"),
        makeNode("n4"),
      ],
      edges: [
        makeEdge("e1", "n1", "n2"),
        makeEdge("e2", "n2", "n4"),
        makeEdge("e3", "n1", "n3"),
        makeEdge("e4", "n3", "n3b"),
        makeEdge("e5", "n3b", "n4"),
      ],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const { pathNodeIds } = findShortestPath(eg.nodes, eg.edges, "n1", "n4");
    // Shortest path is n1 → n2 → n4 (3 nodes)
    expect(pathNodeIds.size).toBe(3);
    expect(pathNodeIds.has("n3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNeighbourhood
// ---------------------------------------------------------------------------

describe("getNeighbourhood", () => {
  function makeStarGraph() {
    // hub — a, hub — b, hub — c; a — a1
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [
        makeNode("hub"),
        makeNode("a"),
        makeNode("b"),
        makeNode("c"),
        makeNode("a1"),
      ],
      edges: [
        makeEdge("e1", "hub", "a"),
        makeEdge("e2", "hub", "b"),
        makeEdge("e3", "hub", "c"),
        makeEdge("e4", "a", "a1"),
      ],
    };
    return enrichGraph(network, emptyAnalytics, emptyEntities);
  }

  it("1-hop returns direct neighbours only", () => {
    const eg = makeStarGraph();
    const { nodeIds } = getNeighbourhood(eg.nodes, eg.edges, "hub", 1);
    expect(nodeIds.has("hub")).toBe(true);
    expect(nodeIds.has("a")).toBe(true);
    expect(nodeIds.has("b")).toBe(true);
    expect(nodeIds.has("c")).toBe(true);
    expect(nodeIds.has("a1")).toBe(false);
  });

  it("2-hop reaches second-degree neighbours", () => {
    const eg = makeStarGraph();
    const { nodeIds } = getNeighbourhood(eg.nodes, eg.edges, "hub", 2);
    expect(nodeIds.has("a1")).toBe(true);
  });

  it("includes the source node in the result", () => {
    const eg = makeStarGraph();
    const { nodeIds } = getNeighbourhood(eg.nodes, eg.edges, "hub", 1);
    expect(nodeIds.has("hub")).toBe(true);
  });

  it("includes incident edges", () => {
    const eg = makeStarGraph();
    const { edgeIds } = getNeighbourhood(eg.nodes, eg.edges, "hub", 1);
    expect(edgeIds.has("e1")).toBe(true);
    expect(edgeIds.has("e2")).toBe(true);
    expect(edgeIds.has("e3")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// convexHull
// ---------------------------------------------------------------------------

describe("convexHull", () => {
  it("returns empty array for fewer than 3 points", () => {
    expect(
      convexHull([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]).length,
    ).toBeLessThan(3);
  });

  it("returns 4 points for a rectangle (4 corners)", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 }, // interior point — should be excluded
    ];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    // All hull points should be corners
    for (const p of hull) {
      expect(p.x === 0 || p.x === 1).toBe(true);
      expect(p.y === 0 || p.y === 1).toBe(true);
    }
  });

  it("does not include interior points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior
    ];
    const hull = convexHull(pts);
    const hullSet = hull.map((p) => `${p.x},${p.y}`);
    expect(hullSet).not.toContain("5,5");
  });
});

// ---------------------------------------------------------------------------
// hasActiveFilters / defaultFilters
// ---------------------------------------------------------------------------

describe("hasActiveFilters", () => {
  it("returns false for default filters", () => {
    expect(hasActiveFilters(defaultFilters())).toBe(false);
  });

  it("returns true when entityTypes is set", () => {
    const f = defaultFilters();
    f.entityTypes = new Set(["person"]);
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("returns true when minConfidence > 0", () => {
    const f = defaultFilters();
    f.minConfidence = 0.5;
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("returns true when searchQuery is non-empty", () => {
    const f = defaultFilters();
    f.searchQuery = "rakesh";
    expect(hasActiveFilters(f)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// uniqueRelationshipTypes
// ---------------------------------------------------------------------------

describe("uniqueRelationshipTypes", () => {
  it("returns sorted by count descending", () => {
    const network: NetworkGraph = {
      caseId: "C",
      nodes: [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")],
      edges: [
        makeEdge("e1", "a", "b", { label: "Knows" }),
        makeEdge("e2", "b", "c", { label: "Knows" }),
        makeEdge("e3", "c", "d", { label: "Called" }),
      ],
    };
    const eg = enrichGraph(network, emptyAnalytics, emptyEntities);
    const types = uniqueRelationshipTypes(eg.edges);
    expect(types[0].label).toBe("Knows");
    expect(types[0].count).toBe(2);
    expect(types[1].label).toBe("Called");
    expect(types[1].count).toBe(1);
  });

  it("returns empty array for empty edge list", () => {
    expect(uniqueRelationshipTypes([])).toHaveLength(0);
  });
});
