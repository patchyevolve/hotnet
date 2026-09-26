import {
  DetailField,
  DetailPanel,
  EmptyState,
  FilterBar,
  GraphCanvas,
  PageHeader,
  RiskBadge,
} from "@/components/crimenet";
import { openEntityDrawer } from "@/components/crimenet/AppShell";
import { entityKindLabels } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  getCases,
  getEntities,
  getNetworkGraph,
} from "@/lib/crimenet/services";
import type {
  CaseRecord,
  EntityRecord,
  NetworkGraph,
  RiskLevel,
} from "@/lib/crimenet/types";
import { Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const dateRanges = [
  { value: "all", label: "Any date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

/** Edge labels arrive as `SHARED_PHONE`; the UI shows `Shared Phone`. */
function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

const legendColors = [
  "var(--info)",
  "var(--risk-medium)",
  "var(--risk-high)",
  "var(--risk-critical)",
];

export function NetworkPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [relationship, setRelationship] = useState("all");
  const [caseId, setCaseId] = useState("all");
  const [risk, setRisk] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getNetworkGraph(), getEntities(), getCases()]).then(
      ([graphResult, entityResult, caseResult]) => {
        if (cancelled) return;
        setGraph(graphResult);
        setEntities(entityResult);
        setCases(caseResult);
        setSelectedId(graphResult.nodes[0]?.id ?? null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const entityMap = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities],
  );

  // The legend and the relationship filter describe the graph that actually
  // loaded, not a fixed vocabulary.
  const relationshipOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of graph?.edges ?? []) {
      const key = edge.label.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({
        value,
        count,
        label: titleCase(value),
      }));
  }, [graph]);

  const filteredGraph = useMemo(() => {
    if (!graph) return null;

    const cutoff =
      dateRange === "all"
        ? null
        : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;

    const matchesDate = (entityId: string) => {
      if (!cutoff) return true;
      const entity = entityMap.get(entityId);
      if (!entity) return true;
      return new Date(entity.lastSeen).getTime() >= cutoff;
    };

    const matchesCase = (entityId: string) => {
      if (caseId === "all") return true;
      const entity = entityMap.get(entityId);
      if (!entity) return false;
      return entity.linkedCaseIds.includes(caseId);
    };

    const nodes = graph.nodes.filter(
      (node) =>
        (kind === "all" || node.kind === kind) &&
        (risk === "all" || node.risk === risk) &&
        matchesCase(node.id) &&
        matchesDate(node.id),
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        (relationship === "all" ||
          edge.label.toLowerCase().includes(relationship)),
    );
    return { ...graph, nodes, edges };
  }, [graph, kind, risk, relationship, caseId, dateRange, entityMap]);

  const selectedEntity =
    entities.find((entity) => entity.id === selectedId) ?? null;

  const resetFilters = () => {
    setKind("all");
    setRelationship("all");
    setCaseId("all");
    setRisk("all");
    setDateRange("all");
  };

  return (
    <div data-ocid="network.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.linkAnalysis}
        title={strings.network}
        description={strings.networkDescription}
      />

      <FilterBar
        filters={[
          {
            id: "kind",
            label: strings.entityType,
            value: kind,
            onChange: setKind,
            options: [
              { value: "all", label: strings.all },
              ...Object.entries(entityKindLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ],
          },
          {
            id: "relationship",
            label: strings.relationshipType,
            value: relationship,
            onChange: setRelationship,
            options: [
              { value: "all", label: strings.all },
              ...relationshipOptions.map((option) => ({
                value: option.value,
                label: `${option.label} (${option.count})`,
              })),
            ],
          },
          {
            id: "case",
            label: strings.caseFilter,
            value: caseId,
            onChange: setCaseId,
            options: [
              { value: "all", label: strings.all },
              ...cases.map((item) => ({ value: item.id, label: item.id })),
            ],
          },
          {
            id: "risk",
            label: strings.riskLevel,
            value: risk,
            onChange: setRisk,
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
            value: dateRange,
            onChange: setDateRange,
            options: dateRanges.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          },
        ]}
        onReset={resetFilters}
        resultCount={filteredGraph?.nodes.length ?? 0}
        resultLabel="nodes"
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        {loading || !filteredGraph ? (
          <div
            data-ocid="network.loading_state"
            className="panel h-[560px] animate-pulse bg-muted/20"
          />
        ) : filteredGraph.nodes.length === 0 ? (
          <EmptyState
            icon={<Network className="size-5" aria-hidden />}
            title={strings.emptyTitle}
            body={strings.emptyBody}
          />
        ) : (
          <GraphCanvas
            graph={filteredGraph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onExpand={(id) => {
              setSelectedId(id);
              openEntityDrawer(id);
            }}
            className="h-[560px]"
          />
        )}

        <DetailPanel
          title={selectedEntity ? selectedEntity.name : strings.noSelection}
          subtitle={selectedEntity?.id}
          badge={
            selectedEntity ? (
              <RiskBadge risk={selectedEntity.risk} />
            ) : undefined
          }
          footer={
            selectedEntity ? (
              <button
                type="button"
                data-ocid="network.open_entity_button"
                onClick={() => openEntityDrawer(selectedEntity.id)}
                className="w-full rounded-md border border-info/40 bg-info/12 py-2 text-sm font-medium text-info transition-smooth hover:bg-info/20"
              >
                {strings.openRecord}
              </button>
            ) : undefined
          }
        >
          {selectedEntity ? (
            <>
              <p className="text-sm text-muted-foreground">
                {selectedEntity.summary}
              </p>
              <div className="mt-3">
                <DetailField
                  label={strings.type}
                  value={entityKindLabels[selectedEntity.kind]}
                />
                <DetailField
                  label={strings.district}
                  value={selectedEntity.district}
                />
                {selectedEntity.identifiers.map((identifier) => (
                  <DetailField
                    key={`${identifier.label}-${identifier.value}`}
                    label={identifier.label}
                    value={identifier.value}
                    mono
                  />
                ))}
                <DetailField
                  label={strings.connections}
                  value={String(selectedEntity.linkedEntityIds.length)}
                  mono
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectMarker}
            </p>
          )}
        </DetailPanel>
      </div>

      <section className="mt-4 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.graphLegend}
          </h2>
          <span className="text-xs text-muted-foreground">
            {strings.expandNetworkHint}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
          {relationshipOptions.map((option, index) => (
            <span
              key={option.value}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="h-0.5 w-6 rounded-full"
                style={{
                  backgroundColor: legendColors[index % legendColors.length],
                }}
                aria-hidden
              />
              {option.label}
              <span className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
                {option.count}
              </span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
