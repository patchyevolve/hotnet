/**
 * NetworkPage — Criminal Network Analysis
 *
 * Full analysis-grade graph visualization: force-directed Canvas renderer,
 * mode/colour/size controls, analytical filters, entity detail panel,
 * path analysis, neighbourhood expansion, community hulls, and legend.
 */

import { openEntityDrawer } from "@/components/crimenet/AppShell";
import {
  EdgeDetailPanel,
  EntityDetailPanel,
} from "@/components/crimenet/EntityDetailPanel";
import { GraphCanvas } from "@/components/crimenet/GraphCanvas";
import { GraphControls } from "@/components/crimenet/GraphControls";
import { GraphLegend } from "@/components/crimenet/GraphLegend";
import { EmptyState, FilterBar, PageHeader } from "@/components/crimenet/index";
import { entityKindLabels } from "@/lib/crimenet/format";
import {
  applyFilters,
  applyNodeSizing,
  buildSelectionState,
  defaultFilters,
  enrichGraph,
  findShortestPath,
  hasActiveFilters,
  uniqueRelationshipTypes,
} from "@/lib/crimenet/graphTransform";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  getAnalytics,
  getCases,
  getEntities,
  getNetworkGraph,
} from "@/lib/crimenet/services";
import type {
  CaseRecord,
  ColorMode,
  EnrichedGraph,
  GraphEdge,
  GraphFilterState,
  GraphMode,
  GraphNode,
  GraphSelectionState,
  SizeMetric,
} from "@/lib/crimenet/types";
import { Network } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "Any date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NetworkPage() {
  const { language } = useRole();
  const strings = getStrings(language);

  // -- Raw data -----------------------------------------------------------
  const [enriched, setEnriched] = useState<EnrichedGraph | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getNetworkGraph(),
      getAnalytics(),
      getEntities(),
      getCases(),
    ]).then(([network, analytics, entities, caseList]) => {
      if (cancelled) return;
      const eg = enrichGraph(network, analytics, entities);
      const sized = { ...eg, nodes: applyNodeSizing(eg.nodes, "radius") };
      setEnriched(sized);
      setCases(caseList);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // -- Visualization controls --------------------------------------------
  const [graphMode, setGraphMode] = useState<GraphMode>("network");
  const [colorMode, setColorMode] = useState<ColorMode>("entityType");
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>("radius");
  const [frozen, setFrozen] = useState(true);
  const [showCommunityHulls, setShowCommunityHulls] = useState(false);
  const [neighbourhoodHops, setNeighbourhoodHops] = useState<1 | 2 | 3>(1);

  // Re-apply sizing when the metric changes
  const sizedEnriched = useMemo(() => {
    if (!enriched) return null;
    return { ...enriched, nodes: applyNodeSizing(enriched.nodes, sizeMetric) };
  }, [enriched, sizeMetric]);

  // -- Filters -----------------------------------------------------------
  const [filters, setFilters] = useState<GraphFilterState>(defaultFilters);
  const [quickKind, setQuickKind] = useState("all");
  const [quickRisk, setQuickRisk] = useState("all");
  const [quickCase, setQuickCase] = useState("all");
  const [quickRelType, setQuickRelType] = useState("all");
  const [quickDateRange, setQuickDateRange] = useState("all");

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters());
    setQuickKind("all");
    setQuickRisk("all");
    setQuickCase("all");
    setQuickRelType("all");
    setQuickDateRange("all");
  }, []);

  // Merge the quick-filter dropdowns into the full filter state
  const mergedFilters = useMemo<GraphFilterState>(() => {
    const base = { ...filters };
    if (quickKind !== "all") {
      base.entityTypes = new Set([
        quickKind as GraphFilterState["entityTypes"] extends Set<infer T>
          ? T
          : never,
      ]);
    }
    if (quickRisk !== "all") {
      base.riskLevels = new Set([
        quickRisk as GraphFilterState["riskLevels"] extends Set<infer T>
          ? T
          : never,
      ]);
    }
    if (quickCase !== "all") base.caseId = quickCase;
    if (quickRelType !== "all")
      base.relationshipTypes = new Set([quickRelType]);
    if (quickDateRange !== "all") {
      const days = Number(quickDateRange);
      base.dateTo = new Date().toISOString();
      base.dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
    } else {
      base.dateFrom = "";
      base.dateTo = "";
    }
    return base;
  }, [filters, quickKind, quickRisk, quickCase, quickRelType, quickDateRange]);

  const filteredGraph = useMemo(() => {
    if (!sizedEnriched) return null;
    const { nodes, edges } = applyFilters(sizedEnriched, mergedFilters);
    return { ...sizedEnriched, nodes, edges };
  }, [sizedEnriched, mergedFilters]);

  // -- Selection state ---------------------------------------------------
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(),
  );

  // Path analysis
  const [pathMode, setPathMode] = useState(false);
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const pathSourceClickedRef = useRef(false);

  const clearPath = useCallback(() => {
    setPathSource(null);
    setPathTarget(null);
    pathSourceClickedRef.current = false;
  }, []);

  const handleSelectNode = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        setSelectedEdgeId(null);
        return;
      }

      if (pathMode) {
        // First click = source, second = target
        if (!pathSource) {
          setPathSource(id);
          pathSourceClickedRef.current = true;
        } else if (!pathTarget && id !== pathSource) {
          setPathTarget(id);
        }
        return;
      }

      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [pathMode, pathSource, pathTarget],
  );

  const handleSelectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, []);

  // Neighbourhood highlight
  const neighbourhoodState = useMemo(() => {
    if (!filteredGraph || !selectedNodeId) return null;
    return buildSelectionState(
      filteredGraph.nodes,
      filteredGraph.edges,
      selectedNodeId,
      neighbourhoodHops,
    );
  }, [filteredGraph, selectedNodeId, neighbourhoodHops]);

  // Path resolution
  const pathResult = useMemo(() => {
    if (!filteredGraph || !pathSource || !pathTarget) return null;
    return findShortestPath(
      filteredGraph.nodes,
      filteredGraph.edges,
      pathSource,
      pathTarget,
    );
  }, [filteredGraph, pathSource, pathTarget]);

  // Assembled selection state passed to canvas
  const selectionState = useMemo<Partial<GraphSelectionState>>(
    () => ({
      selectedNodeId,
      selectedNodeIds,
      selectedEdgeId,
      highlightedNodeIds: neighbourhoodState?.highlightedNodeIds ?? new Set(),
      highlightedEdgeIds: neighbourhoodState?.highlightedEdgeIds ?? new Set(),
      pathSource,
      pathTarget,
      pathNodeIds: pathResult?.pathNodeIds ?? new Set(),
      pathEdgeIds: pathResult?.pathEdgeIds ?? new Set(),
    }),
    [
      selectedNodeId,
      selectedNodeIds,
      selectedEdgeId,
      neighbourhoodState,
      pathSource,
      pathTarget,
      pathResult,
    ],
  );

  // -- Derived display data ---------------------------------------------
  const selectedNode = useMemo(
    () => filteredGraph?.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [filteredGraph, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => filteredGraph?.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [filteredGraph, selectedEdgeId],
  );

  const edgeSourceNode = useMemo(
    () =>
      selectedEdge
        ? (filteredGraph?.nodes.find((n) => n.id === selectedEdge.source) ??
          null)
        : null,
    [selectedEdge, filteredGraph],
  );

  const edgeTargetNode = useMemo(
    () =>
      selectedEdge
        ? (filteredGraph?.nodes.find((n) => n.id === selectedEdge.target) ??
          null)
        : null,
    [selectedEdge, filteredGraph],
  );

  // Path labels
  const pathSourceLabel = useMemo(
    () => filteredGraph?.nodes.find((n) => n.id === pathSource)?.label,
    [filteredGraph, pathSource],
  );
  const pathTargetLabel = useMemo(
    () => filteredGraph?.nodes.find((n) => n.id === pathTarget)?.label,
    [filteredGraph, pathTarget],
  );

  // Relationship types for filter dropdown & legend
  const relationshipTypes = useMemo(
    () => uniqueRelationshipTypes(filteredGraph?.edges ?? []),
    [filteredGraph],
  );

  const edgeLabelsForLegend = useMemo(
    () => [...new Set(filteredGraph?.edges.map((e) => e.label) ?? [])],
    [filteredGraph],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div data-ocid="network.page" className="flex flex-col gap-4 pb-6">
      <PageHeader
        eyebrow={strings.linkAnalysis}
        title={strings.network}
        description={strings.networkDescription}
      />

      {/* Quick filter bar */}
      <FilterBar
        filters={[
          {
            id: "kind",
            label: strings.entityType,
            value: quickKind,
            onChange: setQuickKind,
            options: [
              { value: "all", label: strings.all },
              ...Object.entries(entityKindLabels).map(([v, l]) => ({
                value: v,
                label: l,
              })),
            ],
          },
          {
            id: "relationship",
            label: strings.relationshipType,
            value: quickRelType,
            onChange: setQuickRelType,
            options: [
              { value: "all", label: strings.all },
              ...relationshipTypes.map((r) => ({
                value: r.label,
                label: `${r.label} (${r.count})`,
              })),
            ],
          },
          {
            id: "case",
            label: strings.caseFilter,
            value: quickCase,
            onChange: setQuickCase,
            options: [
              { value: "all", label: strings.all },
              ...cases.map((c) => ({ value: c.id, label: c.id })),
            ],
          },
          {
            id: "risk",
            label: strings.riskLevel,
            value: quickRisk,
            onChange: setQuickRisk,
            options: [
              { value: "all", label: strings.all },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
          },
          {
            id: "dateRange",
            label: strings.dateRange,
            value: quickDateRange,
            onChange: setQuickDateRange,
            options: DATE_RANGE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            })),
          },
        ]}
        onReset={resetFilters}
        resultCount={filteredGraph?.nodes.length ?? 0}
        resultLabel="nodes"
      />

      {/* Visualization controls */}
      <GraphControls
        graphMode={graphMode}
        onGraphModeChange={setGraphMode}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        sizeMetric={sizeMetric}
        onSizeMetricChange={(m) => {
          setSizeMetric(m);
        }}
        frozen={frozen}
        onFrozenChange={setFrozen}
        showCommunityHulls={showCommunityHulls}
        onCommunityHullsChange={setShowCommunityHulls}
        pathMode={pathMode}
        onPathModeChange={(active) => {
          setPathMode(active);
          if (!active) clearPath();
        }}
        pathSource={pathSource}
        pathTarget={pathTarget}
        pathSourceLabel={pathSourceLabel}
        pathTargetLabel={pathTargetLabel}
        onClearPath={clearPath}
        neighbourhoodHops={neighbourhoodHops}
        onNeighbourhoodHopsChange={setNeighbourhoodHops}
        nodeCount={filteredGraph?.nodes.length ?? 0}
        edgeCount={filteredGraph?.edges.length ?? 0}
      />

      {/* Main canvas + detail panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {loading ? (
          <div
            data-ocid="network.loading_state"
            className="h-[580px] animate-pulse rounded-lg bg-card/50"
          />
        ) : !filteredGraph || filteredGraph.nodes.length === 0 ? (
          <EmptyState
            icon={<Network className="size-5" aria-hidden />}
            title={strings.emptyTitle}
            body={strings.emptyBody}
          />
        ) : (
          <GraphCanvas
            graph={filteredGraph}
            selectedId={selectedNodeId}
            onSelect={handleSelectNode}
            onSelectEdge={handleSelectEdge}
            onExpand={(id) => {
              setSelectedNodeId(id);
              openEntityDrawer(id);
            }}
            colorMode={colorMode}
            sizeMetric={sizeMetric}
            graphMode={graphMode}
            selection={selectionState}
            frozen={frozen}
            showCommunityHulls={showCommunityHulls}
            className="h-[580px]"
          />
        )}

        {/* Right panel: node or edge detail */}
        {selectedEdgeId ? (
          <EdgeDetailPanel
            edge={selectedEdge}
            sourceNode={edgeSourceNode}
            targetNode={edgeTargetNode}
            className="h-[580px]"
          />
        ) : (
          <EntityDetailPanel
            node={selectedNode}
            edges={filteredGraph?.edges ?? []}
            onOpenFull={(id) => openEntityDrawer(id)}
            onSetPathSource={(id) => {
              setPathMode(true);
              setPathSource(id);
            }}
            onSetPathTarget={(id) => {
              setPathMode(true);
              setPathTarget(id);
            }}
            pathMode={pathMode}
            className="h-[580px]"
          />
        )}
      </div>

      {/* Legend */}
      <GraphLegend
        colorMode={colorMode}
        edgeLabels={edgeLabelsForLegend}
        communityColors={filteredGraph?.communityColors ?? {}}
      />
    </div>
  );
}
