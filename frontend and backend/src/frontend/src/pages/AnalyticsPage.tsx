import {
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  StatusPill,
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
import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
      <span className="label-caps text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

/** Centrality ratios render as fixed 4-decimal scores, never as percents. */
function metric(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(4);
}

/** Confidences, densities and scores are 0–1 ratios; show them as percents. */
function ratio(value: number | undefined, digits = 1): string {
  return value === undefined ? "—" : formatPercent(value * 100, digits);
}

function bandTone(band?: string): "neutral" | "success" | "warning" | "danger" {
  if (band === "RED") return "danger";
  if (band === "AMBER") return "warning";
  if (band === "GREEN") return "success";
  return "neutral";
}

function isEntityId(id: string): boolean {
  return id.startsWith("RES_");
}

/**
 * Graph analytics for the current run: centrality, communities, components,
 * multi-hop paths and risk zones — all read straight from the pipeline output.
 *
 * Percentages are 0–1 ratios in the payload; every confidence/density cell
 * goes through `ratio()` so 0.8478 reads "84.8%", not "0.8%".
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

  const label = (id?: string): string => {
    if (!id) return "—";
    const named = names.get(id);
    if (named) return named;
    // Unresolved graph nodes (PERSON_…, unknown_user_…) are not in /api/entities.
    const prefixed = /^([A-Za-z]+)_(.+)$/.exec(id);
    if (prefixed && prefixed[1].length <= 12) {
      const kind =
        prefixed[1].charAt(0).toUpperCase() +
        prefixed[1].slice(1).toLowerCase();
      return `${kind} ${prefixed[2].slice(0, 8)}…`;
    }
    if (id.includes("_")) return id.replace(/_/g, " ");
    return id.length > 22 ? `${id.slice(0, 20)}…` : id;
  };

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

  /** Isolated single-node components are noise in the table; summarise them. */
  const isolatedCount = useMemo(
    () => components.filter((row) => (row.size ?? 0) <= 1).length,
    [components],
  );
  const clusteredComponents = useMemo(
    () => components.filter((row) => (row.size ?? 1) >= 2),
    [components],
  );

  const communities = useMemo(
    () =>
      [...(data?.communities ?? [])].sort(
        (a, b) => (b.size ?? 0) - (a.size ?? 0),
      ),
    [data],
  );

  const paths = useMemo(
    () =>
      [...(data?.multiHopPaths ?? [])]
        .sort((a, b) => (b.pathConfidence ?? 0) - (a.pathConfidence ?? 0))
        .slice(0, 12),
    [data],
  );

  const zones = useMemo(
    () =>
      [...(data?.zones ?? [])].sort(
        (a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0),
      ),
    [data],
  );

  const entityLink = (id: string, text: string) =>
    isEntityId(id) ? (
      <Link
        to="/entities/$entityId"
        params={{ entityId: id }}
        className="text-foreground hover:text-info hover:underline"
      >
        {text}
      </Link>
    ) : (
      <span className="text-foreground">{text}</span>
    );

  const centralityColumns: Column<CentralityRow>[] = [
    {
      key: "rank",
      header: "#",
      align: "right",
      render: (_row, index) => (
        <span className="tabular-nums text-muted-foreground">{index + 1}</span>
      ),
    },
    {
      key: "name",
      header: strings.name,
      render: (row) => (
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-sm">
            {entityLink(row.nodeId, row.name || row.nodeId)}
          </p>
          <p className="truncate font-mono-id text-[11px] text-muted-foreground">
            {row.nodeId}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: strings.type,
      render: (row) => row.nodeType ?? "—",
    },
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
      key: "cluster",
      header: strings.componentsLabel,
      render: (row, index) =>
        index === 0 ? (
          <span className="text-sm font-medium text-foreground">
            {strings.mainCluster}
          </span>
        ) : (
          <span className="font-mono-id">#{row.componentId}</span>
        ),
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
        <span className="tabular-nums">{ratio(row.avgConfidence)}</span>
      ),
    },
    {
      key: "keyEntities",
      header: strings.keyEntities,
      render: (row) => {
        const keys = (row.keyEntities ?? []).map(label);
        if (keys.length === 0) return "—";
        const shown = keys.slice(0, 2).join(", ");
        const extra = keys.length - 2;
        return (
          <span className="block max-w-[18rem] truncate text-xs text-muted-foreground">
            {shown}
            {extra > 0 ? ` +${extra}` : ""}
          </span>
        );
      },
    },
    {
      key: "investigation",
      header: strings.investigation,
      render: (row) =>
        row.isCandidateForInvestigation ? (
          <StatusPill label={strings.candidate} tone="info" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
          hint={
            data?.statistics?.avgDegree !== undefined
              ? `avg ${data.statistics.avgDegree} links`
              : undefined
          }
        />
        <Stat
          label={strings.edgeCount}
          value={formatNumber(data?.statistics?.totalEdges ?? 0)}
          hint={
            data?.statistics?.density !== undefined
              ? `${strings.density} ${ratio(data.statistics.density, 2)}`
              : undefined
          }
        />
        <Stat
          label={strings.communities}
          value={formatNumber(data?.communities.length ?? 0)}
        />
        <Stat
          label={strings.componentsLabel}
          value={formatNumber(data?.components.length ?? 0)}
          hint={`${isolatedCount} ${strings.isolated}`}
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
                {strings.showing} {Math.min(25, centrality.length)} /{" "}
                {formatNumber(centrality.length)} ·{" "}
                {strings.rankedByBetweenness}
              </span>
            </div>
            <div className="p-4">
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {strings.centralityHelp}
              </p>
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
                  {formatNumber(communities.length)}
                </span>
              </div>
              <div className="p-4">
                {communities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {strings.emptyBody}
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {communities.map((community) => {
                      const memberIds = community.nodeIds ?? [];
                      const members = memberIds.slice(0, 3).map(label);
                      const extra = Math.max(
                        0,
                        (community.size ?? memberIds.length) - 3,
                      );
                      return (
                        <li
                          key={community.communityId ?? community.size}
                          className="flex flex-col gap-1.5 rounded-md border border-border bg-card/60 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono-id text-xs text-foreground">
                              {community.communityId}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {community.size} {strings.nodesUnit}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                            {community.dominantNodeType ? (
                              <span className="rounded bg-muted/60 px-1.5 py-0.5">
                                {strings.mostly} {community.dominantNodeType}
                              </span>
                            ) : null}
                            {community.density !== undefined ? (
                              <span className="rounded bg-muted/60 px-1.5 py-0.5 tabular-nums">
                                {strings.density} {ratio(community.density, 0)}
                              </span>
                            ) : null}
                            {community.internalEdgeCount !== undefined ? (
                              <span className="rounded bg-muted/60 px-1.5 py-0.5 tabular-nums">
                                {community.internalEdgeCount}{" "}
                                {strings.internalLinks}
                              </span>
                            ) : null}
                          </div>
                          {members.length > 0 ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {members.join(", ")}
                              {extra > 0 ? ` +${extra}` : ""}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
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
                  {strings.showing} {paths.length} /{" "}
                  {formatNumber(data.multiHopPaths.length)} ·{" "}
                  {strings.rankedByConfidence}
                </span>
              </div>
              <div className="p-4">
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  {strings.pathsHelp}
                </p>
                {data.multiHopPaths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {strings.emptyBody}
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {paths.map((path) => {
                      const chain = (path.relationshipTypes ?? []).join(" → ");
                      return (
                        <li
                          key={`${path.sourceId}-${path.targetId}-${path.hops}`}
                          className="rounded-md border border-border bg-card/60 px-3 py-2"
                        >
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                            {(path.path ?? []).map((id, index) => (
                              <Fragment key={id}>
                                {index > 0 ? (
                                  <span
                                    className="text-muted-foreground"
                                    aria-hidden
                                  >
                                    →
                                  </span>
                                ) : null}
                                {entityLink(id, label(id))}
                              </Fragment>
                            ))}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="tabular-nums">
                              {path.hops} {strings.hops}
                            </span>
                            {chain ? (
                              <span className="font-mono-id">{chain}</span>
                            ) : null}
                            <span className="tabular-nums">
                              {strings.confidence} {ratio(path.pathConfidence)}
                            </span>
                            <StatusPill label={strings.inferred} tone="info" />
                          </p>
                        </li>
                      );
                    })}
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
                {strings.showing} {clusteredComponents.length} /{" "}
                {formatNumber(components.length)}
              </span>
            </div>
            <div className="p-4">
              <div
                data-ocid="analytics.components_summary"
                className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
              >
                {clusteredComponents[0] ? (
                  <span>
                    <strong className="font-medium text-foreground">
                      {strings.mainCluster}
                    </strong>{" "}
                    · {clusteredComponents[0].size} {strings.nodesUnit}
                  </span>
                ) : null}
                {clusteredComponents.length > 1 ? (
                  <span>
                    {clusteredComponents.length - 1} {strings.smallClusters}
                  </span>
                ) : null}
                <span>
                  {isolatedCount} {strings.isolated}
                </span>
              </div>
              <DataTable
                columns={componentColumns}
                rows={clusteredComponents.slice(0, 25)}
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
                {formatNumber(zones.length)} · {strings.rankedByRisk}
              </span>
            </div>
            <div className="p-4">
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {strings.emptyBody}
                </p>
              ) : (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {zones.map((zone) => (
                    <li
                      key={zone.hexId ?? zone.latitude}
                      className="flex flex-col gap-1.5 rounded-md border border-border bg-card/60 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-xs text-foreground">
                          {zone.locationNames?.join(", ") ?? zone.hexId}
                        </p>
                        {zone.riskBand ? (
                          <StatusPill
                            label={zone.riskBand}
                            tone={bandTone(zone.riskBand)}
                          />
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                        <span>{zone.riskScore?.toFixed(2)}</span>
                        <span>
                          {zone.evidenceCount ?? 0} {strings.evidenceCountLabel}
                        </span>
                        <span>
                          {zone.suspectCount ?? 0} {strings.suspectsLabel}
                        </span>
                      </div>
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
