import {
  BarSeries,
  DonutChart,
  MetricCard,
  PageHeader,
  RiskBadge,
  StatusPill,
  Timeline,
} from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import {
  roleDescriptions,
  roleLabels,
  useRole,
} from "@/lib/crimenet/role-context";
import {
  getCases,
  getCommandCenterMetrics,
  getDashboard,
  getIntelligenceFeed,
} from "@/lib/crimenet/services";
import type {
  CaseRecord,
  DashboardData,
  DashboardMetric,
  IntelligenceFeedEvent,
} from "@/lib/crimenet/types";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowRight, RefreshCw, Zap } from "lucide-react";
import { useEffect, useState } from "react";

export function CommandCenterPage() {
  const { role, language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [feed, setFeed] = useState<IntelligenceFeedEvent[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getDashboard(role),
      getCommandCenterMetrics(),
      getIntelligenceFeed(),
      getCases(),
    ]).then(([dashboardResult, metricResult, feedResult, caseResult]) => {
      if (cancelled) return;
      setData(dashboardResult);
      setMetrics(metricResult);
      setFeed(feedResult);
      setCases(caseResult);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const refresh = () => {
    setLoading(true);
    void Promise.all([
      getDashboard(role),
      getCommandCenterMetrics(),
      getIntelligenceFeed(),
      getCases(),
    ]).then(([dashboardResult, metricResult, feedResult, caseResult]) => {
      setData(dashboardResult);
      setMetrics(metricResult);
      setFeed(feedResult);
      setCases(caseResult);
      setLoading(false);
    });
  };

  const activeCases = cases.filter(
    (item) => item.status === "active" || item.status === "open",
  );

  // ADMIN keeps the global platform metrics (the required 128 / 5,284 /
  // 52,641 / 47 figures); every other demo role sees its own role-scoped
  // metric set from the dashboard payload.
  const displayMetrics =
    role === "ADMIN" ? metrics : (data?.metrics ?? metrics);

  return (
    <div data-ocid="command_center.page" className="flex flex-col">
      <PageHeader
        eyebrow={`${strings.demoRole}: ${roleLabels[role]}`}
        title={strings.commandCenter}
        description={strings.commandCenterSubtitle}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="command_center.refresh_button"
            onClick={refresh}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {strings.refresh}
          </Button>
        }
      />

      {loading || !data ? (
        <div
          data-ocid="command_center.loading_state"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from(
            { length: 4 },
            (_, index) => `metric-skeleton-${index}`,
          ).map((id) => (
            <div
              key={id}
              className="panel h-[104px] animate-pulse bg-muted/20"
            />
          ))}
        </div>
      ) : (
        <>
          <section
            data-ocid="command_center.metrics_section"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {displayMetrics.map((metric, index) => (
              <MetricCard
                key={metric.id}
                label={metric.label}
                value={metric.value}
                delta={metric.delta}
                trend={metric.trend}
                tone={metric.tone}
                series={metric.series}
                index={index}
              />
            ))}
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <div
              data-ocid="command_center.investigations_panel"
              className="panel xl:col-span-2"
            >
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.activeInvestigations}
                </h2>
                <Link
                  to="/cases"
                  data-ocid="command_center.view_cases_link"
                  className="flex items-center gap-1 text-xs text-info transition-smooth hover:underline"
                >
                  {strings.viewAll}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
              <ul className="flex flex-col divide-y divide-border/60">
                {activeCases.map((item, index) => (
                  <li key={item.id}>
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: item.id }}
                      data-ocid={`command_center.investigation.${index + 1}`}
                      className="flex flex-col gap-1.5 p-4 transition-smooth hover:bg-muted/30"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono-id text-xs text-info">
                          {item.id}
                        </span>
                        <RiskBadge risk={item.risk} />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="font-mono-id text-[11px] text-muted-foreground">
                        {`${item.entityIds.length} ${strings.entitiesMetric} · ${item.evidenceCount} ${strings.evidence} · ${item.linkedCaseIds.length} ${strings.linkedCasesMetric}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div data-ocid="command_center.feed_panel" className="panel">
              <div className="panel-header">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                  <Zap className="size-4 text-risk-medium" aria-hidden />
                  {strings.liveIntelligenceFeed}
                </h2>
              </div>
              <ul className="flex flex-col divide-y divide-border/60">
                {feed.map((event, index) => (
                  <li
                    key={event.id}
                    data-ocid={`command_center.feed_event.${index + 1}`}
                    className="flex flex-col gap-1.5 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {event.title}
                      </p>
                      <RiskBadge risk={event.severity} showDot={false} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.detail}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-id text-[10px] text-muted-foreground">
                        {formatRelative(event.at)}
                      </span>
                      <button
                        type="button"
                        data-ocid={`command_center.feed_action.${index + 1}`}
                        onClick={() => void navigate({ to: event.route })}
                        className="text-[11px] text-info transition-smooth hover:underline"
                      >
                        {event.actionLabel}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <div
              data-ocid="command_center.risk_panel"
              className="panel xl:col-span-1"
            >
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.riskDistribution}
                </h2>
              </div>
              <div className="p-4">
                <DonutChart
                  data={data.riskBreakdown}
                  centerLabel="cases"
                  centerValue={String(
                    data.riskBreakdown.reduce(
                      (sum, item) => sum + item.value,
                      0,
                    ),
                  )}
                />
              </div>
            </div>

            <div
              data-ocid="command_center.trend_panel"
              className="panel xl:col-span-2"
            >
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.caseActivity}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {data.widgets[1]?.description}
                </span>
              </div>
              <div className="p-4">
                <BarSeries data={data.caseTrend} height={180} />
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <div
              data-ocid="command_center.activity_panel"
              className="panel xl:col-span-2"
            >
              <div className="panel-header">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                  <Activity className="size-4 text-info" aria-hidden />
                  {strings.networkActivity}
                </h2>
              </div>
              <div className="p-4">
                <Timeline events={data.recentActivity} compact />
              </div>
            </div>

            <div data-ocid="command_center.status_panel" className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.systemStatus}
                </h2>
              </div>
              <ul className="flex flex-col gap-3 p-4">
                {[
                  "Case Registry",
                  "Network Analysis",
                  "CDR Ingestion",
                  "Financial Analytics",
                  "Evidence Vault",
                ].map((service) => (
                  <li
                    key={service}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-muted-foreground">
                      {service}
                    </span>
                    <StatusPill label={strings.operational} tone="success" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
