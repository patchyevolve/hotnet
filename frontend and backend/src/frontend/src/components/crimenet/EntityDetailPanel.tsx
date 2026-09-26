/**
 * EntityDetailPanel — analytical right-hand panel for a selected graph node.
 *
 * Shows all available data for the entity: identity, graph metrics,
 * relationships, evidence, temporal activity, and case context.
 * Fields are only rendered when data is actually available — no invented zeros.
 */

import {
  entityKindLabels,
  formatDate,
  formatPercent,
} from "@/lib/crimenet/format";
import {
  CANVAS_COLORS,
  KIND_COLORS,
  RISK_COLORS,
} from "@/lib/crimenet/graphTransform";
import type { GraphEdge, GraphNode } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Fingerprint,
  Link2,
  Network,
  Target,
} from "lucide-react";
import { DetailField, DetailPanel } from "./DetailPanel";
import { RiskBadge } from "./RiskBadge";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntityDetailPanelProps {
  node: GraphNode | null;
  /** All edges in the current visible graph (for relationship breakdown). */
  edges: GraphEdge[];
  /** Callback to open the full entity drawer. */
  onOpenFull?: (id: string) => void;
  /** Put the node into path-source or path-target selection. */
  onSetPathSource?: (id: string) => void;
  onSetPathTarget?: (id: string) => void;
  pathMode?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityDetailPanel({
  node,
  edges,
  onOpenFull,
  onSetPathSource,
  onSetPathTarget,
  pathMode = false,
  className,
}: EntityDetailPanelProps) {
  if (!node) {
    return (
      <DetailPanel title="Nothing selected" className={className}>
        <p className="text-sm text-muted-foreground">
          Click a node to inspect its intelligence profile, metrics, and
          connections. Shift-click to add to selection.
        </p>
      </DetailPanel>
    );
  }

  // Partition edges
  const incoming = edges.filter((e) => e.target === node.id);
  const outgoing = edges.filter((e) => e.source === node.id);
  const allEdges = [...new Set([...incoming, ...outgoing])];

  // Relationship type breakdown
  const relTypes = new Map<string, number>();
  for (const e of allEdges) {
    relTypes.set(e.label, (relTypes.get(e.label) ?? 0) + 1);
  }

  const kindColor = KIND_COLORS[node.kind] ?? CANVAS_COLORS.mutedFg;

  return (
    <DetailPanel
      data-ocid="entity_detail_panel"
      title={node.label}
      subtitle={node.id}
      badge={<RiskBadge risk={node.risk} />}
      footer={
        <div className="flex flex-col gap-2">
          {onOpenFull && (
            <button
              type="button"
              data-ocid="entity_detail_panel.open_full"
              onClick={() => onOpenFull(node.id)}
              className="w-full rounded-md border border-info/40 bg-info/10 py-1.5 text-xs font-medium text-info transition-smooth hover:bg-info/20"
            >
              Open full profile
            </button>
          )}
          {pathMode && (
            <div className="flex gap-2">
              {onSetPathSource && (
                <button
                  type="button"
                  onClick={() => onSetPathSource(node.id)}
                  className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/08 py-1.5 text-xs font-medium text-amber-400 transition-smooth hover:bg-amber-500/15"
                >
                  Set source
                </button>
              )}
              {onSetPathTarget && (
                <button
                  type="button"
                  onClick={() => onSetPathTarget(node.id)}
                  className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/08 py-1.5 text-xs font-medium text-amber-400 transition-smooth hover:bg-amber-500/15"
                >
                  Set target
                </button>
              )}
            </div>
          )}
        </div>
      }
      className={className}
    >
      {/* Kind badge */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider"
          style={{
            borderColor: `${kindColor}40`,
            background: `${kindColor}12`,
            color: kindColor,
          }}
        >
          {entityKindLabels[node.kind] ?? node.kind}
        </span>
        {node.suspicious && (
          <span className="inline-flex items-center gap-1 rounded-full border border-risk-critical/40 bg-risk-critical/10 px-2 py-0.5 text-[11px] text-risk-critical">
            <AlertTriangle className="size-3" aria-hidden />
            Flagged
          </span>
        )}
      </div>

      {/* Summary */}
      {node.summary && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          {node.summary}
        </p>
      )}

      {/* Aliases */}
      {node.alias && node.alias.length > 0 && (
        <div className="mb-3">
          <p className="label-caps mb-1 text-muted-foreground">Known aliases</p>
          <div className="flex flex-wrap gap-1">
            {node.alias.map((a) => (
              <span
                key={a}
                className="rounded border border-border bg-card px-1.5 py-0.5 font-mono-id text-[11px] text-foreground"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section: Graph metrics */}
      <Section
        icon={<Network className="size-3.5" aria-hidden />}
        title="Graph Metrics"
      >
        <DetailField
          label="Degree"
          value={node.degree !== undefined ? String(node.degree) : undefined}
          mono
        />
        <DetailField
          label="Betweenness"
          value={
            node.betweenness !== undefined
              ? node.betweenness.toFixed(4)
              : undefined
          }
          mono
        />
        <DetailField
          label="Closeness"
          value={
            node.closeness !== undefined ? node.closeness.toFixed(4) : undefined
          }
          mono
        />
        <DetailField
          label="Eigenvector"
          value={
            node.eigenvector !== undefined
              ? node.eigenvector.toFixed(4)
              : undefined
          }
          mono
        />
        <DetailField
          label="PageRank"
          value={
            node.pageRank !== undefined ? node.pageRank.toFixed(5) : undefined
          }
          mono
        />
        <DetailField label="Community" value={node.communityId} mono />
        <DetailField
          label="Risk"
          value={<RiskBadge risk={node.risk} showDot={false} />}
        />
        <DetailField
          label="Confidence"
          value={
            node.degreeCentrality !== undefined
              ? formatPercent(node.degreeCentrality * 100, 1)
              : undefined
          }
          mono
        />
      </Section>

      {/* Section: Relationships */}
      <Section
        icon={<Link2 className="size-3.5" aria-hidden />}
        title="Relationships"
      >
        <DetailField label="Incoming" value={String(incoming.length)} mono />
        <DetailField label="Outgoing" value={String(outgoing.length)} mono />
        <DetailField label="Total" value={String(allEdges.length)} mono />
        {relTypes.size > 0 && (
          <div className="mt-2 space-y-1">
            <p className="label-caps text-muted-foreground">Type breakdown</p>
            {[...relTypes.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([type, count]) => (
                <RelBar
                  key={type}
                  label={type}
                  count={count}
                  total={allEdges.length}
                />
              ))}
          </div>
        )}
      </Section>

      {/* Section: Identifiers */}
      {node.identifiers && node.identifiers.length > 0 && (
        <Section
          icon={<Fingerprint className="size-3.5" aria-hidden />}
          title="Identifiers"
        >
          {node.identifiers.map((id) => (
            <DetailField
              key={`${id.label}-${id.value}`}
              label={id.label}
              value={id.value}
              mono
            />
          ))}
        </Section>
      )}

      {/* Section: Temporal */}
      {(node.firstSeen || node.lastSeen) && (
        <Section
          icon={<Activity className="size-3.5" aria-hidden />}
          title="Temporal"
        >
          <DetailField
            label="First seen"
            value={node.firstSeen ? formatDate(node.firstSeen) : undefined}
            mono
          />
          <DetailField
            label="Last seen"
            value={node.lastSeen ? formatDate(node.lastSeen) : undefined}
            mono
          />
        </Section>
      )}

      {/* Section: Evidence */}
      {(node.evidenceCount !== undefined ||
        (node.tags && node.tags.length > 0)) && (
        <Section
          icon={<Fingerprint className="size-3.5" aria-hidden />}
          title="Evidence"
        >
          {node.evidenceCount !== undefined && (
            <DetailField
              label="Evidence items"
              value={String(node.evidenceCount)}
              mono
            />
          )}
          {node.tags && node.tags.length > 0 && (
            <div className="mt-2">
              <p className="label-caps mb-1 text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Section: Case context */}
      {node.linkedCaseIds && node.linkedCaseIds.length > 0 && (
        <Section
          icon={<BookOpen className="size-3.5" aria-hidden />}
          title="Case Context"
        >
          <DetailField
            label="Cases linked"
            value={String(node.linkedCaseIds.length)}
            mono
          />
          <div className="mt-1 space-y-0.5">
            {node.linkedCaseIds.slice(0, 5).map((cid) => (
              <p
                key={cid}
                className="font-mono-id text-[11px] text-muted-foreground"
              >
                {cid}
              </p>
            ))}
            {node.linkedCaseIds.length > 5 && (
              <p className="text-[11px] text-muted-foreground">
                +{node.linkedCaseIds.length - 5} more
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Section: Attributes */}
      {node.attributes && Object.keys(node.attributes).length > 0 && (
        <Section
          icon={<Target className="size-3.5" aria-hidden />}
          title="Attributes"
        >
          {Object.entries(node.attributes)
            .slice(0, 8)
            .map(([k, v]) => (
              <DetailField key={k} label={k} value={v} />
            ))}
        </Section>
      )}
    </DetailPanel>
  );
}

// ---------------------------------------------------------------------------
// Edge detail panel — shown when an edge is selected
// ---------------------------------------------------------------------------

export interface EdgeDetailPanelProps {
  edge: GraphEdge | null;
  sourceNode?: GraphNode | null;
  targetNode?: GraphNode | null;
  className?: string;
}

export function EdgeDetailPanel({
  edge,
  sourceNode,
  targetNode,
  className,
}: EdgeDetailPanelProps) {
  if (!edge) {
    return (
      <DetailPanel title="Nothing selected" className={className}>
        <p className="text-sm text-muted-foreground">
          Click an edge to inspect relationship details.
        </p>
      </DetailPanel>
    );
  }

  return (
    <DetailPanel
      data-ocid="edge_detail_panel"
      title={edge.label}
      subtitle={edge.id}
      badge={<RiskBadge risk={edge.risk} />}
      className={className}
    >
      <Section
        icon={<Link2 className="size-3.5" aria-hidden />}
        title="Relationship"
      >
        <DetailField label="Type" value={edge.label} />
        <DetailField
          label="Direction"
          value={edge.directed ? "Directed" : "Undirected"}
        />
        <DetailField
          label="Confidence"
          value={formatPercent(edge.weight * 100, 1)}
          mono
        />
        <DetailField
          label="Risk"
          value={<RiskBadge risk={edge.risk} showDot={false} />}
        />
        <DetailField label="Style" value={edge.lineStyle} />
      </Section>
      {sourceNode && (
        <Section
          icon={<Network className="size-3.5" aria-hidden />}
          title="Endpoints"
        >
          <DetailField label="Source" value={sourceNode.label} />
          <DetailField label="Target" value={targetNode?.label} />
        </Section>
      )}
      {edge.timestamp && (
        <Section
          icon={<Activity className="size-3.5" aria-hidden />}
          title="Temporal"
        >
          <DetailField
            label="Timestamp"
            value={formatDate(edge.timestamp)}
            mono
          />
        </Section>
      )}
    </DetailPanel>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h3 className="label-caps font-semibold text-foreground/80">{title}</h3>
      </div>
      <div className="pl-0">{children}</div>
    </div>
  );
}

function RelBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 rounded-full bg-primary/30"
        style={{ width: 64 }}
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-primary/70 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
