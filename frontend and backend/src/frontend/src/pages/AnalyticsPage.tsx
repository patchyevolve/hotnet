import {
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
} from "@/components/crimenet";
import { formatNumber, formatPercent } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getAnalytics, getEntities } from "@/lib/crimenet/services";
import type {
  AnalyticsData,
  CentralityRow,
  ComponentRow,
} from "@/lib/crimenet/types";
import { Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
      <span className="label-caps text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function metric(value: number | undefined): string {
  return value === undefined ? "—" : value.toPrecision(4);
}

/**
 * Graph analytics for the current run: centrality, communities, components,
 * multi-hop paths and risk zones — all read straight from the pipeline output.
 */
export function AnalyticsPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void getAnalytics().then((result) => {
      if (!cancelled) setData(result);
    });
    void getEntities().then((rows) => {
      if (cancelled) return;
      setNames(new Map(rows.map((row) => [row.id, row.name || row.id])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (id?: string) => (id ? (names.get(id) ?? id) : "—");

  const centrality = useMemo(
    () =>
      [...(data?.centrality ?? [])].sort(
        (a, b) => (b.betweenness ?? 0) - (a.betweenness ?? 0),
      ),
    [data],
  );

  const components = useMemo(
    () =>
      [...(data?.components ?? [])].sort(
        (a, b) => (b.size ?? 0) - (a.size ?? 0),
      ),
    [data],
  );

  const zones = useMemo(
    () =>
      [...(data?.zones ?? [])].sort(
        (a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0),
      ),
    [data],
  );

  const centralityColumns: Column<CentralityRow>[] = [
    {
      key: "name",
      header: strings.name,
      render: (row) => (
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-sm text-foreground">{row.name}</p>
          <p className="truncate font-mono-id text-[11px] text-muted-foreground">
            {row.nodeId}
          </p>
        </div>
      ),
    },
    { key: "type", header: strings.type, render: (row) => row.nodeType ?? "—" },
    {
      key: "degree",
      header: strings.degree,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{row.degree ?? "—"}</span>
      ),
    },
    {
      key: "betweenness",
      header: strings.betweenness,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{metric(row.betweenness)}</span>
      ),
    },
    {
      key: "closeness",
      header: strings.closeness,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{metric(row.closeness)}</span>
      ),
    },
    {
      key: "eigenvector",
      header: strings.eigenvector,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{metric(row.eigenvector)}</span>
      ),
    },
  ];

  const componentColumns: Column<ComponentRow>[] = [
    {
      key: "id",
      header: strings.componentsLabel,
      render: (row) => <span className="font-mono-id">{row.componentId}</span>,
    },
    {
      key: "size",
      header: strings.size,
      align: "right",
      render: (row) => <span className="tabular-nums">{row.size ?? "—"}</span>,
    },
    {
      key: "edges",
      header: strings.relationships,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{row.edgeCount ?? "—"}</span>
      ),
    },
    {
      key: "confidence",
      header: strings.confidence,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">
          {row.avgConfidence === undefined
            ? "—"
            : formatPercent(row.avgConfidence, 1)}
        </span>
      ),
    },
    {
      key: "investigation",
      header: strings.riskLevel,
      render: (row) => (row.isCandidateForInvestigation ? "candidate" : "—"),
    },
  ];

  return (
    <div data-ocid="analytics.page" className="flex flex-col gap-6">
      <PageHeader
        eyebrow={strings.network}
        title={strings.graphAnalytics}
        description={strings.analyticsHint}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={strings.nodeCount}
          value={formatNumber(data?.statistics?.totalNodes ?? 0)}
        />
        <Stat
          label={strings.edgeCount}
          value={formatNumber(data?.statistics?.totalEdges ?? 0)}
        />
        <Stat
          label={strings.communities}
          value={formatNumber(data?.communities.length ?? 0)}
        />
        <Stat
          label={strings.componentsLabel}
          value={formatNumber(data?.components.length ?? 0)}
        />
      </div>

      {!data ? (
        <div
          data-ocid="analytics.loading_state"
          className="panel h-64 animate-pulse bg-muted/20"
        />
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.centrality}
              </h2>
              <span className="font-mono-id text-xs text-muted-foreground">
                {formatNumber(centrality.length)}
              </span>
            </div>
            <div className="p-4">
              <DataTable
                columns={centralityColumns}
                rows={centrality.slice(0, 25)}
                rowKey={(row) => row.nodeId}
                dense
                emptyState={
                  <EmptyState
                    icon={<Network className="size-5" aria-hidden />}
                    title={strings.emptyTitle}
                    body={strings.emptyBody}
                  />
                }
              />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.communities}
                </h2>
                <span className="font-mono-id text-xs text-muted-foreground">
                  {formatNumber(data.communities.length)}
                </span>
              </div>
              <div className="p-4">
                {data.communities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {strings.emptyBody}
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {data.communities.map((community) => (
                      <li
                        key={community.communityId ?? community.size}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-xs text-foreground">
                          {community.communityId}
                        </span>
                        <span className="shrink-0 font-mono-id text-[11px] tabular-nums text-muted-foreground">
                          {community.size} · {community.dominantNodeType}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.multiHop}
                </h2>
                <span className="font-mono-id text-xs text-muted-foreground">
                  {formatNumber(data.multiHopPaths.length)}
                </span>
              </div>
              <div className="p-4">
                {data.multiHopPaths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {strings.emptyBody}
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {data.multiHopPaths.map((path) => (
                      <li
                        key={`${path.sourceId}-${path.targetId}`}
                        className="rounded-md border border-border bg-card/60 px-3 py-2"
                      >
                        <p className="truncate font-mono-id text-[11px] text-foreground">
                          {(path.path ?? []).map(label).join(" → ")}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                          <span>
                            {path.hops} {strings.multiHop}
                          </span>
                          <span>
                            {strings.confidence}{" "}
                            {path.pathConfidence === undefined
                              ? "—"
                              : formatPercent(path.pathConfidence, 1)}
                          </span>
                          <span className="font-mono-id">
                            {path.epistemicStatus}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.componentsLabel}
              </h2>
              <span className="font-mono-id text-xs text-muted-foreground">
                {formatNumber(components.length)}
              </span>
            </div>
            <div className="p-4">
              <DataTable
                columns={componentColumns}
                rows={components.slice(0, 25)}
                rowKey={(row, index) => String(row.componentId ?? index)}
                dense
                emptyState={
                  <EmptyState
                    title={strings.emptyTitle}
                    body={strings.emptyBody}
                  />
                }
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.riskZones}
              </h2>
              <span className="font-mono-id text-xs text-muted-foreground">
                {formatNumber(zones.length)}
              </span>
            </div>
            <div className="p-4">
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {strings.emptyBody}
                </p>
              ) : (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {zones.slice(0, 12).map((zone) => (
                    <li
                      key={zone.hexId ?? zone.latitude}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-xs text-foreground">
                        {zone.locationNames?.join(", ") ?? zone.hexId}
                      </span>
                      <span className="shrink-0 font-mono-id text-[11px] tabular-nums text-muted-foreground">
                        {zone.riskScore?.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
