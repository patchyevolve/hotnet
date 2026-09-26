import {
  ChainOfCustody,
  type Column,
  DataTable,
  DetailField,
  DetailPanel,
  EmptyState,
  EvidenceIntegrity,
  FilterBar,
  MetricCard,
  PageHeader,
  StatusPill,
} from "@/components/crimenet";
import { formatDateTime } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getCustodyEvents, getEvidence } from "@/lib/crimenet/services";
import type { CustodyEvent, EvidenceRecord } from "@/lib/crimenet/types";
import { BadgeCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const integrityTone: Record<
  EvidenceRecord["integrity"],
  "success" | "warning" | "danger"
> = {
  verified: "success",
  pending: "warning",
  tampered: "danger",
};

const integrityLabel: Record<EvidenceRecord["integrity"], string> = {
  verified: "Integrity Verified",
  pending: "Pending",
  tampered: "Integrity Failed",
};

export function EvidencePage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [custody, setCustody] = useState<CustodyEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [integrity, setIntegrity] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getEvidence(), getCustodyEvents()]).then(
      ([recordResult, custodyResult]) => {
        if (cancelled) return;
        setRecords(recordResult);
        setCustody(custodyResult);
        setSelectedId(recordResult[0]?.id ?? null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      records.filter(
        (row) =>
          (kind === "all" || row.kind === kind) &&
          (integrity === "all" || row.integrity === integrity),
      ),
    [records, kind, integrity],
  );

  const selected = records.find((row) => row.id === selectedId) ?? null;
  const selectedCustody = custody.filter(
    (event) => event.evidenceId === selectedId,
  );

  const columns: Column<EvidenceRecord>[] = [
    {
      key: "id",
      header: strings.evidenceId,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "label",
      header: strings.item,
      render: (row) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate text-sm text-foreground">{row.label}</p>
          <p className="font-mono-id text-[11px] text-muted-foreground">
            {row.caseId}
          </p>
        </div>
      ),
    },
    {
      key: "kind",
      header: strings.type,
      render: (row) => (
        <span className="text-xs uppercase text-muted-foreground">
          {row.kind}
        </span>
      ),
    },
    {
      key: "case",
      header: strings.caseLabel,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.caseId}</span>
      ),
    },
    {
      key: "hash",
      header: strings.hash,
      render: (row) => (
        <span className="font-mono-id text-xs text-muted-foreground">
          {row.hash}
        </span>
      ),
    },
    {
      key: "collected",
      header: strings.collected,
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDateTime(row.collectedAt)}
        </span>
      ),
    },
    {
      key: "by",
      header: strings.uploadedBy,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.collectedBy}</span>
      ),
    },
    {
      key: "size",
      header: strings.size,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {row.sizeLabel}
        </span>
      ),
    },
    {
      key: "integrity",
      header: strings.integrity,
      render: (row) => (
        <StatusPill
          label={integrityLabel[row.integrity]}
          tone={integrityTone[row.integrity]}
        />
      ),
    },
  ];

  return (
    <div data-ocid="evidence.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.evidenceManagement}
        title={strings.evidenceVault}
        description={strings.evidenceDescription}
      />

      {loading ? (
        <div
          data-ocid="evidence.loading_state"
          className="grid gap-4 sm:grid-cols-3"
        >
          {Array.from(
            { length: 3 },
            (_, index) => `evidence-skeleton-${index}`,
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
            label={strings.totalItems}
            value={String(records.length)}
            delta=""
            trend="flat"
            tone="info"
            series={[records.length]}
            index={0}
          />
          <MetricCard
            label={strings.verified}
            value={String(
              records.filter((row) => row.integrity === "verified").length,
            )}
            delta=""
            trend="flat"
            tone="low"
            series={[
              records.filter((row) => row.integrity === "verified").length,
            ]}
            index={1}
          />
          <MetricCard
            label={strings.integrityFlags}
            value={String(
              records.filter((row) => row.integrity !== "verified").length,
            )}
            delta=""
            trend="flat"
            tone="high"
            series={[
              records.filter((row) => row.integrity !== "verified").length,
            ]}
            index={2}
          />
        </section>
      )}

      <div className="mt-5">
        <FilterBar
          filters={[
            {
              id: "kind",
              label: strings.type,
              value: kind,
              onChange: setKind,
              options: [
                { value: "all", label: strings.all },
                { value: "document", label: "Document" },
                { value: "image", label: "Image" },
                { value: "audio", label: "Audio" },
                { value: "video", label: "Video" },
                { value: "device", label: "Device" },
                { value: "forensic", label: "Forensic" },
              ],
            },
            {
              id: "integrity",
              label: strings.integrity,
              value: integrity,
              onChange: setIntegrity,
              options: [
                { value: "all", label: strings.all },
                { value: "verified", label: strings.integrityVerified },
                { value: "pending", label: "Pending" },
                { value: "tampered", label: "Integrity Failed" },
              ],
            },
          ]}
          onReset={() => {
            setKind("all");
            setIntegrity("all");
          }}
          resultCount={filtered.length}
          resultLabel="items"
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
              icon={<BadgeCheck className="size-5" aria-hidden />}
              title={strings.emptyTitle}
              body={strings.emptyBody}
            />
          }
        />

        <DetailPanel
          title={selected ? selected.label : strings.noSelection}
          subtitle={selected?.id}
          badge={
            selected ? (
              <StatusPill
                label={integrityLabel[selected.integrity]}
                tone={integrityTone[selected.integrity]}
              />
            ) : undefined
          }
        >
          {selected ? (
            <>
              <DetailField
                label={strings.caseLabel}
                value={selected.caseId}
                mono
              />
              <DetailField
                label={strings.type}
                value={selected.kind.toUpperCase()}
              />
              <DetailField
                label={strings.uploadedBy}
                value={selected.collectedBy}
              />
              <DetailField
                label={strings.collected}
                value={formatDateTime(selected.collectedAt)}
                mono
              />
              <DetailField
                label={strings.storageRef}
                value={selected.storageRef}
                mono
              />
              <DetailField label={strings.hash} value={selected.hash} mono />
              <DetailField
                label={strings.size}
                value={selected.sizeLabel}
                mono
              />

              <div className="mt-4">
                <p className="label-caps mb-2 text-muted-foreground">
                  {strings.custody}
                </p>
                {selectedCustody.length > 0 ? (
                  <ChainOfCustody events={selectedCustody} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {strings.noCustodyEvents}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {strings.selectEvidence}
            </p>
          )}
        </DetailPanel>
      </div>

      <section className="mt-5 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.vaultIntegrityOverview}
          </h2>
        </div>
        <div className="p-4">
          <EvidenceIntegrity records={records} />
        </div>
      </section>
    </div>
  );
}
