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
import { getAuditEvents } from "@/lib/crimenet/services";
import type { AuditEvent } from "@/lib/crimenet/types";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const auditTimeline = [
  {
    time: "14:02",
    labelKey: "auditInspectorAccessedCase" as const,
    risk: "low" as const,
  },
  {
    time: "13:57",
    labelKey: "auditCrossStationSearch" as const,
    risk: "medium" as const,
  },
  {
    time: "13:41",
    labelKey: "auditEvidenceIntegrityVerified" as const,
    risk: "low" as const,
  },
  {
    time: "13:26",
    labelKey: "auditExportAttemptBlocked" as const,
    risk: "high" as const,
  },
];

const auditBlocks = [
  "AU-1001 · f1a9c3e7",
  "AU-1002 · a3d7f1b9",
  "AU-1003 · c5e2a8d1",
  "AU-1004 · 7b4f0c6e",
];

export function SecurityPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getAuditEvents().then((result) => {
      if (cancelled) return;
      setEvents(result);
      setSelectedId(result[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            delta="+112 today"
            trend="up"
            tone="info"
            series={[4, 5, 5, 6, 7, 7, 8]}
            index={0}
          />
          <MetricCard
            label={strings.pendingApprovals}
            value="7"
            delta="+2 today"
            trend="up"
            tone="medium"
            series={[3, 4, 4, 5, 6, 6, 7]}
            index={1}
          />
          <MetricCard
            label={strings.securityAlerts}
            value={String(
              events.filter(
                (row) => row.severity === "critical" || row.severity === "high",
              ).length,
            )}
            delta="+2 today"
            trend="up"
            tone="high"
            series={[1, 1, 2, 2, 2, 3, 3]}
            index={2}
          />
          <MetricCard
            label={strings.highRiskUsers}
            value="3"
            delta="stable"
            trend="flat"
            tone="critical"
            series={[3, 3, 3, 3, 3, 3, 3]}
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
          {auditTimeline.map((entry, index) => (
            <li
              key={entry.time}
              data-ocid={`security.audit_timeline.${index + 1}`}
              className="flex items-start gap-4 p-4"
            >
              <span className="font-mono-id text-sm tabular-nums text-info">
                {entry.time}
              </span>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                {strings[entry.labelKey]}
              </p>
              <RiskBadge risk={entry.risk} showDot={false} />
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
            {auditBlocks.map((block, index) => (
              <li key={block} className="flex items-center gap-2">
                <div
                  data-ocid={`security.block.${index + 1}`}
                  className="flex min-w-[8.5rem] flex-col gap-1 rounded-lg border border-risk-low/40 bg-risk-low/8 p-3"
                >
                  <span className="font-mono-id text-xs text-risk-low">
                    {strings.block} {String(index + 1).padStart(3, "0")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {block}
                  </span>
                </div>
                {index < auditBlocks.length - 1 ? (
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
