import {
  type HexCell,
  INDIA_BBOX,
  type MapView,
  buildHexCells,
  cellIdAt,
  clampZoom,
  fitBounds,
  indiaOutline,
  indiaStates,
  lonLatToWorld,
  polygonsToPath,
  viewScale,
  worldToScreen,
  zoomAt,
} from "@/lib/crimenet/geo";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import type { MapData, MapMarker, RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { Crosshair, Minus, Plus } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const riskColor: Record<RiskLevel, string> = {
  critical: "oklch(var(--risk-critical))",
  high: "oklch(var(--risk-high))",
  medium: "oklch(var(--risk-medium))",
  low: "oklch(var(--risk-low))",
};

const riskRank: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const AGGREGATE_ZOOM = 7;
const DEFAULT_SIZE = { w: 1100, h: 560 };

const OUTLINE_PATH = polygonsToPath(indiaOutline.coordinates);
const STATES_PATH = indiaStates.features
  .map((feature) => polygonsToPath(feature.geometry.coordinates))
  .join(" ");

interface PositionedMarker {
  marker: MapMarker;
  wx: number;
  wy: number;
}

interface PinGroup {
  key: string;
  members: PositionedMarker[];
  wx: number;
  wy: number;
  risk: RiskLevel;
  topId: string;
}

interface MapCanvasProps {
  data: MapData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showHexes?: boolean;
  className?: string;
}

function worstMember(members: PositionedMarker[]): {
  risk: RiskLevel;
  topId: string;
} {
  let top = members[0];
  for (const member of members) {
    if (riskRank[member.marker.risk] > riskRank[top.marker.risk]) {
      top = member;
    }
  }
  return { risk: top.marker.risk, topId: top.marker.id };
}

export function MapCanvas({
  data,
  selectedId,
  onSelect,
  showHexes = true,
  className,
}: MapCanvasProps) {
  const { language } = useRole();
  const strings = getStrings(language);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refitRef = useRef(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    sx: number;
    sy: number;
  } | null>(null);
  const draggedRef = useRef(false);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [view, setView] = useState<MapView>(() =>
    fitBounds(INDIA_BBOX, DEFAULT_SIZE.w, DEFAULT_SIZE.h),
  );
  const [hovered, setHovered] = useState<string | null>(null);

  const positioned = useMemo(() => {
    const out: PositionedMarker[] = [];
    for (const marker of data.markers) {
      if (
        typeof marker.latitude === "number" &&
        typeof marker.longitude === "number"
      ) {
        const { wx, wy } = lonLatToWorld(marker.longitude, marker.latitude);
        out.push({ marker, wx, wy });
      }
    }
    return out;
  }, [data.markers]);

  const markerMap = useMemo(
    () => new Map(positioned.map((item) => [item.marker.id, item])),
    [positioned],
  );

  const links = useMemo(
    () =>
      data.links.flatMap((link) => {
        const from = markerMap.get(link.from);
        const to = markerMap.get(link.to);
        if (!from || !to) return [];
        return [{ link, from, to }];
      }),
    [data.links, markerMap],
  );

  const zones = useMemo(
    () =>
      positioned.map((item) => ({
        id: item.marker.id,
        latitude: item.marker.latitude ?? 0,
        longitude: item.marker.longitude ?? 0,
        risk: item.marker.risk,
      })),
    [positioned],
  );

  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const quarter = size.w / viewScale(view) / 4;
  const cellsKey = `${Math.round(view.wx / Math.max(quarter, 1e-9))}:${Math.round(
    view.wy / Math.max(quarter, 1e-9),
  )}:${size.w}x${size.h}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: cellsKey is the quantized pan/zoom bucket; live view/size flow through the refs so the lattice only rebuilds when the covered area changes.
  const grid = useMemo(
    () =>
      buildHexCells(
        viewRef.current,
        sizeRef.current.w,
        sizeRef.current.h,
        zones,
      ),
    [cellsKey, zones],
  );

  const groups = useMemo(() => {
    if (view.zoom >= AGGREGATE_ZOOM) return null;
    const byCell = new Map<string, PositionedMarker[]>();
    for (const item of positioned) {
      const key = cellIdAt(
        item.marker.longitude ?? 0,
        item.marker.latitude ?? 0,
        grid.res,
      );
      const members = byCell.get(key);
      if (members) members.push(item);
      else byCell.set(key, [item]);
    }
    const out: PinGroup[] = [];
    for (const [key, members] of byCell) {
      const { risk, topId } = worstMember(members);
      out.push({
        key,
        members,
        wx: members.reduce((sum, item) => sum + item.wx, 0) / members.length,
        wy: members.reduce((sum, item) => sum + item.wy, 0) / members.length,
        risk,
        topId,
      });
    }
    return out;
  }, [positioned, view.zoom, grid.res]);

  const activeId = hovered ?? selectedId ?? null;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((current) =>
          current.w === rect.width && current.h === rect.height
            ? current
            : { w: rect.width, h: rect.height },
        );
        if (!refitRef.current) {
          refitRef.current = true;
          setView(fitBounds(INDIA_BBOX, rect.width, rect.height));
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView((current) =>
        zoomAt(current, px, py, -event.deltaY * 0.0025, size.w, size.h),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [size]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    draggedRef.current = false;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      sx: event.clientX,
      sy: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    if (
      !draggedRef.current &&
      (Math.abs(event.clientX - last.sx) > 4 ||
        Math.abs(event.clientY - last.sy) > 4)
    ) {
      draggedRef.current = true;
    }
    if (dx === 0 && dy === 0) return;
    dragRef.current = { ...last, x: event.clientX, y: event.clientY };
    const scale = viewScale(view);
    setView((current) => ({
      ...current,
      wx: current.wx - dx / scale,
      wy: current.wy - dy / scale,
    }));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const consumeDrag = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return true;
    }
    return false;
  };

  const zoomBy = (delta: number) =>
    setView((current) => ({
      ...current,
      zoom: clampZoom(current.zoom + delta),
    }));

  const scale = viewScale(view);
  const tx = size.w / 2 - view.wx * scale;
  const ty = size.h / 2 - view.wy * scale;

  const selectCell = (cell: HexCell) => {
    if (consumeDrag() || cell.zones.length === 0) return;
    let topId = cell.zones[0];
    let topRisk = -1;
    for (const zoneId of cell.zones) {
      const item = markerMap.get(zoneId);
      if (item && riskRank[item.marker.risk] > topRisk) {
        topRisk = riskRank[item.marker.risk];
        topId = zoneId;
      }
    }
    onSelect?.(topId);
  };

  const selectedCellIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const item = markerMap.get(selectedId);
    if (!item) return new Set<string>();
    return new Set(
      grid.cells
        .filter((cell) => cell.zones.includes(selectedId))
        .map((cell) => cell.id),
    );
  }, [grid.cells, markerMap, selectedId]);

  return (
    <div
      ref={containerRef}
      data-ocid="map_canvas"
      className={cn(
        "relative touch-none select-none overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Geospatial incident map"
      >
        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <path
            data-ocid="map_canvas.india_outline"
            d={OUTLINE_PATH}
            fill="oklch(var(--muted) / 0.35)"
            stroke="none"
          />
          {showHexes
            ? grid.cells.map((cell) => {
                const isSelected = selectedCellIds.has(cell.id);
                return (
                  <polygon
                    key={cell.id}
                    data-ocid={`map_canvas.hex.${cell.id}`}
                    data-risk={cell.risk ?? "none"}
                    points={cell.points}
                    fill={
                      cell.risk
                        ? riskColor[cell.risk]
                        : "oklch(var(--muted) / 0.10)"
                    }
                    fillOpacity={cell.risk ? 0.42 : 0.3}
                    stroke={
                      isSelected
                        ? "oklch(var(--foreground) / 0.9)"
                        : "oklch(var(--border))"
                    }
                    strokeWidth={isSelected ? 1.6 : 0.6}
                    vectorEffect="non-scaling-stroke"
                    className={
                      cell.zones.length > 0 ? "cursor-pointer" : undefined
                    }
                    role={cell.zones.length > 0 ? "button" : undefined}
                    tabIndex={cell.zones.length > 0 ? 0 : undefined}
                    aria-label={`${strings.risk}: ${cell.risk ?? "-"} (${cell.id})`}
                    onClick={() => selectCell(cell)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectCell(cell);
                      }
                    }}
                  />
                );
              })
            : null}
          {links.map(({ link, from, to }) => {
            const isActive = activeId === link.from || activeId === link.to;
            return (
              <line
                key={link.id}
                x1={from.wx}
                y1={from.wy}
                x2={to.wx}
                y2={to.wy}
                stroke="oklch(var(--info))"
                strokeWidth={isActive ? 0.7 : 0.3}
                strokeOpacity={isActive ? 0.9 : 0.35}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <path
            data-ocid="map_canvas.india_states"
            d={STATES_PATH}
            fill="none"
            stroke="oklch(var(--muted-foreground) / 0.55)"
            strokeWidth={0.7}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={OUTLINE_PATH}
            fill="none"
            stroke="oklch(var(--foreground) / 0.65)"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {groups
        ? groups.map((group) => {
            const pos = worldToScreen(group.wx, group.wy, view, size.w, size.h);
            const isActive = activeId === group.topId;
            return (
              <button
                key={group.key}
                type="button"
                data-ocid={`map_canvas.pin_group.${group.key}`}
                onClick={() => {
                  if (consumeDrag()) return;
                  onSelect?.(group.topId);
                }}
                onMouseEnter={() => setHovered(group.topId)}
                onMouseLeave={() => setHovered(null)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: pos.x, top: pos.y }}
                aria-label={`${group.members.length} ${strings.markers}`}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-smooth",
                    isActive ? "size-6" : "size-5",
                  )}
                  style={{
                    borderColor: riskColor[group.risk],
                    backgroundColor: "oklch(var(--card))",
                    color: riskColor[group.risk],
                    boxShadow: isActive
                      ? `0 0 0 5px color-mix(in oklab, ${riskColor[group.risk]} 13%, transparent)`
                      : undefined,
                  }}
                >
                  {group.members.length}
                </span>
                {isActive ? (
                  <span className="absolute left-1/2 top-full mt-1.5 w-max max-w-[10rem] -translate-x-1/2 truncate rounded border border-border bg-card px-2 py-1 text-[10px] text-foreground shadow-xs">
                    {markerMap.get(group.topId)?.marker.label ??
                      String(group.members.length)}
                  </span>
                ) : null}
              </button>
            );
          })
        : positioned.map(({ marker, wx, wy }) => {
            const pos = worldToScreen(wx, wy, view, size.w, size.h);
            const isActive = activeId === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                data-ocid={`map_canvas.marker.${marker.id}`}
                onClick={() => {
                  if (consumeDrag()) return;
                  onSelect?.(marker.id);
                }}
                onMouseEnter={() => setHovered(marker.id)}
                onMouseLeave={() => setHovered(null)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: pos.x, top: pos.y }}
                aria-label={`${marker.label} — ${marker.district ?? ""}`}
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
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
        <div
          data-ocid="map_canvas.zoom_level"
          data-zoom={view.zoom.toFixed(1)}
          data-res={grid.res}
          className="rounded border border-border bg-card/90 px-2 py-1 font-mono-id text-[10px] text-muted-foreground backdrop-blur"
        >
          z{view.zoom.toFixed(1)} · H3 r{grid.res}
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-border bg-card/90 p-1 backdrop-blur">
          <button
            type="button"
            data-ocid="map_canvas.zoom_in"
            aria-label={strings.zoomIn}
            title={strings.zoomIn}
            onClick={() => zoomBy(1)}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            data-ocid="map_canvas.zoom_out"
            aria-label={strings.zoomOut}
            title={strings.zoomOut}
            onClick={() => zoomBy(-1)}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            data-ocid="map_canvas.reset_view"
            aria-label={strings.resetView}
            title={strings.resetView}
            onClick={() => setView(fitBounds(INDIA_BBOX, size.w, size.h))}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Crosshair className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
