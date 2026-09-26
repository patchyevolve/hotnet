/**
 * GraphLegend — compact, dynamic legend that updates with the active
 * ColorMode and GraphMode. Always visible; uses minimal vertical space.
 */

import { entityKindLabels, riskLabels } from "@/lib/crimenet/format";
import {
  CANVAS_COLORS,
  KIND_COLORS,
  RISK_COLORS,
  resolveEdgeStyle,
} from "@/lib/crimenet/graphTransform";
import type { ColorMode, GraphEdge, GraphNode } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SVG shape icons — match the Canvas shapes exactly
// ---------------------------------------------------------------------------

function ShapeIcon({
  kind,
  color,
  size = 18,
}: {
  kind: string;
  color: string;
  size?: number;
}) {
  const s = size;
  const c = s / 2;
  const r = s * 0.38;

  switch (kind) {
    case "person":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "organization":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <rect
            x={c - r * 1.1}
            y={c - r * 0.8}
            width={r * 2.2}
            height={r * 1.6}
            rx={r * 0.3}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "location":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <polygon
            points={`${c},${c - r} ${c + r * 0.8},${c} ${c},${c + r} ${c - r * 0.8},${c}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "account":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          {[0, 1, 2, 3, 4, 5]
            .map((i) => {
              const angle = (Math.PI / 3) * i - Math.PI / 6;
              return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
            })
            .map((pt, i, arr) => (
              <line
                key={i}
                x1={arr[i].x}
                y1={arr[i].y}
                x2={arr[(i + 1) % 6].x}
                y2={arr[(i + 1) % 6].y}
                stroke={color}
                strokeWidth={1.5}
              />
            ))}
        </svg>
      );
    case "phone":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <rect
            x={c - r * 0.7}
            y={c - r}
            width={r * 1.4}
            height={r * 1.8}
            rx={r * 0.28}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "vehicle":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <rect
            x={c - r * 1.2}
            y={c - r * 0.7}
            width={r * 2.4}
            height={r * 1.4}
            rx={r * 0.16}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "device":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <rect
            x={c - r}
            y={c - r}
            width={r * 2}
            height={r * 2}
            rx={r * 0.12}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case "event":
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          {[0, 1, 2, 3, 4].map((i) => {
            const a1 = ((Math.PI * 2) / 5) * i - Math.PI / 2;
            const a2 = a1 + Math.PI / 5;
            const rx = r,
              ry = r * 0.45;
            return (
              <line
                key={i}
                x1={c + rx * Math.cos(a1)}
                y1={c + rx * Math.sin(a1)}
                x2={c + ry * Math.cos(a2)}
                y2={c + ry * Math.sin(a2)}
                stroke={color}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} aria-hidden viewBox={`0 0 ${s} ${s}`}>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Edge style icon
// ---------------------------------------------------------------------------

function EdgeIcon({
  style,
  color,
  directed = false,
  width = 36,
}: {
  style: "solid" | "dashed" | "dotted" | "thick-solid";
  color: string;
  directed?: boolean;
  width?: number;
}) {
  const y = 8;
  const sw = style === "thick-solid" ? 2.5 : 1.4;
  const dash =
    style === "dashed" ? "5,3" : style === "dotted" ? "2,3" : undefined;

  return (
    <svg width={width} height={16} aria-hidden viewBox={`0 0 ${width} 16`}>
      <line
        x1={4}
        y1={y}
        x2={width - (directed ? 8 : 4)}
        y2={y}
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={dash}
      />
      {directed && (
        <polygon
          points={`${width - 3},${y} ${width - 9},${y - 3.5} ${width - 9},${y + 3.5}`}
          fill={color}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GraphLegendProps {
  colorMode: ColorMode;
  /** Unique edge labels actually present in the current filtered graph. */
  edgeLabels: string[];
  communityColors?: Record<string, string>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphLegend({
  colorMode,
  edgeLabels,
  communityColors = {},
  className,
}: GraphLegendProps) {
  const entityKinds = Object.keys(entityKindLabels) as Array<
    keyof typeof entityKindLabels
  >;

  return (
    <div
      data-ocid="graph_legend"
      className={cn(
        "flex flex-wrap items-start gap-x-6 gap-y-3 rounded-lg border border-border bg-card/50 px-4 py-3",
        className,
      )}
    >
      {/* Node shapes section */}
      <div>
        <p className="label-caps mb-1.5 text-muted-foreground">Entity shapes</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {entityKinds.map((kind) => {
            const color =
              colorMode === "entityType"
                ? KIND_COLORS[kind]
                : colorMode === "riskLevel"
                  ? RISK_COLORS.low
                  : CANVAS_COLORS.mutedFg;
            return (
              <span key={kind} className="flex items-center gap-1.5">
                <ShapeIcon kind={kind} color={color} />
                <span className="text-[11px] text-muted-foreground">
                  {entityKindLabels[kind]}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="w-px self-stretch bg-border/40" aria-hidden />

      {/* Colour dimension */}
      <div>
        <p className="label-caps mb-1.5 text-muted-foreground">
          Colour — {colorModeLabel(colorMode)}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {colorMode === "entityType" &&
            entityKinds.map((kind) => (
              <Swatch
                key={kind}
                color={KIND_COLORS[kind]}
                label={entityKindLabels[kind]}
              />
            ))}

          {colorMode === "riskLevel" && (
            <>
              <Swatch
                color={RISK_COLORS.critical}
                label={riskLabels.critical}
              />
              <Swatch color={RISK_COLORS.high} label={riskLabels.high} />
              <Swatch color={RISK_COLORS.medium} label={riskLabels.medium} />
              <Swatch color={RISK_COLORS.low} label={riskLabels.low} />
            </>
          )}

          {colorMode === "community" &&
            Object.entries(communityColors).map(([id, color]) => (
              <Swatch key={id} color={color} label={`C-${id}`} />
            ))}

          {(colorMode === "confidence" || colorMode === "evidenceStrength") && (
            <>
              <Swatch color="#fb923c" label="High" />
              <Swatch color="#facc15" label="Medium" />
              <Swatch color="#6b9dea" label="Low" />
              <Swatch color={CANVAS_COLORS.mutedFg} label="None" />
            </>
          )}

          {colorMode === "caseAssociation" && (
            <>
              <Swatch color={KIND_COLORS.organization} label="Linked to case" />
              <Swatch color={CANVAS_COLORS.mutedFg} label="No case link" />
            </>
          )}

          {colorMode === "activity" && (
            <>
              <Swatch color={KIND_COLORS.event} label="Recent activity" />
              <Swatch color={CANVAS_COLORS.mutedFg} label="No timestamp" />
            </>
          )}
        </div>
      </div>

      {/* Edge types — drawn from actual graph edges */}
      {edgeLabels.length > 0 && (
        <>
          <div className="w-px self-stretch bg-border/40" aria-hidden />
          <div>
            <p className="label-caps mb-1.5 text-muted-foreground">
              Relationship styles
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {edgeLabels.slice(0, 12).map((label) => {
                const style = resolveEdgeStyle(label);
                return (
                  <span key={label} className="flex items-center gap-1.5">
                    <EdgeIcon
                      style={style.lineStyle}
                      color={CANVAS_COLORS.mutedFg}
                      directed={style.directed}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {label}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Risk indicator key */}
      <div className="w-px self-stretch bg-border/40" aria-hidden />
      <div>
        <p className="label-caps mb-1.5 text-muted-foreground">Risk border</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {(["critical", "high", "medium", "low"] as const).map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: RISK_COLORS[r] }}
                aria-hidden
              />
              <span className="text-[11px] capitalize text-muted-foreground">
                {riskLabels[r]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Selected / path state */}
      <div className="w-px self-stretch bg-border/40" aria-hidden />
      <div>
        <p className="label-caps mb-1.5 text-muted-foreground">States</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          <Swatch color={CANVAS_COLORS.selectedRing} label="Selected" ring />
          <Swatch color={CANVAS_COLORS.pathHighlight} label="Path" ring />
          <Swatch color={CANVAS_COLORS.mutedFg} label="Dimmed" muted />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Swatch({
  color,
  label,
  ring = false,
  muted = false,
}: {
  color: string;
  label: string;
  ring?: boolean;
  muted?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block size-2.5 rounded-sm",
          ring && "rounded-full ring-1 ring-offset-1 ring-offset-background",
        )}
        style={{
          background: muted ? "transparent" : color,
          border: ring
            ? `2px solid ${color}`
            : muted
              ? `1.5px solid ${color}`
              : "none",
          opacity: muted ? 0.45 : 1,
        }}
        aria-hidden
      />
      <span
        className={cn(
          "text-[11px] text-muted-foreground",
          muted && "opacity-50",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function colorModeLabel(mode: ColorMode): string {
  const labels: Record<ColorMode, string> = {
    entityType: "entity type",
    riskLevel: "risk level",
    community: "community",
    evidenceStrength: "evidence",
    caseAssociation: "case link",
    confidence: "confidence",
    activity: "activity",
  };
  return labels[mode] ?? mode;
}
