import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RiskBadge,
  StatusPill,
} from "@/components/crimenet";
import { Button } from "@/components/ui/button";
import {
  casePriorityLabels,
  caseStatusLabels,
  caseStatusTones,
  downloadCsv,
  formatDate,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useIdentity } from "@/lib/crimenet/identity";
import { useRole } from "@/lib/crimenet/role-context";
import { getCases } from "@/lib/crimenet/services";
import type { CaseRecord } from "@/lib/crimenet/types";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statusTone = caseStatusTones;

export function CasesPage() {
  const { language, role } = useRole();
  const identity = useIdentity();
  const strings = getStrings(language);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");
  const [district, setDistrict] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void getCases().then((result) => {
      if (cancelled) return;
      setCases(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Station scope: the API already narrows this server-side, and the UI keeps
  // the same rule so a cross-station row never renders even if a response
  // slips through. Only ADMIN sees every station's registry.
  const scoped = useMemo(() => {
    if (role === "ADMIN") return cases;
    return cases.filter(
      (item) => !item.station || item.station === identity?.jurisdictionId,
    );
  }, [cases, role, identity]);

  const districts = useMemo(
    () =>
      [...new Set(scoped.map((item) => item.district))]
        .filter((item): item is string => Boolean(item))
        .sort(),
    [scoped],
  );

  const filtered = useMemo(
    () =>
      scoped.filter(
        (item) =>
          (status === "all" || item.status === status) &&
          (risk === "all" || item.risk === risk) &&
          (district === "all" || item.district === district),
      ),
    [scoped, status, risk, district],
  );

  const exportRegister = () => {
    const headers = [
      strings.caseIdHeader,
      strings.titleHeader,
      strings.status,
      strings.priority,
      strings.risk,
      strings.district,
      strings.leadOfficer,
      strings.updated,
    ];
    const rows = filtered.map((item) => [
      item.id,
      item.title,
      caseStatusLabels[item.status],
      item.priority ? casePriorityLabels[item.priority] : "",
      item.risk,
      item.district ?? "",
      item.leadOfficer,
      item.updatedAt,
    ]);
    downloadCsv("case-register.csv", headers, rows);
  };

  const columns: Column<CaseRecord>[] = [
    {
      key: "id",
      header: strings.caseIdHeader,
      render: (row) => (
        <span className="font-mono-id text-xs text-info">{row.id}</span>
      ),
    },
    {
      key: "title",
      header: strings.titleHeader,
      render: (row) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate text-sm text-foreground">{row.title}</p>
          <p className="truncate font-mono-id text-[11px] text-muted-foreground">
            {row.firNumber}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: strings.status,
      render: (row) => (
        <StatusPill
          label={caseStatusLabels[row.status]}
          tone={statusTone[row.status]}
        />
      ),
    },
    {
      key: "priority",
      header: strings.priority,
      render: (row) => (
        <span className="font-mono-id text-xs text-muted-foreground">
          {row.priority ? casePriorityLabels[row.priority] : "\u2014"}
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
      key: "lead",
      header: strings.leadOfficer,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.leadOfficer}</span>
      ),
    },
    {
      key: "updated",
      header: strings.updated,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {formatDate(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (row) => (
        <Link
          to="/cases/$caseId"
          params={{ caseId: row.id }}
          data-ocid={`cases.open_link.${row.id}`}
          className="inline-flex items-center gap-1 text-xs text-info transition-smooth hover:underline"
        >
          {strings.openLabel}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <div data-ocid="cases.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.caseRegistry}
        title={strings.casesTitle}
        description={strings.casesDescription}
        actions={
          <div className="flex items-center gap-2">
            {role !== "ADMIN" ? (
              <span
                data-ocid="cases.station_scope"
                className="hidden rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground sm:block"
              >
                {strings.station}:{" "}
                {(identity?.jurisdictionId || "")
                  .replace("JURISDICTION_", "")
                  .replace(/_/g, " ")}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-ocid="cases.export_button"
              onClick={exportRegister}
            >
              {strings.exportRegister}
            </Button>
          </div>
        }
      />

      <FilterBar
        filters={[
          {
            id: "status",
            label: strings.status,
            value: status,
            onChange: setStatus,
            options: [
              { value: "all", label: strings.all },
              ...Object.entries(caseStatusLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ],
          },
          {
            id: "risk",
            label: strings.risk,
            value: risk,
            onChange: setRisk,
            options: [
              { value: "all", label: strings.all },
              { value: "critical", label: strings.riskCritical },
              { value: "high", label: strings.riskHigh },
              { value: "medium", label: strings.riskMedium },
              { value: "low", label: strings.riskLow },
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
          setRisk("all");
          setDistrict("all");
        }}
        resultCount={filtered.length}
        resultLabel={strings.results}
      />

      <div className="mt-4">
        {loading ? (
          <div
            data-ocid="cases.loading_state"
            className="panel h-72 animate-pulse bg-muted/20"
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<FolderOpen className="size-5" aria-hidden />}
                title={strings.emptyTitle}
                body={strings.emptyBody}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-ocid="cases.clear_filters_button"
                    onClick={() => {
                      setStatus("all");
                      setRisk("all");
                      setDistrict("all");
                    }}
                  >
                    {strings.clearFilters}
                  </Button>
                }
              />
            }
          />
        )}
      </div>
    </div>
  );
}
