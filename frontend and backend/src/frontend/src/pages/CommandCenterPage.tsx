import {
  DonutChart,
  MetricCard,
  PageHeader,
  RiskBadge,
  StatusPill,
  Timeline,
} from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelative, humanizeAction } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { roleLabels, useRole } from "@/lib/crimenet/role-context";
import {
  getActivity,
  getCases,
  getCommandCenterMetrics,
  getDashboard,
  getIntelligenceFeed,
  getSystemStatus,
  getTimeline,
} from "@/lib/crimenet/services";
import type {
  CaseActivityBundle,
  CaseRecord,
  DashboardData,
  DashboardMetric,
  IntelligenceFeedEvent,
  SystemStatus,
  TimelineEvent,
} from "@/lib/crimenet/types";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowRight, RefreshCw, Zap } from "lucide-react";
import { useEffect, useState } from "react";

const NETWORK_REFRESH_MS = 30_000;

function clockOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour12: false });
}

export function CommandCenterPage() {
  const { role, language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [feed, setFeed] = useState<IntelligenceFeedEvent[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activity, setActivity] = useState<CaseActivityBundle | null>(null);
  const [networkEvents, setNetworkEvents] = useState<TimelineEvent[]>([]);
  const [networkUpdatedAt, setNetworkUpdatedAt] = useState<string>("");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  // null = default scope not chosen yet (wait for the case list); "" = all cases.
  const [scope, setScope] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pick the default scope once the case list is known: the first registered
  // case, so the header always names the case this overview describes.
  useEffect(() => {
    if (scope !== null) return;
    let cancelled = false;
    void getCases().then((rows) => {
      if (cancelled) return;
      setCases(rows);
      setScope(rows[0]?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (scope === null) return;
    // Read so the manual Refresh button (refreshTick++) reloads this effect.
    void refreshTick;
    let cancelled = false;
    setLoading(true);
    const caseId = scope || undefined;
    void Promise.all([
      getDashboard(role, caseId),
      getCommandCenterMetrics(caseId),
      getIntelligenceFeed(caseId),
      getActivity(caseId),
      getTimeline(caseId),
      getSystemStatus(),
      getCases(),
    ]).then(
      ([
        dashboardResult,
        metricResult,
        feedResult,
        activityResult,
        timelineResult,
        statusResult,
        caseResult,
      ]) => {
        if (cancelled) return;
        setData(dashboardResult);
        setMetrics(metricResult);
        setFeed(feedResult);
        setActivity(activityResult);
        setNetworkEvents(timelineResult);
        setStatus(statusResult);
        setCases(caseResult);
        setNetworkUpdatedAt(new Date().toISOString());
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [role, scope, refreshTick]);

  // Network Activity is live: poll the case timeline while the page is open.
  useEffect(() => {
    if (scope === null) return;
    const timer = window.setInterval(() => {
      void getTimeline(scope || undefined).then((events) => {
        setNetworkEvents(events);
        setNetworkUpdatedAt(new Date().toISOString());
      });
    }, NETWORK_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [scope]);

  const activeCases = cases.filter(
    (item) => item.status === "active" || item.status === "open",
  );

  const scopeLabel =
    scope === null || scope === ""
      ? strings.scopeAllCases
      : (() => {
          const record = cases.find((item) => item.id === scope);
          return record ? `${record.id} · ${record.title}` : scope;
        })();

  // ADMIN keeps the global platform metrics (the required 128 / 5,284 /
  // 52,641 / 47 figures); every other demo role sees its own role-scoped
  // metric set from the dashboard payload.
  const displayMetrics =
    role === "ADMIN" ? metrics : (data?.metrics ?? metrics);

  const activityEntries = activity?.entries ?? [];
  const riskTotal = (data?.riskBreakdown ?? []).reduce(
    (sum, item) => sum + item.value,
    0,
  );

  return (
    <div data-ocid="command_center.page" className="flex flex-col">
      <PageHeader
        eyebrow={`${strings.role}: ${roleLabels[role]}`}
        title={strings.commandCenter}
        description={strings.commandCenterSubtitle}
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={scope === "" || scope === null ? "all" : scope}
              onValueChange={(value) => setScope(value === "all" ? "" : value)}
            >
              <SelectTrigger
                data-ocid="command_center.scope_select"
                aria-label={strings.scopeLabel}
                className="h-8 w-[240px] text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{strings.scopeAllCases}</SelectItem>
                {cases.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {`${item.id} · ${item.title}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-ocid="command_center.refresh_button"
              onClick={() => setRefreshTick((tick) => tick + 1)}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {strings.refresh}
            </Button>
          </div>
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
              <ul className="scrollbar-thin flex max-h-[calc(100vh-21rem)] flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain">
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
              <ul className="scrollbar-thin flex max-h-[calc(100vh-21rem)] flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain">
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
                        onClick={() => {
                          if (event.insightId) {
                            void navigate({
                              to: "/ai-investigator",
                              search: { insight: event.insightId },
                            });
                          } else {
                            void navigate({ to: event.route });
                          }
                        }}
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
                <span
                  data-ocid="command_center.scope_label"
                  className="max-w-[10rem] truncate text-xs text-muted-foreground"
                  title={scopeLabel}
                >
                  {`${strings.scopeLabel}: ${scopeLabel}`}
                </span>
              </div>
              <div className="p-4">
                <DonutChart
                  data={data.riskBreakdown}
                  centerLabel={strings.entitiesCenterLabel}
                  centerValue={String(riskTotal)}
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
                {activity ? (
                  <span
                    data-ocid="command_center.chain_badge"
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <StatusPill
                      label={
                        activity.chainValid
                          ? strings.chainVerified
                          : strings.degraded
                      }
                      tone={activity.chainValid ? "success" : "danger"}
                    />
                    <span className="font-mono-id">
                      {activity.chainLength + activity.pipelineEvents}
                    </span>
                  </span>
                ) : null}
              </div>
              <ul className="scrollbar-thin flex max-h-[320px] flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain">
                {activityEntries.length > 0 ? (
                  activityEntries.slice(0, 60).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">
                          {humanizeAction(row.action)}
                        </p>
                        <p className="font-mono-id truncate text-[11px] text-muted-foreground">
                          {[
                            row.source === "activity"
                              ? row.actorName || row.actorId
                              : row.actor,
                            scope === "" ? row.caseId : undefined,
                            row.target,
                            row.detail,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono-id text-[10px] text-muted-foreground">
                          {row.at.slice(0, 16).replace("T", " ")}
                        </span>
                        {row.hash ? (
                          <span
                            title={`${row.prevHash || "genesis"} → ${row.hash}`}
                            className="font-mono-id text-[10px] text-risk-low"
                          >
                            {`#${row.seq ?? ""}`}
                          </span>
                        ) : row.seq ? (
                          <span className="font-mono-id text-[10px] text-muted-foreground">
                            {`#${row.seq}`}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="p-4 text-sm text-muted-foreground">
                    {strings.caseActivityEmpty}
                  </li>
                )}
              </ul>
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
                <span className="flex items-center gap-2">
                  <span data-ocid="command_center.live_badge">
                    <StatusPill label={strings.liveLabel} tone="info" pulse />
                  </span>
                  <span
                    data-ocid="command_center.network_updated"
                    className="font-mono-id text-[10px] text-muted-foreground"
                  >
                    {networkUpdatedAt ? clockOf(networkUpdatedAt) : "—"}
                  </span>
                </span>
              </div>
              <div className="p-4">
                {networkEvents.length > 0 ? (
                  <Timeline events={networkEvents.slice(0, 8)} compact />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {strings.networkActivityEmpty}
                  </p>
                )}
              </div>
            </div>

            <div data-ocid="command_center.status_panel" className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.systemStatus}
                </h2>
                <span className="font-mono-id text-[10px] text-muted-foreground">
                  {status?.checkedAt
                    ? `${strings.checkedLabel} ${clockOf(status.checkedAt)}`
                    : ""}
                </span>
              </div>
              <ul className="flex flex-col gap-3 p-4">
                {status && status.services.length > 0 ? (
                  status.services.map((service) => (
                    <li
                      key={service.id}
                      data-ocid={`command_center.service.${service.id}`}
                      className="flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                          {service.label}
                        </span>
                        <StatusPill
                          label={
                            service.status === "operational"
                              ? strings.operational
                              : strings.degraded
                          }
                          tone={
                            service.status === "operational"
                              ? "success"
                              : "warning"
                          }
                        />
                      </div>
                      <p className="font-mono-id text-[10px] leading-relaxed text-muted-foreground/80">
                        {service.detail}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">—</li>
                )}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
