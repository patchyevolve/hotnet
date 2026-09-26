/**
 * GraphControls — analytical mode, colour mode, size metric, path analysis,
 * neighbourhood hop controls, and layout freeze toggle.
 *
 * Sits above the canvas on the NetworkPage. All state is lifted to the parent;
 * this component is purely presentational.
 */

import { Button } from "@/components/ui/button";
import { KIND_COLORS, RISK_COLORS } from "@/lib/crimenet/graphTransform";
import type { ColorMode, GraphMode, SizeMetric } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowRightLeft,
  Crosshair,
  Fingerprint,
  Layers,
  Network,
  Shield,
  Snowflake,
  Users,
  Wind,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

interface ModeOption {
  value: GraphMode;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const GRAPH_MODES: ModeOption[] = [
  {
    value: "network",
    label: "Network",
    icon: <Network className="size-3.5" aria-hidden />,
    description: "All entity relationships",
  },
  {
    value: "risk",
    label: "Risk",
    icon: <Shield className="size-3.5" aria-hidden />,
    description: "Emphasise risk levels",
  },
  {
    value: "community",
    label: "Community",
    icon: <Users className="size-3.5" aria-hidden />,
    description: "Cluster groupings",
  },
  {
    value: "evidence",
    label: "Evidence",
    icon: <Fingerprint className="size-3.5" aria-hidden />,
    description: "Evidence-backed edges",
  },
  {
    value: "temporal",
    label: "Temporal",
    icon: <Activity className="size-3.5" aria-hidden />,
    description: "Recency of activity",
  },
  {
    value: "centrality",
    label: "Centrality",
    icon: <Layers className="size-3.5" aria-hidden />,
    description: "Key actors by metric",
  },
];

interface ColorModeOption {
  value: ColorMode;
  label: string;
}

const COLOR_MODES: ColorModeOption[] = [
  { value: "entityType", label: "Entity Type" },
  { value: "riskLevel", label: "Risk Level" },
  { value: "community", label: "Community" },
  { value: "evidenceStrength", label: "Evidence" },
  { value: "caseAssociation", label: "Case" },
  { value: "confidence", label: "Confidence" },
  { value: "activity", label: "Activity" },
];

interface SizeMetricOption {
  value: SizeMetric;
  label: string;
}

const SIZE_METRICS: SizeMetricOption[] = [
  { value: "radius", label: "Degree (default)" },
  { value: "degree", label: "Degree count" },
  { value: "betweenness", label: "Betweenness" },
  { value: "pageRank", label: "PageRank" },
  { value: "riskScore", label: "Risk score" },
  { value: "evidenceCount", label: "Evidence count" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GraphControlsProps {
  graphMode: GraphMode;
  onGraphModeChange: (mode: GraphMode) => void;

  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;

  sizeMetric: SizeMetric;
  onSizeMetricChange: (metric: SizeMetric) => void;

  frozen: boolean;
  onFrozenChange: (frozen: boolean) => void;

  showCommunityHulls: boolean;
  onCommunityHullsChange: (show: boolean) => void;

  /** Path analysis controls */
  pathMode: boolean;
  onPathModeChange: (active: boolean) => void;
  pathSource: string | null;
  pathTarget: string | null;
  pathSourceLabel?: string;
  pathTargetLabel?: string;
  onClearPath: () => void;

  /** Neighbourhood hop controls */
  neighbourhoodHops: 1 | 2 | 3;
  onNeighbourhoodHopsChange: (hops: 1 | 2 | 3) => void;

  nodeCount: number;
  edgeCount: number;

  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphControls({
  graphMode,
  onGraphModeChange,
  colorMode,
  onColorModeChange,
  sizeMetric,
  onSizeMetricChange,
  frozen,
  onFrozenChange,
  showCommunityHulls,
  onCommunityHullsChange,
  pathMode,
  onPathModeChange,
  pathSource,
  pathTarget,
  pathSourceLabel,
  pathTargetLabel,
  onClearPath,
  neighbourhoodHops,
  onNeighbourhoodHopsChange,
  nodeCount,
  edgeCount,
  className,
}: GraphControlsProps) {
  return (
    <div
      data-ocid="graph_controls"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card/70 px-3 py-2.5",
        className,
      )}
    >
      {/* Graph mode pill strip */}
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Graph mode"
      >
        <span className="label-caps mr-1 text-muted-foreground">Mode</span>
        {GRAPH_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            data-ocid={`graph_controls.mode.${mode.value}`}
            onClick={() => onGraphModeChange(mode.value)}
            title={mode.description}
            aria-pressed={graphMode === mode.value}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-smooth",
              graphMode === mode.value
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent",
            )}
          >
            {mode.icon}
            {mode.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border/60" aria-hidden />

      {/* Colour mode */}
      <label className="flex items-center gap-2">
        <span className="label-caps text-muted-foreground">Colour</span>
        <select
          data-ocid="graph_controls.color_mode"
          value={colorMode}
          onChange={(e) => onColorModeChange(e.target.value as ColorMode)}
          className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground outline-none transition-smooth focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {COLOR_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {/* Size metric */}
      <label className="flex items-center gap-2">
        <span className="label-caps text-muted-foreground">Size</span>
        <select
          data-ocid="graph_controls.size_metric"
          value={sizeMetric}
          onChange={(e) => onSizeMetricChange(e.target.value as SizeMetric)}
          className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground outline-none transition-smooth focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {SIZE_METRICS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="h-5 w-px bg-border/60" aria-hidden />

      {/* Neighbourhood hops */}
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Neighbourhood hops"
      >
        <span className="label-caps mr-0.5 text-muted-foreground">Hops</span>
        {([1, 2, 3] as const).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onNeighbourhoodHopsChange(h)}
            aria-pressed={neighbourhoodHops === h}
            className={cn(
              "flex size-6 items-center justify-center rounded text-xs font-medium transition-smooth",
              neighbourhoodHops === h
                ? "bg-primary/15 text-primary border border-primary/30"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {h}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border/60" aria-hidden />

      {/* Path analysis */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-ocid="graph_controls.path_mode"
          onClick={() => {
            onPathModeChange(!pathMode);
            if (pathMode) onClearPath();
          }}
          aria-pressed={pathMode}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-smooth",
            pathMode
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-border text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
          )}
        >
          <ArrowRightLeft className="size-3.5" aria-hidden />
          Path
        </button>

        {pathMode && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/08 px-2 py-1">
            <PathPill label={pathSourceLabel} placeholder="select source" />
            <span className="text-[10px] text-muted-foreground">→</span>
            <PathPill label={pathTargetLabel} placeholder="select target" />
            {(pathSource || pathTarget) && (
              <button
                type="button"
                onClick={onClearPath}
                aria-label="Clear path"
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Community hulls toggle */}
      <button
        type="button"
        onClick={() => onCommunityHullsChange(!showCommunityHulls)}
        aria-pressed={showCommunityHulls}
        title="Toggle community boundaries"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-smooth",
          showCommunityHulls
            ? "border-info/40 bg-info/10 text-info"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Crosshair className="size-3.5" aria-hidden />
        Hulls
      </button>

      {/* Freeze layout */}
      <button
        type="button"
        data-ocid="graph_controls.freeze"
        onClick={() => onFrozenChange(!frozen)}
        aria-pressed={frozen}
        title={frozen ? "Unfreeze layout" : "Freeze layout"}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-smooth",
          frozen
            ? "border-info/40 bg-info/10 text-info"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {frozen ? (
          <Snowflake className="size-3.5" aria-hidden />
        ) : (
          <Wind className="size-3.5" aria-hidden />
        )}
        {frozen ? "Frozen" : "Live"}
      </button>

      {/* Stats */}
      <span className="ml-auto font-mono-id text-[11px] tabular-nums text-muted-foreground">
        {nodeCount}N · {edgeCount}E
      </span>
    </div>
  );
}

function PathPill({
  label,
  placeholder,
}: {
  label?: string;
  placeholder: string;
}) {
  return (
    <span
      className={cn(
        "max-w-[90px] truncate text-[11px]",
        label ? "text-amber-300 font-medium" : "italic text-muted-foreground",
      )}
    >
      {label ?? placeholder}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Colour swatch helper — used externally for legend
// ---------------------------------------------------------------------------

export { KIND_COLORS, RISK_COLORS };
