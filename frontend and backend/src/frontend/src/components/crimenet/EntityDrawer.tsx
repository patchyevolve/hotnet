import { entityKindLabels, formatDate } from "@/lib/crimenet/format";
import { getEntity } from "@/lib/crimenet/services";
import type { EntityRecord } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DetailField } from "./DetailPanel";
import { RiskBadge } from "./RiskBadge";

interface EntityDrawerProps {
  entityId: string | null;
  onClose: () => void;
}

export function EntityDrawer({ entityId, onClose }: EntityDrawerProps) {
  const [entity, setEntity] = useState<EntityRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!entityId) {
      setEntity(null);
      return;
    }
    setLoading(true);
    void getEntity(entityId).then((result) => {
      if (cancelled) return;
      setEntity(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    if (entityId) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [entityId, onClose]);

  if (!entityId) return null;

  const linkedCase = entity?.linkedCaseIds[0];
  const linkedCounts = entity
    ? [
        { label: "Cases", value: entity.linkedCaseIds.length },
        {
          label: "Phones",
          value: entity.identifiers.filter((row) => row.kind === "phone")
            .length,
        },
        {
          label: "Accounts",
          value: entity.identifiers.filter((row) => row.kind === "account")
            .length,
        },
        { label: "Associates", value: entity.linkedEntityIds.length },
      ]
    : [];

  return (
    <div
      data-ocid="entity_drawer"
      className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label="Entity quick view"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="label-caps text-muted-foreground">
            Entity Quick View
          </span>
          <button
            type="button"
            data-ocid="entity_drawer.close_button"
            onClick={onClose}
            aria-label="Close entity quick view"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {loading ? (
          <div
            data-ocid="entity_drawer.loading_state"
            className="flex flex-1 items-center justify-center"
          >
            <span className="text-sm text-muted-foreground">
              Loading entity…
            </span>
          </div>
        ) : !entity ? (
          <div
            data-ocid="entity_drawer.empty_state"
            className="flex flex-1 items-center justify-center px-6 text-center"
          >
            <span className="text-sm text-muted-foreground">
              Entity not found.
            </span>
          </div>
        ) : (
          <>
            <div className="scrollbar-thin flex-1 overflow-auto p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono-id text-xs text-muted-foreground">
                    {entity.id}
                  </p>
                  <h2 className="mt-0.5 font-display text-lg font-semibold text-foreground">
                    {entity.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[entityKindLabels[entity.kind], entity.district]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <RiskBadge risk={entity.risk} />
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {entity.summary}
              </p>

              {entity.alias.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entity.alias.map((alias) => (
                    <span
                      key={alias}
                      className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4">
                <p className="label-caps mb-1 text-muted-foreground">
                  Identifiers
                </p>
                {entity.identifiers.map((identifier) => (
                  <DetailField
                    key={`${identifier.label}-${identifier.value}`}
                    label={identifier.label}
                    value={identifier.value}
                    mono
                  />
                ))}
              </div>

              <div className="mt-4">
                <p className="label-caps mb-1 text-muted-foreground">
                  Attributes
                </p>
                {Object.entries(entity.attributes).map(([key, value]) => (
                  <DetailField key={key} label={key} value={value} />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="label-caps text-muted-foreground">First Seen</p>
                  <p className="mt-0.5 font-mono-id text-xs text-foreground">
                    {formatDate(entity.firstSeen)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="label-caps text-muted-foreground">Last Seen</p>
                  <p className="mt-0.5 font-mono-id text-xs text-foreground">
                    {formatDate(entity.lastSeen)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="label-caps mb-2 text-muted-foreground">
                  Linked Counts
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {linkedCounts.map((count) => (
                    <div
                      key={count.label}
                      className="rounded-md border border-border bg-muted/20 p-2 text-center"
                    >
                      <p className="metric-value text-sm">{count.value}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {count.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                {linkedCase ? (
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: linkedCase }}
                    data-ocid="entity_drawer.view_timeline_link"
                    onClick={onClose}
                    className="flex h-8 items-center justify-center rounded-md border border-border bg-card/60 text-xs text-muted-foreground transition-smooth hover:text-foreground"
                  >
                    View Timeline
                  </Link>
                ) : (
                  <span
                    data-ocid="entity_drawer.view_timeline_link"
                    aria-disabled="true"
                    className="flex h-8 items-center justify-center rounded-md border border-border bg-card/40 text-xs text-muted-foreground"
                  >
                    View Timeline
                  </span>
                )}
                <Link
                  to="/network"
                  data-ocid="entity_drawer.expand_network_link"
                  onClick={onClose}
                  className="flex h-8 items-center justify-center rounded-md border border-border bg-card/60 text-xs text-muted-foreground transition-smooth hover:text-foreground"
                >
                  Expand Network
                </Link>
                <Link
                  to="/cases"
                  data-ocid="entity_drawer.open_cases_link"
                  onClick={onClose}
                  className="flex h-8 items-center justify-center rounded-md border border-border bg-card/60 text-xs text-muted-foreground transition-smooth hover:text-foreground"
                >
                  Open Cases
                </Link>
                <Link
                  to="/money-trail"
                  data-ocid="entity_drawer.trace_money_link"
                  onClick={onClose}
                  className="flex h-8 items-center justify-center rounded-md border border-border bg-card/60 text-xs text-muted-foreground transition-smooth hover:text-foreground"
                >
                  Trace Money
                </Link>
                <Link
                  to="/map"
                  data-ocid="entity_drawer.view_map_link"
                  onClick={onClose}
                  className="col-span-2 flex h-8 items-center justify-center rounded-md border border-border bg-card/60 text-xs text-muted-foreground transition-smooth hover:text-foreground"
                >
                  View on Map
                </Link>
              </div>
              <Link
                to="/entities/$entityId"
                params={{ entityId: entity.id }}
                data-ocid="entity_drawer.open_record_link"
                onClick={onClose}
                className={cn(
                  "flex h-9 w-full items-center justify-center gap-2 rounded-md border border-info/40 bg-info/12 text-sm font-medium text-info transition-smooth hover:bg-info/20",
                )}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Open full profile
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
