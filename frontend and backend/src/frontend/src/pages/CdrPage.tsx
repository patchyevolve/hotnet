import {
  BarSeries,
  type Column,
  DataTable,
  DetailField,
  DetailPanel,
  EmptyState,
  FilterBar,
  MetricCard,
  PageHeader,
  RiskBadge,
} from "@/components/crimenet";
import { formatDateTime, formatDuration } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getCdrRecords, getCdrSummary } from "@/lib/crimenet/services";
import type { CdrRecord, CdrSummary } from "@/lib/crimenet/types";
import { Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function CdrPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [records, setRecords] = useState<CdrRecord[]>([]);
  const [summary, setSummary] = useState<CdrSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [district, setDistrict] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getCdrRecords(), getCdrSummary()]).then(
      ([recordResult, summaryResult]) => {
        if (cancelled) return;
        setRecords(recordResult);
        setSummary(summaryResult);
        setSelectedId(recordResult[0]?.id ?? null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const districts = useMemo(
    () =>
      [...new Set(records.map((row) => row.district))]
        .filter((item): item is string => Boolean(item))
        .sort(),
    [records],
  );

  const filtered = useMemo(
    () =>
      records.filter(
        (row) =>
          (type === "all" || row.type === type) &&
          (district === "all" || row.district === district) &&
          (!flaggedOnly || row.flagged),
      ),
    [records, type, district, flaggedOnly],
  );

  const selected = records.find((row) => row.id === selectedId) ?? null;

  const columns: Column<CdrRecord>[] = [
    {
      key: "id",
      header: strings.record,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "caller",
      header: strings.caller,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono-id text-xs text-foreground">{row.caller}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.callerName}
          </p>
        </div>
      ),
    },
    {
      key: "callee",
      header: strings.callee,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono-id text-xs text-foreground">{row.callee}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.calleeName}
          </p>
        </div>
      ),
    },
    {
      key: "started",
      header: strings.started,
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDateTime(row.startedAt)}
        </span>
      ),
    },
    {
      key: "duration",
      header: strings.duration,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-foreground">
          {formatDuration(row.durationSec)}
        </span>
      ),
    },
    {
      key: "tower",
      header: strings.cellTower,
      render: (row) => (
        <span className="font-mono-id text-xs text-muted-foreground">
          {row.cellTower}
        </span>
      ),
    },
    {
      key: "type",
      header: strings.type,
      render: (row) => (
        <span className="text-xs uppercase text-muted-foreground">
          {row.type}
        </span>
      ),
    },
    {
      key: "flag",
      header: strings.flagged,
      align: "center",
      render: (row) =>
        row.flagged ? (
          <RiskBadge risk="high" label={strings.flagged} showDot={false} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div data-ocid="cdr.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.telecomAnalysis}
        title={strings.cdrTitle}
        description={strings.cdrDescriptionText}
      />

      {loading || !summary ? (
        <div
          data-ocid="cdr.loading_state"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, index) => `cdr-skeleton-${index}`).map(
            (id) => (
              <div
                key={id}
                className="panel h-[104px] animate-pulse bg-muted/20"
              />
            ),
          )}
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={strings.totalCallsLabel}
              value={summary.totalCalls.toLocaleString("en-IN")}
              delta="+12 this week"
              trend="up"
              tone="info"
              series={[6, 7, 8, 9, 10, 11, 12]}
              index={0}
            />
            <MetricCard
              label={strings.uniqueNumbersLabel}
              value={summary.uniqueNumbers.toLocaleString("en-IN")}
              delta="stable"
              trend="flat"
              tone="low"
              series={[5, 5, 6, 6, 6, 6, 6]}
              index={1}
            />
            <MetricCard
              label={strings.commonNumbers}
              value={String(summary.commonNumbers)}
              delta="+3 today"
              trend="up"
              tone="high"
              series={[3, 4, 4, 5, 6, 6, 7]}
              index={2}
            />
            <MetricCard
              label={strings.anomalies}
              value={String(summary.anomalies)}
              delta="+2 today"
              trend="up"
              tone="critical"
              series={[2, 3, 3, 4, 4, 5, 6]}
              index={3}
            />
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="panel xl:col-span-2">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.hourlyDistribution}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {strings.callsGroupedNote}
                </span>
              </div>
              <div className="p-4">
                <BarSeries
                  data={summary.hourly.map((item) => ({
                    label: item.hour,
                    value: item.count,
                  }))}
                  height={170}
                  tone="var(--accent-blue)"
                />
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.topContacts}
                </h2>
              </div>
              <ul className="flex flex-col divide-y divide-border/60">
                {summary.topContacts.map((contact) => (
                  <li
                    key={contact.number}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono-id text-xs text-foreground">
                        {contact.number}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {contact.name}
                      </p>
                    </div>
                    <span className="font-mono-id text-sm tabular-nums text-info">
                      {contact.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-5 panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.communicationTimeline}
              </h2>
              <span className="text-xs text-muted-foreground">
                {summary.timeline.length} {strings.keyEvents}
              </span>
            </div>
            <ol className="flex flex-col divide-y divide-border/60">
              {summary.timeline.map((entry, index) => (
                <li
                  key={entry.id}
                  data-ocid={`cdr.timeline_entry.${index + 1}`}
                  className="flex items-start gap-4 p-4"
                >
                  <span className="font-mono-id text-sm tabular-nums text-info">
                    {entry.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entry.label}
                    </p>
                    <p className="mt-0.5 font-mono-id text-[11px] text-muted-foreground">
                      {entry.detail}
                    </p>
                  </div>
                  <RiskBadge risk={entry.risk} showDot={false} />
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <div className="mt-5">
        <FilterBar
          filters={[
            {
              id: "type",
              label: strings.type,
              value: type,
              onChange: setType,
              options: [
                { value: "all", label: strings.all },
                { value: "voice", label: strings.typeVoice },
                { value: "sms", label: strings.typeSms },
                { value: "data", label: strings.typeData },
              ],
            },
            {
              id: "district",
              label: strings.district,
              value: district,
              onChange: setDistrict,
              options: [
                { value: "all", label: strings.all },
                ...districts.map((item) => ({ value: item, label: item })),
              ],
            },
          ]}
          onReset={() => {
            setType("all");
            setDistrict("all");
            setFlaggedOnly(false);
          }}
          resultCount={filtered.length}
          resultLabel={strings.recordsLabel}
        >
          <label className="flex items-center gap-2 self-center pt-4 text-xs text-muted-foreground">
            <input
              type="checkbox"
              data-ocid="cdr.flagged_checkbox"
              checked={flaggedOnly}
              onChange={(event) => setFlaggedOnly(event.target.checked)}
              className="size-3.5 accent-[var(--risk-high)]"
            />
            {strings.flaggedOnly}
          </label>
        </FilterBar>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          dense
          emptyState={
            <EmptyState
              icon={<Activity className="size-5" aria-hidden />}
              title={strings.emptyTitle}
              body={strings.emptyBody}
            />
          }
        />

        <DetailPanel
          title={selected ? selected.id : strings.noSelection}
          subtitle={
            selected ? `${selected.caller} → ${selected.callee}` : undefined
          }
          badge={
            selected?.flagged ? (
              <RiskBadge risk="high" label={strings.flagged} />
            ) : undefined
          }
        >
          {selected ? (
            <>
              <DetailField
                label={strings.caller}
                value={`${selected.callerName} (${selected.caller})`}
              />
              <DetailField
                label={strings.callee}
                value={`${selected.calleeName} (${selected.callee})`}
              />
              <DetailField
                label={strings.started}
                value={formatDateTime(selected.startedAt)}
                mono
              />
              <DetailField
                label={strings.duration}
                value={formatDuration(selected.durationSec)}
                mono
              />
              <DetailField
                label={strings.cellTower}
                value={selected.cellTower}
                mono
              />
              <DetailField label={strings.district} value={selected.district} />
              <DetailField
                label={strings.type}
                value={selected.type.toUpperCase()}
              />
              <DetailField
                label={strings.flagged}
                value={selected.flagged ? strings.yes : strings.no}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectRecord}
            </p>
          )}
        </DetailPanel>
      </div>
    </div>
  );
}
