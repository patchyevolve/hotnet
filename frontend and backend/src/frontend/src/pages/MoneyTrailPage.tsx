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
  StatusPill,
} from "@/components/crimenet";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getMoneyFlow } from "@/lib/crimenet/services";
import type {
  MoneyFlow,
  MoneySourceFile,
  MoneyTransaction,
} from "@/lib/crimenet/types";
import { Banknote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function shortHash(hash?: string): string {
  if (!hash) return "—";
  return hash.length > 26 ? `${hash.slice(0, 24)}…` : hash;
}

export function MoneyTrailPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [flow, setFlow] = useState<MoneyFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
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
    return flow.transactions.filter((tx) => risk === "all" || tx.risk === risk);
  }, [flow, risk]);

  const selected =
    flow?.transactions.find((tx) => tx.id === selectedId) ?? null;

  const selectedStage =
    flow?.stages.find((stage) => stage.id === selectedStageId) ?? null;

  const stageTransaction = useMemo(
    () =>
      selectedStage
        ? (flow?.transactions.find(
            (tx) => tx.id === selectedStage.transactionId,
          ) ?? null)
        : null,
    [flow, selectedStage],
  );

  const bankRecords = useMemo(() => {
    if (!flow) return 0;
    if (flow.ingestion?.bankRecords !== undefined) {
      return flow.ingestion.bankRecords;
    }
    return flow.sourceFiles.reduce((sum, row) => sum + (row.records ?? 0), 0);
  }, [flow]);

  /** Per-source-file volume — the backing that sums to the traced total. */
  const bySourceFile = useMemo(() => {
    if (!flow) return [];
    const totals = new Map<string, number>();
    for (const tx of flow.transactions) {
      const key = tx.sourceFile || "—";
      totals.set(key, (totals.get(key) ?? 0) + tx.amount);
    }
    return [...totals.entries()]
      .map(([file, amount]) => ({ file, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [flow]);

  const integrityPill = (value?: string) => {
    if (value === "verified") {
      return <StatusPill label={strings.integrityVerified} tone="success" />;
    }
    if (value === "tampered") {
      return <StatusPill label="Integrity Failed" tone="danger" />;
    }
    if (value) return <StatusPill label={value} tone="warning" />;
    return <span className="text-muted-foreground">—</span>;
  };

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
      key: "source",
      header: strings.sourceFile,
      render: (row) => (
        <span className="block max-w-[11rem] truncate font-mono-id text-[11px] text-muted-foreground">
          {row.sourceFile ?? "—"}
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

  const coverageColumns: Column<MoneySourceFile>[] = [
    {
      key: "file",
      header: strings.sourceFile,
      render: (row) => (
        <div className="min-w-0 max-w-[20rem]">
          <p className="truncate text-xs text-foreground">{row.file}</p>
          <p className="truncate font-mono-id text-[11px] text-muted-foreground">
            {shortHash(row.hash)}
          </p>
        </div>
      ),
    },
    {
      key: "records",
      header: strings.rowsUnit,
      align: "right",
      render: (row) => (
        <span className="tabular-nums">{row.records ?? "—"}</span>
      ),
    },
    {
      key: "transferCount",
      header: strings.transfersUnit,
      align: "right",
      render: (row) => (
        <span
          className={
            row.transferCount
              ? "tabular-nums text-foreground"
              : "tabular-nums text-muted-foreground"
          }
        >
          {row.transferCount ?? "—"}
        </span>
      ),
    },
    {
      key: "volume",
      header: strings.amount,
      align: "right",
      render: (row) =>
        row.transferCount ? (
          <span className="font-mono-id tabular-nums text-foreground">
            {formatCurrency(row.volume ?? 0)}
          </span>
        ) : (
          <span
            className="text-muted-foreground"
            aria-label={strings.noMatchedTransfers}
          >
            —
          </span>
        ),
    },
    {
      key: "quality",
      header: strings.quality,
      align: "right",
      render: (row) =>
        row.qualityScore === undefined ? (
          "—"
        ) : (
          <span className="tabular-nums">
            {formatPercent(row.qualityScore * 100, 1)}
          </span>
        ),
    },
    {
      key: "integrity",
      header: strings.integrity,
      render: (row) => integrityPill(row.integrity),
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
              value={formatCurrency(flow.totalVolume)}
              delta={`${flow.transactions.length} ${strings.transfersUnit}`}
              trend="flat"
              tone="critical"
              series={flow.stages.map((stage) => stage.amount)}
              index={0}
            />
            <MetricCard
              label={strings.sourceFiles}
              value={String(flow.sourceFiles.length)}
              delta={`${bankRecords} ${strings.rowsUnit}`}
              trend="flat"
              tone="medium"
              series={flow.sourceFiles.map((row) => row.transferCount ?? 0)}
              index={1}
            />
            <MetricCard
              label={strings.transactions}
              value={String(flow.transactions.length)}
              delta=""
              trend="flat"
              tone="info"
              series={flow.transactions.map((tx) => tx.amount)}
              index={2}
            />
          </section>

          <section data-ocid="money_trail.coverage" className="mt-5 panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.sourceCoverage}
              </h2>
              <span className="font-mono-id text-xs text-muted-foreground">
                {flow.ingestion?.bankFiles ?? flow.sourceFiles.length}{" "}
                {strings.filesUnit} · {bankRecords} {strings.rowsUnit}
                {flow.ingestion?.runId ? ` · ${flow.ingestion.runId}` : ""}
              </span>
            </div>
            <div className="p-4">
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {strings.sourceCoverageNote}
              </p>
              <DataTable
                columns={coverageColumns}
                rows={flow.sourceFiles}
                rowKey={(row) => row.file}
                dense
                emptyState={
                  <EmptyState
                    icon={<Banknote className="size-5" aria-hidden />}
                    title={strings.emptyTitle}
                    body={strings.emptyBody}
                  />
                }
              />
              {flow.sourceFiles.some((row) => !row.transferCount) ? (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {strings.coverageZeroNote}
                </p>
              ) : null}
            </div>
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
                    label={strings.sourceFile}
                    value={stageTransaction?.sourceFile ?? "—"}
                    mono
                  />
                  <DetailField
                    label={strings.description}
                    value={stageTransaction?.description ?? "—"}
                  />
                  <DetailField
                    label={strings.linkedEntity}
                    value={selectedStage.linkedEntity}
                    mono
                  />
                </div>
                <div className="mt-4">
                  <p className="label-caps mb-2 text-muted-foreground">
                    {selectedStage.indicators.length > 0
                      ? strings.suspiciousIndicators
                      : strings.extraction}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {selectedStage.indicators.length > 0 ? (
                      selectedStage.indicators.map((indicator) => (
                        <li
                          key={indicator}
                          className="rounded-full border border-risk-high/40 bg-risk-high/10 px-2.5 py-0.5 text-[11px] text-risk-high"
                        >
                          {indicator}
                        </li>
                      ))
                    ) : (
                      <>
                        {stageTransaction?.extractionConfidence !==
                        undefined ? (
                          <li className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground">
                            {formatPercent(
                              stageTransaction.extractionConfidence * 100,
                              0,
                            )}
                          </li>
                        ) : null}
                        {(stageTransaction?.extractionBasis ?? []).map(
                          (basis) => (
                            <li
                              key={basis}
                              className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-foreground"
                            >
                              {basis}
                            </li>
                          ),
                        )}
                        {stageTransaction?.sourceIntegrity ? (
                          <li>
                            {integrityPill(stageTransaction.sourceIntegrity)}
                          </li>
                        ) : null}
                      </>
                    )}
                  </ul>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    {strings.volumeByFile}
                  </h2>
                </div>
                {bySourceFile.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border/60">
                    {bySourceFile.map((item) => (
                      <li
                        key={item.file}
                        className="flex items-center justify-between gap-3 p-3"
                      >
                        <span className="min-w-0 truncate font-mono-id text-[11px] text-muted-foreground">
                          {item.file}
                        </span>
                        <span className="font-mono-id text-xs tabular-nums text-foreground">
                          {formatCompactCurrency(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    {strings.emptyBody}
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}

      <div className="mt-5">
        <FilterBar
          filters={[
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
              <DetailField
                label={strings.description}
                value={selected.description ?? selected.note ?? "—"}
              />
              <DetailField
                label={strings.sourceFile}
                value={selected.sourceFile ?? "—"}
                mono
              />
              <DetailField
                label={strings.hash}
                value={shortHash(selected.sourceHash)}
                mono
              />
              <DetailField
                label={strings.integrity}
                value={
                  selected.sourceIntegrity
                    ? selected.sourceIntegrity.charAt(0).toUpperCase() +
                      selected.sourceIntegrity.slice(1)
                    : "—"
                }
              />
              <DetailField
                label={strings.extraction}
                value={
                  selected.extractionConfidence === undefined
                    ? "—"
                    : `${formatPercent(selected.extractionConfidence * 100, 0)}${
                        selected.extractionBasis?.length
                          ? ` · ${selected.extractionBasis.join(", ")}`
                          : ""
                      }`
                }
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
