import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RiskBadge,
} from "@/components/crimenet";
import { openEntityDrawer } from "@/components/crimenet/AppShell";
import { entityKindLabels } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getEntities } from "@/lib/crimenet/services";
import type { EntityRecord } from "@/lib/crimenet/types";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function EntityListPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("all");
  const [risk, setRisk] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getEntities().then((result) => {
      if (cancelled) return;
      setEntities(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entities.filter(
      (item) =>
        (kind === "all" || item.kind === kind) &&
        (risk === "all" || item.risk === risk) &&
        (term.length === 0 ||
          item.name.toLowerCase().includes(term) ||
          item.id.toLowerCase().includes(term)),
    );
  }, [entities, kind, risk, query]);

  const columns: Column<EntityRecord>[] = [
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
        <div className="min-w-0 max-w-sm">
          <p className="truncate text-sm text-foreground">{row.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.district}
          </p>
        </div>
      ),
    },
    {
      key: "kind",
      header: strings.entityType,
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
      key: "cases",
      header: strings.linkedCasesCount,
      align: "right",
      render: (row) => (
        <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
          {row.linkedCaseIds.length}
        </span>
      ),
    },
    {
      key: "open",
      header: "",
      align: "right",
      render: (row) => (
        <Link
          to="/entities/$entityId"
          params={{ entityId: row.id }}
          data-ocid={`entity_list.open_link.${row.id}`}
          className="inline-flex items-center gap-1 text-xs text-info transition-smooth hover:underline"
        >
          {strings.openProfile}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <div data-ocid="entity_list.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.entityProfile}
        title={strings.entityIntelligence}
        description={strings.entityDescription}
      />

      <FilterBar
        filters={[
          {
            id: "kind",
            label: strings.entityType,
            value: kind,
            onChange: setKind,
            options: [
              { value: "all", label: strings.all },
              ...Object.entries(entityKindLabels).map(([value, label]) => ({
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
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
          },
        ]}
        onReset={() => {
          setKind("all");
          setRisk("all");
          setQuery("");
        }}
        resultCount={filtered.length}
        resultLabel={strings.entities}
      >
        <label className="flex min-w-[12rem] flex-col gap-1">
          <span className="label-caps text-muted-foreground">
            {strings.searchEntities}
          </span>
          <input
            type="search"
            data-ocid="entity_list.search_input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.searchEntities}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-smooth placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
      </FilterBar>

      <div className="mt-4">
        {loading ? (
          <div
            data-ocid="entity_list.loading_state"
            className="panel h-72 animate-pulse bg-muted/20"
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            onRowClick={(row) => openEntityDrawer(row.id)}
            emptyState={
              <EmptyState
                icon={<Users className="size-5" aria-hidden />}
                title={strings.emptyTitle}
                body={strings.emptyBody}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
