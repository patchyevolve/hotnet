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
  formatDate,
} from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getCases } from "@/lib/crimenet/services";
import type { CaseRecord, CaseStatus } from "@/lib/crimenet/types";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statusTone: Record<
  CaseStatus,
  "info" | "warning" | "success" | "neutral" | "danger"
> = {
  open: "info",
  active: "danger",
  under_review: "warning",
  charge_sheet: "neutral",
  closed: "success",
};

export function CasesPage() {
  const { language } = useRole();
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

  const districts = useMemo(
    () =>
      [...new Set(cases.map((item) => item.district))]
        .filter((item): item is string => Boolean(item))
        .sort(),
    [cases],
  );

  const filtered = useMemo(
    () =>
      cases.filter(
        (item) =>
          (status === "all" || item.status === status) &&
          (risk === "all" || item.risk === risk) &&
          (district === "all" || item.district === district),
      ),
    [cases, status, risk, district],
  );

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="cases.export_button"
            disabled
          >
            {strings.exportRegister}
          </Button>
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
