import {
  type Column,
  DataTable,
  DetailField,
  EmptyState,
  PageHeader,
  RiskBadge,
  StatusPill,
  Timeline,
} from "@/components/crimenet";
import { openEntityDrawer } from "@/components/crimenet/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  entityKindLabels,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import {
  getCases,
  getCdrRecords,
  getEntities,
  getEntity,
  getEvidence,
  getMoneyFlow,
  getTimeline,
} from "@/lib/crimenet/services";
import type {
  CaseRecord,
  CdrRecord,
  EntityRecord,
  EvidenceRecord,
  MoneyFlow,
  TimelineEvent,
} from "@/lib/crimenet/types";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Network, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function EntityPage() {
  const { entityId } = useParams({ strict: false }) as { entityId?: string };
  const { language } = useRole();
  const strings = getStrings(language);
  const navigate = useNavigate();

  const [entity, setEntity] = useState<EntityRecord | null>(null);
  const [allEntities, setAllEntities] = useState<EntityRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [cdr, setCdr] = useState<CdrRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [flow, setFlow] = useState<MoneyFlow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      entityId ? getEntity(entityId) : Promise.resolve(null),
      getEntities(),
      getTimeline(),
      getCases(),
      getCdrRecords(),
      getEvidence(),
      getMoneyFlow(),
    ]).then(
      ([
        entityResult,
        allResult,
        timelineResult,
        caseResult,
        cdrResult,
        evidenceResult,
        flowResult,
      ]) => {
        if (cancelled) return;
        setEntity(entityResult);
        setAllEntities(allResult);
        setTimeline(timelineResult);
        setCases(caseResult);
        setCdr(cdrResult);
        setEvidence(evidenceResult);
        setFlow(flowResult);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const linked = useMemo(
    () =>
      allEntities.filter((item) => entity?.linkedEntityIds.includes(item.id)),
    [allEntities, entity],
  );

  const linkedCases = useMemo(
    () => cases.filter((item) => entity?.linkedCaseIds.includes(item.id)),
    [cases, entity],
  );

  const entityCdr = useMemo(
    () =>
      cdr.filter(
        (row) =>
          entity?.identifiers.some(
            (identifier) =>
              identifier.value === row.caller ||
              identifier.value === row.callee,
          ) ||
          entity?.name === row.callerName ||
          entity?.name === row.calleeName,
      ),
    [cdr, entity],
  );

  const entityEvidence = useMemo(
    () =>
      evidence.filter((item) =>
        entity?.linkedCaseIds.includes(item.caseId ?? ""),
      ),
    [evidence, entity],
  );

  const entityLocations = useMemo(
    () =>
      allEntities.filter(
        (item) =>
          item.kind === "location" &&
          (entity?.linkedEntityIds.includes(item.id) ||
            item.linkedEntityIds.includes(entity?.id ?? "")),
      ),
    [allEntities, entity],
  );

  if (loading) {
    return (
      <div
        data-ocid="entity.loading_state"
        className="panel h-96 animate-pulse bg-muted/20"
      />
    );
  }

  if (!entity) {
    return (
      <EmptyState
        icon={<Users className="size-5" aria-hidden />}
        title="Entity not found"
        body={`No entity profile exists for ${entityId ?? "this record"}.`}
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/entities" data-ocid="entity.back_link">
              Back to entities
            </Link>
          </Button>
        }
      />
    );
  }

  const linkedColumns: Column<EntityRecord>[] = [
    {
      key: "id",
      header: "Entity ID",
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <span className="text-sm text-foreground">{row.name}</span>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {entityKindLabels[row.kind]}
        </span>
      ),
    },
    {
      key: "risk",
      header: "Risk",
      render: (row) => <RiskBadge risk={row.risk} />,
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          data-ocid={`entity.linked_button.${row.id}`}
          onClick={() => openEntityDrawer(row.id)}
          className="text-xs text-info transition-smooth hover:underline"
        >
          Quick view
        </button>
      ),
    },
  ];

  const counts = [
    { label: strings.linkedCasesCount, value: entity.linkedCaseIds.length },
    {
      label: strings.phoneNumbers,
      value: entity.identifiers.filter((row) => row.kind === "phone").length,
    },
    {
      label: strings.bankAccounts,
      value: entity.identifiers.filter((row) => row.kind === "account").length,
    },
    { label: strings.associates, value: entity.linkedEntityIds.length },
    { label: strings.locations, value: entityLocations.length },
  ];

  return (
    <div data-ocid="entity.page" className="flex flex-col">
      <Link
        to="/entities"
        data-ocid="entity.back_link"
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-smooth hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to entities
      </Link>

      <PageHeader
        eyebrow={`${entity.id} · ${entityKindLabels[entity.kind]}`}
        title={entity.name}
        description={entity.summary}
        actions={<RiskBadge risk={entity.risk} />}
      />

      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {counts.map((count) => (
          <div key={count.label} className="panel p-3">
            <p className="label-caps text-muted-foreground">{count.label}</p>
            <p className="metric-value mt-1 text-lg">{count.value}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="entity.view_timeline_button"
          disabled={entity.linkedCaseIds.length === 0}
          onClick={() => {
            const target = entity.linkedCaseIds[0];
            if (!target) return;
            void navigate({ to: "/cases/$caseId", params: { caseId: target } });
          }}
          className="gap-1.5"
        >
          {strings.viewTimeline}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="entity.expand_network_button"
          onClick={() => void navigate({ to: "/network" })}
          className="gap-1.5"
        >
          <Network className="size-3.5" aria-hidden />
          {strings.expandNetwork}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="entity.open_cases_button"
          onClick={() => void navigate({ to: "/cases" })}
          className="gap-1.5"
        >
          {strings.openCases}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="entity.trace_money_button"
          onClick={() => void navigate({ to: "/money-trail" })}
          className="gap-1.5"
        >
          {strings.traceMoney}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="entity.view_map_button"
          onClick={() => void navigate({ to: "/map" })}
          className="gap-1.5"
        >
          <MapPin className="size-3.5" aria-hidden />
          {strings.viewOnMap}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="mt-5">
        <TabsList data-ocid="entity.tabs" className="flex-wrap">
          <TabsTrigger value="overview" data-ocid="entity.tab.overview">
            {strings.overview}
          </TabsTrigger>
          <TabsTrigger value="connections" data-ocid="entity.tab.connections">
            {strings.connections}
          </TabsTrigger>
          <TabsTrigger value="cases" data-ocid="entity.tab.cases">
            {strings.cases}
          </TabsTrigger>
          <TabsTrigger
            value="communications"
            data-ocid="entity.tab.communications"
          >
            {strings.communications}
          </TabsTrigger>
          <TabsTrigger value="financial" data-ocid="entity.tab.financial">
            {strings.financialActivity}
          </TabsTrigger>
          <TabsTrigger value="locations" data-ocid="entity.tab.locations">
            {strings.locations}
          </TabsTrigger>
          <TabsTrigger value="timeline" data-ocid="entity.tab.timeline">
            {strings.timeline}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-4 lg:col-span-2">
              <p className="label-caps mb-2 text-muted-foreground">
                {strings.identifiers}
              </p>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {entity.identifiers.map((identifier) => (
                  <DetailField
                    key={`${identifier.label}-${identifier.value}`}
                    label={identifier.label}
                    value={identifier.value}
                    mono
                  />
                ))}
              </div>

              <p className="label-caps mb-2 mt-4 text-muted-foreground">
                {strings.attributes}
              </p>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {Object.entries(entity.attributes).map(([key, value]) => (
                  <DetailField key={key} label={key} value={value} />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {entity.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <p className="label-caps mb-2 text-muted-foreground">
                {strings.overview}
              </p>
              <DetailField label={strings.district} value={entity.district} />
              <DetailField
                label={strings.firstSeen}
                value={formatDate(entity.firstSeen)}
                mono
              />
              <DetailField
                label={strings.lastSeen}
                value={formatDate(entity.lastSeen)}
                mono
              />
              <DetailField
                label={strings.linkedCasesCount}
                value={String(entity.linkedCaseIds.length)}
                mono
              />
              <DetailField
                label={strings.connections}
                value={String(entity.linkedEntityIds.length)}
                mono
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="connections" className="mt-4">
          <DataTable
            columns={linkedColumns}
            rows={linked}
            rowKey={(row) => row.id}
            dense
            emptyState={
              <EmptyState
                title="No linked entities"
                body="This entity has no recorded connections."
              />
            }
          />
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          <div className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.linkedCases}
              </h2>
            </div>
            <ul className="flex flex-col divide-y divide-border/60">
              {linkedCases.map((item) => (
                <li key={item.id}>
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: item.id }}
                    data-ocid={`entity.case_link.${item.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition-smooth hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="font-mono-id text-xs text-info">
                        {item.id}
                      </p>
                      <p className="truncate text-sm text-foreground">
                        {item.title}
                      </p>
                    </div>
                    <RiskBadge risk={item.risk} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <div className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.communications}
              </h2>
              <span className="text-xs text-muted-foreground">
                {entityCdr.length} records
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-border/60">
              {entityCdr.slice(0, 8).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono-id text-xs text-foreground">
                      {row.caller} → {row.callee}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatDateTime(row.startedAt)} · {row.cellTower}
                    </p>
                  </div>
                  <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
                    {formatDuration(row.durationSec)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <div className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.financialActivity}
              </h2>
              <span className="font-mono-id text-xs text-risk-medium">
                {flow?.tracedLabel}
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-border/60">
              {(flow?.transactions ?? []).slice(0, 6).map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {tx.fromName} → {tx.toName}
                    </p>
                    <p className="font-mono-id text-[11px] text-muted-foreground">
                      {tx.id} ·{" "}
                      {tx.channel ? tx.channel.toUpperCase() : "\u2014"}
                    </p>
                  </div>
                  <span className="font-mono-id text-xs tabular-nums text-foreground">
                    {formatCompactCurrency(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <div className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.locations}
              </h2>
            </div>
            <ul className="flex flex-col divide-y divide-border/60">
              {entityLocations.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{item.name}</p>
                    <p className="font-mono-id text-[11px] text-muted-foreground">
                      {item.id} · {item.district}
                    </p>
                  </div>
                  <StatusPill label={entityKindLabels[item.kind]} tone="info" />
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="panel p-4">
            <Timeline events={timeline} />
          </div>
        </TabsContent>
      </Tabs>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <h2 className="font-display text-sm font-semibold text-foreground">
              {strings.evidence}
            </h2>
          </div>
          <ul className="flex flex-col divide-y divide-border/60">
            {entityEvidence.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {item.label}
                  </p>
                  <p className="font-mono-id text-[11px] text-muted-foreground">
                    {item.id} · {item.caseId}
                  </p>
                </div>
                <StatusPill
                  label={
                    item.integrity === "verified"
                      ? strings.integrityVerified
                      : item.integrity
                  }
                  tone={item.integrity === "verified" ? "success" : "warning"}
                />
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2 className="font-display text-sm font-semibold text-foreground">
              {strings.timeline}
            </h2>
          </div>
          <div className="p-4">
            <Timeline events={timeline.slice(-6).reverse()} compact />
          </div>
        </div>
      </section>
    </div>
  );
}
