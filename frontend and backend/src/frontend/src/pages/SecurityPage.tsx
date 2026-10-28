import {
  AuditChain,
  type Column,
  DataTable,
  DetailField,
  DetailPanel,
  EmptyState,
  FilterBar,
  MetricCard,
  PageHeader,
  RiskBadge,
  StatusPill,
} from "@/components/crimenet";
import { formatDateTime } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { roleLabels, useRole } from "@/lib/crimenet/role-context";
import { getAuditEvents, getFaceRecords } from "@/lib/crimenet/services";
import type { AuditEvent, FaceRecord } from "@/lib/crimenet/types";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** Human-readable label for a pipeline action id (`multi_fir_started`). */
function humanizeAction(action: string): string {
  return action.replace(/_/g, " ");
}

export function SecurityPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [faces, setFaces] = useState<FaceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAuditEvents(), getFaceRecords()]).then(
      ([eventResult, faceResult]) => {
        if (cancelled) return;
        setEvents(eventResult);
        setFaces(faceResult);
        setSelectedId(eventResult[0]?.id ?? null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Audit events bucketed per distinct minute — a real activity shape. */
  const eventsPerMinute = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const event of events) {
      const key = event.at.slice(11, 16);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, count]) => count);
  }, [events]);

  const highSeverityEvents = useMemo(
    () =>
      events.filter(
        (row) => row.severity === "critical" || row.severity === "high",
      ),
    [events],
  );

  /** Matches still awaiting an investigator confirm/reject decision. */
  const pendingApprovals = useMemo(
    () =>
      faces.filter(
        (row) =>
          row.matchStatus === "probable" || row.matchStatus === "unverified",
      ),
    [faces],
  );

  const highRiskActors = useMemo(
    () => new Set(highSeverityEvents.map((row) => row.actor)).size,
    [highSeverityEvents],
  );

  const recentEvents = useMemo(
    () => [...events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
    [events],
  );

  const filtered = useMemo(
    () =>
      events.filter(
        (row) =>
          (role === "all" || row.role === role) &&
          (severity === "all" || row.severity === severity),
      ),
    [events, role, severity],
  );

  const selected = events.find((row) => row.id === selectedId) ?? null;

  const columns: Column<AuditEvent>[] = [
    {
      key: "id",
      header: strings.event,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "action",
      header: strings.action,
      render: (row) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate text-sm text-foreground">{row.action}</p>
          <p className="truncate font-mono-id text-[11px] text-muted-foreground">
            {row.target}
          </p>
        </div>
      ),
    },
    {
      key: "actor",
      header: strings.actor,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{row.actor}</p>
          {row.role ? (
            <p className="text-[11px] text-muted-foreground">
              {roleLabels[row.role]}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "ip",
      header: strings.ipHeader,
      render: (row) => (
        <span className="font-mono-id text-xs text-muted-foreground">
          {row.ip ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "at",
      header: strings.timestamp,
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDateTime(row.at)}
        </span>
      ),
    },
    {
      key: "severity",
      header: strings.severity,
      render: (row) => <RiskBadge risk={row.severity} />,
    },
  ];

  return (
    <div data-ocid="security.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.integrityAccess}
        title={strings.securityTitle}
        description={strings.securityDescriptionText}
        actions={
          <StatusPill label={strings.chainVerifiedLabel} tone="success" pulse />
        }
      />

      {loading ? (
        <div
          data-ocid="security.loading_state"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from(
            { length: 4 },
            (_, index) => `security-skeleton-${index}`,
          ).map((id) => (
            <div
              key={id}
              className="panel h-[104px] animate-pulse bg-muted/20"
            />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={strings.auditEvents}
            value={String(events.length)}
            delta=""
            trend="flat"
            tone="info"
            series={eventsPerMinute}
            index={0}
          />
          <MetricCard
            label={strings.pendingApprovals}
            value={String(pendingApprovals.length)}
            delta=""
            trend="flat"
            tone="medium"
            series={[pendingApprovals.length]}
            index={1}
          />
          <MetricCard
            label={strings.securityAlerts}
            value={String(highSeverityEvents.length)}
            delta=""
            trend="flat"
            tone="high"
            series={[highSeverityEvents.length]}
            index={2}
          />
          <MetricCard
            label={strings.highRiskUsers}
            value={String(highRiskActors)}
            delta=""
            trend="flat"
            tone="critical"
            series={[highRiskActors]}
            index={3}
          />
        </section>
      )}

      <div className="mt-5">
        <FilterBar
          filters={[
            {
              id: "role",
              label: strings.role,
              value: role,
              onChange: setRole,
              options: [
                { value: "all", label: strings.all },
                { value: "INSPECTOR", label: strings.roleInspector },
                { value: "SUPERVISOR", label: strings.roleSupervisor },
                { value: "ADMIN", label: strings.roleAdmin },
                { value: "AUDIT_LOGGER", label: strings.roleAuditLogger },
              ],
            },
            {
              id: "severity",
              label: strings.severity,
              value: severity,
              onChange: setSeverity,
              options: [
                { value: "all", label: strings.all },
                { value: "critical", label: strings.riskCritical },
                { value: "high", label: strings.riskHigh },
                { value: "medium", label: strings.riskMedium },
                { value: "low", label: strings.riskLow },
              ],
            },
          ]}
          onReset={() => {
            setRole("all");
            setSeverity("all");
          }}
          resultCount={filtered.length}
          resultLabel={strings.eventsLabel}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          dense
          emptyState={
            <EmptyState
              icon={<ShieldCheck className="size-5" aria-hidden />}
              title={strings.emptyTitle}
              body={strings.emptyBody}
            />
          }
        />

        <DetailPanel
          title={selected ? selected.action : strings.noSelection}
          subtitle={selected?.id}
          badge={selected ? <RiskBadge risk={selected.severity} /> : undefined}
        >
          {selected ? (
            <>
              <DetailField label={strings.actor} value={selected.actor} />
              <DetailField
                label={strings.role}
                value={selected.role ? roleLabels[selected.role] : "\u2014"}
              />
              <DetailField
                label={strings.target}
                value={selected.target}
                mono
              />
              <DetailField
                label={strings.ipAddress}
                value={selected.ip ?? "\u2014"}
                mono
              />
              <DetailField
                label={strings.timestamp}
                value={formatDateTime(selected.at)}
                mono
              />
              {selected.hash ? (
                <DetailField label={strings.hash} value={selected.hash} mono />
              ) : null}
              {selected.prevHash ? (
                <DetailField
                  label={strings.previousHash}
                  value={selected.prevHash}
                  mono
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectAuditEvent}
            </p>
          )}
        </DetailPanel>
      </div>

      <section className="mt-5 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.auditTimeline}
          </h2>
          <span className="text-xs text-muted-foreground">
            {strings.auditTimelineNote}
          </span>
        </div>
        <ol className="flex flex-col divide-y divide-border/60">
          {recentEvents.map((event, index) => (
            <li
              key={event.id}
              data-ocid={`security.audit_timeline.${index + 1}`}
              className="flex items-start gap-4 p-4"
            >
              <span className="font-mono-id text-sm tabular-nums text-info">
                {event.at.slice(11, 16)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {humanizeAction(event.action)}
                </p>
                <p className="mt-0.5 font-mono-id text-[11px] text-muted-foreground">
                  {[event.actor, event.target].filter(Boolean).join(" · ")}
                </p>
              </div>
              <RiskBadge risk={event.severity} showDot={false} />
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-5 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.chainTitle}
          </h2>
          <StatusPill label={strings.integrityVerified} tone="success" />
        </div>
        <div className="scrollbar-thin overflow-x-auto p-4">
          <ol className="flex min-w-max items-center gap-2">
            {events.map((event, index) => (
              <li key={event.id} className="flex items-center gap-2">
                <div
                  data-ocid={`security.block.${index + 1}`}
                  className="flex min-w-[8.5rem] flex-col gap-1 rounded-lg border border-risk-low/40 bg-risk-low/8 p-3"
                >
                  <span className="font-mono-id text-xs text-risk-low">
                    {strings.block} {String(index + 1).padStart(3, "0")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {event.id}
                  </span>
                </div>
                {index < events.length - 1 ? (
                  <span className="text-muted-foreground" aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-5 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.auditChainHeading}
          </h2>
          <span className="text-xs text-muted-foreground">
            {strings.chainVerifiedDetail}
          </span>
        </div>
        <div className="p-4">
          <AuditChain events={events} />
        </div>
      </section>
    </div>
  );
}
