import type { MapData, RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const riskColor: Record<RiskLevel, string> = {
  critical: "oklch(var(--risk-critical))",
  high: "oklch(var(--risk-high))",
  medium: "oklch(var(--risk-medium))",
  low: "oklch(var(--risk-low))",
};

interface MapCanvasProps {
  data: MapData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

export function MapCanvas({
  data,
  selectedId,
  onSelect,
  className,
}: MapCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const markerMap = useMemo(
    () => new Map(data.markers.map((marker) => [marker.id, marker])),
    [data.markers],
  );
  const activeId = hovered ?? selectedId ?? null;

  return (
    <div
      data-ocid="map_canvas"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(oklch(var(--border)) 1px, transparent 1px), linear-gradient(90deg, oklch(var(--border)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.4,
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, color-mix(in oklch, oklch(var(--info)) 8%, transparent), transparent 62%)",
        }}
        aria-hidden
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="relative h-full w-full"
        role="img"
        aria-label="Geospatial incident map"
      >
        {data.links.map((link) => {
          const from = markerMap.get(link.from);
          const to = markerMap.get(link.to);
          if (!from || !to) return null;
          const isActive = activeId === link.from || activeId === link.to;
          return (
            <line
              key={link.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="oklch(var(--info))"
              strokeWidth={isActive ? 0.6 : 0.3}
              strokeOpacity={isActive ? 0.85 : 0.3}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {data.markers.map((marker) => {
        const isActive = activeId === marker.id;
        return (
          <button
            key={marker.id}
            type="button"
            data-ocid={`map_canvas.marker.${marker.id}`}
            onClick={() => onSelect?.(marker.id)}
            onMouseEnter={() => setHovered(marker.id)}
            onMouseLeave={() => setHovered(null)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            aria-label={`${marker.label} — ${marker.district}`}
          >
            <span
              className={cn(
                "block rounded-full border-2 transition-smooth",
                isActive ? "size-4" : "size-3",
              )}
              style={{
                borderColor: riskColor[marker.risk],
                backgroundColor: "oklch(var(--card))",
                boxShadow: isActive
                  ? `0 0 0 5px color-mix(in oklab, ${riskColor[marker.risk]} 13%, transparent)`
                  : undefined,
              }}
            />
            {isActive ? (
              <span className="absolute left-1/2 top-full mt-1.5 w-max max-w-[10rem] -translate-x-1/2 truncate rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground shadow-xs">
                {marker.label}
              </span>
            ) : null}
          </button>
        );
      })}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-2 backdrop-blur">
        {(["critical", "high", "medium", "low"] as RiskLevel[]).map((risk) => (
          <span
            key={risk}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: riskColor[risk] }}
              aria-hidden
            />
            {risk}
          </span>
        ))}
      </div>
    </div>
  );
}
