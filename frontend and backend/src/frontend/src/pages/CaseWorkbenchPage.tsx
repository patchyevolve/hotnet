import {
  ChainOfCustody,
  type Column,
  DataTable,
  DetailField,
  EmptyState,
  EvidenceIntegrity,
  GraphCanvas,
  PageHeader,
  RiskBadge,
  StatusPill,
  Timeline,
} from "@/components/crimenet";
import { openEntityDrawer } from "@/components/crimenet/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  casePriorityLabels,
  caseStatusLabels,
  entityKindLabels,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  getCase,
  getCaseCdr,
  getCdrSummary,
  getCustodyEvents,
  getEntities,
  getEvidence,
  getMoneyFlow,
  getNetworkGraph,
  getTimeline,
} from "@/lib/crimenet/services";
import type {
  CaseRecord,
  CdrRecord,
  CdrSummary,
  CustodyEvent,
  EntityRecord,
  EvidenceRecord,
  MoneyFlow,
  NetworkGraph,
  TimelineEvent,
} from "@/lib/crimenet/types";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText, Network, Users } from "lucide-react";
import { useEffect, useState } from "react";

export function CaseWorkbenchPage() {
  const { caseId } = useParams({ from: "/cases/$caseId" });
  const { language } = useRole();
  const strings = getStrings(language);

  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [custody, setCustody] = useState<CustodyEvent[]>([]);
  const [caseCdr, setCaseCdr] = useState<CdrRecord[]>([]);
  const [cdrSummary, setCdrSummary] = useState<CdrSummary | null>(null);
  const [moneyFlow, setMoneyFlow] = useState<MoneyFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getCase(caseId),
      getEntities(),
      getNetworkGraph(caseId),
      getTimeline(),
      getEvidence(),
      getCustodyEvents(),
      getCaseCdr(caseId),
      getCdrSummary(caseId),
      getMoneyFlow(caseId),
    ]).then(
      ([
        caseResult,
        entityResult,
        graphResult,
        timelineResult,
        evidenceResult,
        custodyResult,
        cdrResult,
        cdrSummaryResult,
        moneyFlowResult,
      ]) => {
        if (cancelled) return;
        setRecord(caseResult);
        setEntities(entityResult);
        setGraph(graphResult);
        setTimeline(timelineResult);
        setEvidence(evidenceResult);
        setCustody(custodyResult);
        setCaseCdr(cdrResult);
        setCdrSummary(cdrSummaryResult);
        setMoneyFlow(moneyFlowResult);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) {
    return (
      <div
        data-ocid="case_workbench.loading_state"
        className="flex flex-col gap-4"
      >
        <div className="panel h-24 animate-pulse bg-muted/20" />
        <div className="panel h-96 animate-pulse bg-muted/20" />
      </div>
    );
  }

  if (!record) {
    return (
      <EmptyState
        title={strings.caseNotFound}
        body={`No case record exists for ${caseId}.`}
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/cases" data-ocid="case_workbench.back_link">
              {strings.backToCases}
            </Link>
          </Button>
        }
      />
    );
  }

  const caseEntities = entities.filter((entity) =>
    record.entityIds.includes(entity.id),
  );
  const caseEvidence = evidence.filter((item) => item.caseId === record.id);
  const caseCustody = custody.filter((event) =>
    caseEvidence.some((item) => item.id === event.evidenceId),
  );

  const entityColumns: Column<EntityRecord>[] = [
    {
      key: "id",
      header: strings.entityId,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "name",
      header: strings.name,
      render: (row) => (
        <span className="text-sm text-foreground">{row.name}</span>
      ),
    },
    {
      key: "kind",
      header: strings.type,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {entityKindLabels[row.kind]}
        </span>
      ),
    },
    {
      key: "risk",
      header: strings.risk,
      render: (row) => <RiskBadge risk={row.risk} />,
    },
    {
      key: "district",
      header: strings.district,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.district}</span>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          data-ocid={`case_workbench.entity_button.${row.id}`}
          onClick={() => openEntityDrawer(row.id)}
          className="text-xs text-info transition-smooth hover:underline"
        >
          {strings.quickView}
        </button>
      ),
    },
  ];

  return (
    <div data-ocid="case_workbench.page" className="flex flex-col">
      <Link
        to="/cases"
        data-ocid="case_workbench.back_link"
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-smooth hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {strings.backToCases}
      </Link>

      <PageHeader
        eyebrow={`${record.id} · ${record.firNumber}`}
        title={record.title}
        description={record.summary}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill label={caseStatusLabels[record.status]} tone="danger" />
            <RiskBadge risk={record.risk} />
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="panel p-4 lg:col-span-3">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <DetailField
              label={strings.leadOfficer}
              value={record.leadOfficer}
            />
            <DetailField
              label={strings.district}
              value={record.district ?? "\u2014"}
            />
            <DetailField
              label={strings.station}
              value={record.station ?? "\u2014"}
            />
            <DetailField
              label={strings.category}
              value={record.category ?? "\u2014"}
            />
            <DetailField
              label={strings.opened}
              value={formatDate(record.openedAt)}
              mono
            />
            <DetailField
              label={strings.updated}
              value={formatDateTime(record.updatedAt)}
              mono
            />
            <DetailField
              label={strings.priority}
              value={
                record.priority ? casePriorityLabels[record.priority] : "\u2014"
              }
            />
            <DetailField
              label={strings.evidence}
              value={`${record.evidenceCount} ${strings.item}`}
              mono
            />
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="label-caps text-muted-foreground">
                {strings.progress}
              </span>
              <span className="font-mono-id tabular-nums text-foreground">
                {record.progress}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-info transition-smooth"
                style={{ width: `${record.progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <p className="label-caps mb-2 text-muted-foreground">
            {strings.linkedCases}
          </p>
          {record.linkedCaseIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {strings.noLinkedEntities}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {record.linkedCaseIds.map((linkedId) => (
                <li key={linkedId}>
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: linkedId }}
                    data-ocid={`case_workbench.linked_case.${linkedId}`}
                    className="font-mono-id text-xs text-info transition-smooth hover:underline"
                  >
                    {linkedId}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        data-ocid="case_workbench.metric_strip"
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: strings.entitiesMetric,
            value: String(caseEntities.length),
          },
          {
            label: strings.relationshipsMetric,
            value: String(graph?.edges.length ?? 0),
          },
          {
            label: strings.tracedMetric,
            value: formatCompactCurrency(moneyFlow?.totalVolume ?? 0),
          },
          {
            label: strings.linkedCasesMetric,
            value: String(record.linkedCaseIds.length),
          },
        ].map((item) => (
          <div key={item.label} className="panel p-4">
            <p className="label-caps text-muted-foreground">{item.label}</p>
            <p className="metric-value mt-1 text-lg">{item.value}</p>
          </div>
        ))}
      </section>

      <Tabs defaultValue="overview" className="mt-5">
        <TabsList data-ocid="case_workbench.tabs" className="flex-wrap">
          <TabsTrigger value="overview" data-ocid="case_workbench.tab.overview">
            {strings.overview}
          </TabsTrigger>
          <TabsTrigger value="evidence" data-ocid="case_workbench.tab.evidence">
            {strings.evidenceTab}
          </TabsTrigger>
          <TabsTrigger value="network" data-ocid="case_workbench.tab.network">
            {strings.networkTab}
          </TabsTrigger>
          <TabsTrigger value="cdr" data-ocid="case_workbench.tab.cdr">
            {strings.cdrTab}
          </TabsTrigger>
          <TabsTrigger
            value="money-trail"
            data-ocid="case_workbench.tab.money_trail"
          >
            {strings.moneyTrailTab}
          </TabsTrigger>
          <TabsTrigger value="timeline" data-ocid="case_workbench.tab.timeline">
            {strings.timelineTab}
          </TabsTrigger>
          <TabsTrigger value="reports" data-ocid="case_workbench.tab.reports">
            {strings.reportsTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel lg:col-span-2">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.caseSummary}
                </h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-muted-foreground">
                  {record.summary}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="label-caps text-muted-foreground">
                      {strings.entitiesMetric}
                    </p>
                    <p className="metric-value mt-1 text-xl">
                      {caseEntities.length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="label-caps text-muted-foreground">
                      {strings.evidence}
                    </p>
                    <p className="metric-value mt-1 text-xl">
                      {caseEvidence.length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="label-caps text-muted-foreground">
                      {strings.timeline}
                    </p>
                    <p className="metric-value mt-1 text-xl">
                      {timeline.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.recentActivity}
                </h2>
              </div>
              <div className="p-4">
                <Timeline events={timeline.slice(-4).reverse()} compact />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-foreground">
              {strings.entities}
            </h2>
            <DataTable
              columns={entityColumns}
              rows={caseEntities}
              rowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  title={strings.noLinkedEntities}
                  body={strings.noLinkedEntitiesBody}
                />
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.integrity}
                </h2>
              </div>
              <div className="p-4">
                <EvidenceIntegrity records={caseEvidence} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.custody}
                </h2>
              </div>
              <div className="p-4">
                <ChainOfCustody events={caseCustody} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="network" className="mt-4">
          {graph ? (
            <GraphCanvas
              graph={graph}
              onSelect={(id) => openEntityDrawer(id)}
              className="h-[520px]"
            />
          ) : null}
        </TabsContent>

        <TabsContent value="cdr" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.communications}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {caseCdr.length} records
                </span>
              </div>
              <div className="p-4">
                <ul className="flex flex-col divide-y divide-border/60">
                  {caseCdr.slice(0, 6).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-mono-id text-xs text-foreground">
                          {row.caller} → {row.callee}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.callerName} · {row.cellTower}
                        </p>
                      </div>
                      <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
                        {formatDuration(row.durationSec)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="font-display text-sm font-semibold text-foreground">
                  {strings.communicationTimeline}
                </h2>
              </div>
              <div className="p-4">
                <ol className="flex flex-col gap-3">
                  {(cdrSummary?.timeline ?? []).map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3">
                      <span className="font-mono-id text-xs tabular-nums text-info">
                        {entry.time}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{entry.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="money-trail" className="mt-4">
          <div className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.moneyTrail}
              </h2>
              <span className="font-mono-id text-xs text-risk-medium">
                {moneyFlow?.tracedLabel}
              </span>
            </div>
            <div className="p-4">
              <ol className="flex flex-wrap items-center gap-2">
                {(moneyFlow?.stages ?? []).map((stage, index) => (
                  <li key={stage.id} className="flex items-center gap-2">
                    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium text-foreground">
                        {stage.label}
                      </p>
                      <p className="font-mono-id text-[10px] text-muted-foreground">
                        {formatCompactCurrency(stage.amount)}
                      </p>
                    </div>
                    {index < (moneyFlow?.stages.length ?? 0) - 1 ? (
                      <ArrowRight
                        className="size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="panel p-4">
            <Timeline events={timeline} />
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <EmptyState
            icon={<FileText className="size-5" aria-hidden />}
            title={strings.reportsUnavailable}
            body={strings.reportsUnavailableBody}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid="case_workbench.reports_disabled_button"
                disabled
              >
                {strings.reportsTab}
              </Button>
            }
          />
        </TabsContent>
      </Tabs>

      <section className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="panel flex items-center gap-3 p-4">
          <Users className="size-5 text-info" aria-hidden />
          <div>
            <p className="label-caps text-muted-foreground">
              {strings.entitiesMetric}
            </p>
            <p className="metric-value text-lg">{caseEntities.length}</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <Network className="size-5 text-accent-blue" aria-hidden />
          <div>
            <p className="label-caps text-muted-foreground">
              {strings.relationshipsMetric}
            </p>
            <p className="metric-value text-lg">{graph?.edges.length ?? 0}</p>
          </div>
        </div>
        <div className="panel flex items-center gap-3 p-4">
          <FileText className="size-5 text-neutral-purple" aria-hidden />
          <div>
            <p className="label-caps text-muted-foreground">
              {strings.evidence}
            </p>
            <p className="metric-value text-lg">{caseEvidence.length}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
