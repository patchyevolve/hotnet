import {
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
import {
  formatCompactCurrency,
  formatCurrency,
  formatDateTime,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getMoneyFlow } from "@/lib/crimenet/services";
import type { MoneyFlow, MoneyTransaction } from "@/lib/crimenet/types";
import { Banknote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function MoneyTrailPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [flow, setFlow] = useState<MoneyFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [channel, setChannel] = useState("all");
  const [risk, setRisk] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getMoneyFlow().then((result) => {
      if (cancelled) return;
      setFlow(result);
      setSelectedId(result.transactions[0]?.id ?? null);
      setSelectedStageId(result.stages[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!flow) return [];
    return flow.transactions.filter(
      (tx) =>
        (channel === "all" || tx.channel === channel) &&
        (risk === "all" || tx.risk === risk),
    );
  }, [flow, channel, risk]);

  const selected =
    flow?.transactions.find((tx) => tx.id === selectedId) ?? null;

  const selectedStage =
    flow?.stages.find((stage) => stage.id === selectedStageId) ?? null;

  const columns: Column<MoneyTransaction>[] = [
    {
      key: "id",
      header: strings.txn,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "from",
      header: strings.from,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{row.fromName}</p>
          <p className="font-mono-id text-[11px] text-muted-foreground">
            {row.fromAccount}
          </p>
        </div>
      ),
    },
    {
      key: "to",
      header: strings.to,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{row.toName}</p>
          <p className="font-mono-id text-[11px] text-muted-foreground">
            {row.toAccount}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: strings.amount,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-foreground">
          {formatCurrency(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: "channel",
      header: strings.channel,
      render: (row) => (
        <span className="text-xs uppercase text-muted-foreground">
          {row.channel}
        </span>
      ),
    },
    {
      key: "occurred",
      header: strings.occurred,
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDateTime(row.occurredAt)}
        </span>
      ),
    },
    {
      key: "risk",
      header: strings.risk,
      render: (row) => <RiskBadge risk={row.risk} />,
    },
  ];

  return (
    <div data-ocid="money_trail.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.financialIntelligence}
        title={strings.moneyTrail}
        description={strings.moneyTrailDescription}
      />

      {loading || !flow ? (
        <div
          data-ocid="money_trail.loading_state"
          className="grid gap-4 sm:grid-cols-3"
        >
          {Array.from(
            { length: 3 },
            (_, index) => `money-skeleton-${index}`,
          ).map((id) => (
            <div
              key={id}
              className="panel h-[104px] animate-pulse bg-muted/20"
            />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label={strings.tracedAmount}
              value={flow.tracedLabel.replace(/^₹/, "₹")}
              delta="+₹42.6L this week"
              trend="up"
              tone="critical"
              series={[28, 31, 33, 36, 38, 40, 43]}
              index={0}
            />
            <MetricCard
              label={strings.accounts}
              value={String(flow.accounts.length)}
              delta="stable"
              trend="flat"
              tone="medium"
              series={[5, 5, 5, 5, 5, 5, 5]}
              index={1}
            />
            <MetricCard
              label={strings.transactions}
              value={String(flow.transactions.length)}
              delta="+3 this week"
              trend="up"
              tone="info"
              series={[5, 6, 6, 7, 7, 8, 8]}
              index={2}
            />
          </section>

          <section className="mt-5 panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.flowStages}
              </h2>
              <span className="text-xs text-muted-foreground">
                {strings.selectStage}
              </span>
            </div>
            <div className="scrollbar-thin overflow-x-auto p-4">
              <ol className="flex min-w-max items-stretch gap-2">
                {flow.stages.map((stage, index) => {
                  const active = stage.id === selectedStageId;
                  return (
                    <li key={stage.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        data-ocid={`money_trail.stage.${index + 1}`}
                        onClick={() => setSelectedStageId(stage.id)}
                        className={
                          active
                            ? "flex min-w-[9.5rem] flex-col gap-1 rounded-lg border border-info/50 bg-info/12 p-3 text-left transition-smooth"
                            : "flex min-w-[9.5rem] flex-col gap-1 rounded-lg border border-border bg-card/60 p-3 text-left transition-smooth hover:border-info/40"
                        }
                      >
                        <span className="label-caps text-muted-foreground">
                          {strings.stage} {index + 1}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {stage.label}
                        </span>
                        <span className="font-mono-id text-xs tabular-nums text-risk-medium">
                          {formatCompactCurrency(stage.amount)}
                        </span>
                        <RiskBadge risk={stage.risk} showDot={false} />
                      </button>
                      {index < flow.stages.length - 1 ? (
                        <span className="text-muted-foreground" aria-hidden>
                          →
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {selectedStage ? (
            <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    {selectedStage.label}
                  </h2>
                  <RiskBadge risk={selectedStage.risk} />
                </div>
                <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                  <DetailField
                    label={strings.amount}
                    value={formatCurrency(selectedStage.amount, "INR")}
                    mono
                  />
                  <DetailField
                    label={strings.timestamp}
                    value={formatDateTime(selectedStage.timestamp)}
                    mono
                  />
                  <DetailField
                    label={strings.transactionId}
                    value={selectedStage.transactionId}
                    mono
                  />
                  <DetailField
                    label={strings.linkedEntity}
                    value={selectedStage.linkedEntity}
                    mono
                  />
                </div>
                <div className="mt-4">
                  <p className="label-caps mb-2 text-muted-foreground">
                    {strings.suspiciousIndicators}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {selectedStage.indicators.map((indicator) => (
                      <li
                        key={indicator}
                        className="rounded-full border border-risk-high/40 bg-risk-high/10 px-2.5 py-0.5 text-[11px] text-risk-high"
                      >
                        {indicator}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    {strings.volumeByChannel}
                  </h2>
                </div>
                <ul className="flex flex-col divide-y divide-border/60">
                  {flow.byChannel.map((item) => (
                    <li
                      key={item.channel}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <span className="text-xs uppercase text-muted-foreground">
                        {item.channel}
                      </span>
                      <span className="font-mono-id text-xs tabular-nums text-foreground">
                        {formatCompactCurrency(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </>
      )}

      <div className="mt-5">
        <FilterBar
          filters={[
            {
              id: "channel",
              label: strings.channel,
              value: channel,
              onChange: setChannel,
              options: [
                { value: "all", label: strings.all },
                { value: "crypto", label: "Crypto" },
                { value: "neft", label: "NEFT" },
                { value: "imps", label: "IMPS" },
                { value: "upi", label: "UPI" },
                { value: "atm", label: "ATM" },
              ],
            },
            {
              id: "risk",
              label: strings.risk,
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
          ]}
          onReset={() => {
            setChannel("all");
            setRisk("all");
          }}
          resultCount={filtered.length}
          resultLabel={strings.transactions}
        />
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
              icon={<Banknote className="size-5" aria-hidden />}
              title={strings.emptyTitle}
              body={strings.emptyBody}
            />
          }
        />

        <DetailPanel
          title={selected ? selected.id : strings.noSelection}
          subtitle={
            selected ? `${selected.fromName} → ${selected.toName}` : undefined
          }
          badge={selected ? <RiskBadge risk={selected.risk} /> : undefined}
        >
          {selected ? (
            <>
              <DetailField
                label={strings.amount}
                value={formatCurrency(selected.amount, selected.currency)}
                mono
              />
              <DetailField
                label={strings.channel}
                value={
                  selected.channel ? selected.channel.toUpperCase() : "\u2014"
                }
              />
              <DetailField
                label={strings.occurred}
                value={formatDateTime(selected.occurredAt)}
                mono
              />
              <DetailField
                label={strings.from}
                value={`${selected.fromName} (${selected.fromAccount})`}
              />
              <DetailField
                label={strings.to}
                value={`${selected.toName} (${selected.toAccount})`}
              />
              <DetailField label={strings.note} value={selected.note} />
              <DetailField
                label={strings.flagged}
                value={selected.flagged ? "Yes" : "No"}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectTransaction}
            </p>
          )}
        </DetailPanel>
      </div>
    </div>
  );
}
