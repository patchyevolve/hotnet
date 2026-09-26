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
import { openEntityDrawer } from "@/components/crimenet/AppShell";
import { formatDateTime, formatPercent } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { roleLabels, useRole } from "@/lib/crimenet/role-context";
import { getFaceRecords, postFaceDecision } from "@/lib/crimenet/services";
import type { FaceRecord } from "@/lib/crimenet/types";
import { ScanFace } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const matchTone: Record<
  FaceRecord["matchStatus"],
  "success" | "warning" | "neutral" | "danger"
> = {
  confirmed: "success",
  probable: "warning",
  unverified: "neutral",
  rejected: "danger",
};

const matchLabelKey: Record<
  FaceRecord["matchStatus"],
  "matchConfirmed" | "matchProbable" | "matchUnverified" | "matchRejected"
> = {
  confirmed: "matchConfirmed",
  probable: "matchProbable",
  unverified: "matchUnverified",
  rejected: "matchRejected",
};

export function FacePage() {
  const { language, role } = useRole();
  const strings = getStrings(language);
  const [records, setRecords] = useState<FaceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [district, setDistrict] = useState("all");
  const [loading, setLoading] = useState(true);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getFaceRecords().then((result) => {
      if (cancelled) return;
      setRecords(result);
      setSelectedId(result[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingMatches = useMemo(
    () => records.filter((row) => row.matchStatus === "probable"),
    [records],
  );

  async function decide(decision: "confirm" | "reject") {
    if (!selected || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionNote(null);
    try {
      const updated = await postFaceDecision({
        faceId: selected.id,
        decision,
        reviewer: roleLabels[role],
      });
      setRecords((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setDecisionNote(strings.decisionRecorded);
    } catch {
      setDecisionNote(strings.decisionFailed);
    } finally {
      setDecisionBusy(false);
    }
  }

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
          (status === "all" || row.matchStatus === status) &&
          (district === "all" || row.district === district),
      ),
    [records, status, district],
  );

  const selected = records.find((row) => row.id === selectedId) ?? null;

  const columns: Column<FaceRecord>[] = [
    {
      key: "id",
      header: strings.matchIdHeader,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "subject",
      header: strings.subjectHeader,
      render: (row) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate text-sm text-foreground">{row.subject}</p>
          <p className="font-mono-id text-[11px] text-muted-foreground">
            {row.entityId}
          </p>
        </div>
      ),
    },
    {
      key: "confidence",
      header: strings.confidence,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-foreground">
          {formatPercent(row.confidence * 100, 1)}
        </span>
      ),
    },
    {
      key: "camera",
      header: strings.camera,
      render: (row) => (
        <span className="font-mono-id text-xs text-muted-foreground">
          {row.camera}
        </span>
      ),
    },
    {
      key: "captured",
      header: strings.captured,
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDateTime(row.capturedAt)}
        </span>
      ),
    },
    {
      key: "district",
      header: strings.district,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.district}</span>
      ),
    },
    {
      key: "status",
      header: strings.matchStatus,
      render: (row) => (
        <StatusPill
          label={strings[matchLabelKey[row.matchStatus]]}
          tone={matchTone[row.matchStatus]}
        />
      ),
    },
    {
      key: "risk",
      header: strings.risk,
      render: (row) => <RiskBadge risk={row.risk} />,
    },
  ];

  return (
    <div data-ocid="face.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.biometricReview}
        title={strings.faceTitle}
        description={strings.faceDescriptionText}
        actions={<StatusPill label={strings.reviewQueue} tone="info" />}
      />

      {loading ? (
        <div
          data-ocid="face.loading_state"
          className="grid gap-4 sm:grid-cols-3"
        >
          {Array.from(
            { length: 3 },
            (_, index) => `face-skeleton-${index}`,
          ).map((id) => (
            <div
              key={id}
              className="panel h-[104px] animate-pulse bg-muted/20"
            />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={strings.totalMatches}
            value={String(records.length)}
            delta="+3 this week"
            trend="up"
            tone="info"
            series={[3, 3, 4, 4, 5, 5, 6]}
            index={0}
          />
          <MetricCard
            label={strings.matchConfirmed}
            value={String(
              records.filter((row) => row.matchStatus === "confirmed").length,
            )}
            delta="+2 this week"
            trend="up"
            tone="low"
            series={[2, 2, 3, 3, 3, 4, 4]}
            index={1}
          />
          <MetricCard
            label={strings.needsReview}
            value={String(
              records.filter(
                (row) =>
                  row.matchStatus === "probable" ||
                  row.matchStatus === "unverified",
              ).length,
            )}
            delta="+1 today"
            trend="up"
            tone="high"
            series={[1, 1, 1, 2, 2, 2, 2]}
            index={2}
          />
        </section>
      )}

      {!loading && pendingMatches.length > 0 ? (
        <div
          data-ocid="face.alert_banner"
          className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-risk-medium/40 bg-risk-medium/10 px-4 py-3"
        >
          <StatusPill label={strings.faceAlertTitle} tone="warning" pulse />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            {strings.faceAlertBody}
          </p>
          <span className="font-mono-id text-xs tabular-nums text-risk-medium">
            {pendingMatches.length}
          </span>
        </div>
      ) : null}

      <div className="mt-5">
        <FilterBar
          filters={[
            {
              id: "status",
              label: strings.matchStatus,
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: strings.all },
                { value: "confirmed", label: strings.matchConfirmed },
                { value: "probable", label: strings.matchProbable },
                { value: "unverified", label: strings.matchUnverified },
                { value: "rejected", label: strings.matchRejected },
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
            setStatus("all");
            setDistrict("all");
          }}
          resultCount={filtered.length}
          resultLabel={strings.matchesLabel}
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
              icon={<ScanFace className="size-5" aria-hidden />}
              title={strings.emptyTitle}
              body={strings.emptyBody}
            />
          }
        />

        <DetailPanel
          title={selected ? selected.subject : strings.noSelection}
          subtitle={selected?.id}
          badge={
            selected ? (
              <StatusPill
                label={strings[matchLabelKey[selected.matchStatus]]}
                tone={matchTone[selected.matchStatus]}
              />
            ) : undefined
          }
          footer={
            selected ? (
              <div className="flex flex-col gap-2">
                {selected.matchStatus === "probable" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-ocid="face.confirm_button"
                      disabled={decisionBusy}
                      onClick={() => void decide("confirm")}
                      className="rounded-md border border-risk-low/40 bg-risk-low/12 py-2 text-sm font-medium text-risk-low transition-smooth hover:bg-risk-low/20 disabled:opacity-50"
                    >
                      {strings.confirmMatch}
                    </button>
                    <button
                      type="button"
                      data-ocid="face.reject_button"
                      disabled={decisionBusy}
                      onClick={() => void decide("reject")}
                      className="rounded-md border border-risk-critical/40 bg-risk-critical/12 py-2 text-sm font-medium text-risk-critical transition-smooth hover:bg-risk-critical/20 disabled:opacity-50"
                    >
                      {strings.rejectMatch}
                    </button>
                  </div>
                ) : null}
                {decisionNote ? (
                  <p
                    data-ocid="face.decision_note"
                    className="text-center text-xs text-muted-foreground"
                  >
                    {decisionNote}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-ocid="face.open_entity_button"
                  onClick={() => openEntityDrawer(selected.entityId)}
                  className="w-full rounded-md border border-info/40 bg-info/12 py-2 text-sm font-medium text-info transition-smooth hover:bg-info/20"
                >
                  {strings.openRecord}
                </button>
              </div>
            ) : undefined
          }
        >
          {selected ? (
            <>
              <DetailField
                label={strings.confidence}
                value={formatPercent(selected.confidence * 100, 1)}
                mono
              />
              <DetailField
                label={strings.similarityLabel}
                value={
                  selected.similarity != null
                    ? formatPercent(selected.similarity * 100, 1)
                    : "—"
                }
                mono
              />
              <DetailField
                label={strings.matchedWith}
                value={selected.matchedWith || "—"}
              />
              <DetailField
                label={strings.matchedFrom}
                value={
                  selected.matchedFrom?.length
                    ? selected.matchedFrom.join(", ")
                    : "—"
                }
              />
              <DetailField
                label={strings.camera}
                value={selected.camera}
                mono
              />
              <DetailField
                label={strings.captured}
                value={formatDateTime(selected.capturedAt)}
                mono
              />
              <DetailField label={strings.district} value={selected.district} />
              <DetailField
                label={strings.matchStatus}
                value={strings[matchLabelKey[selected.matchStatus]]}
              />
              {selected.decidedBy ? (
                <DetailField
                  label={strings.decidedByLabel}
                  value={`${selected.decidedBy} · ${formatDateTime(selected.decidedAt ?? "")}`}
                />
              ) : null}
              <DetailField label={strings.risk} value={selected.risk} />
              <p className="mt-3 text-sm text-muted-foreground">
                {selected.notes}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectMatch}
            </p>
          )}
        </DetailPanel>
      </div>
    </div>
  );
}
