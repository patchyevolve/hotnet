import type {
  EntityKind,
  NetworkGraph,
  NetworkNode,
  RiskLevel,
} from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { Crosshair, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

const riskColor: Record<RiskLevel, string> = {
  critical: "var(--risk-critical)",
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
};

const kindGlyph: Record<EntityKind, string> = {
  person: "P",
  phone: "T",
  account: "A",
  vehicle: "V",
  organization: "O",
  location: "L",
  amount: "₹",
  date: "D",
  event: "E",
  device: "M",
};

interface GraphCanvasProps {
  graph: NetworkGraph;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onExpand?: (id: string) => void;
  className?: string;
}

export function GraphCanvas({
  graph,
  selectedId,
  onSelect,
  onExpand,
  className,
}: GraphCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  const activeId = hovered ?? selectedId ?? null;

  // Connected edges of whatever is active — these carry the relationship
  // labels, so only a handful are ever drawn.
  const activeEdges = useMemo(
    () =>
      activeId
        ? graph.edges.filter(
            (edge) => edge.source === activeId || edge.target === activeId,
          )
        : [],
    [activeId, graph.edges],
  );

  // Label only the hubs at rest. Printing every label on a 200-node graph is a
  // grey smear; below a few dozen nodes there is room for all of them.
  const showEveryLabel = graph.nodes.length <= 40;
  const isHub = (node: NetworkNode) => node.radius >= 6;

  // The API's `radius` is a degree weight, not a pixel size: it runs from 2.5
  // to 9.5, and a 2.5px circle cannot hold the 11px glyph that identifies the
  // node — the letter just spills out and the circle vanishes. Map the weight
  // onto a diameter that always fits the glyph while keeping hubs visibly
  // larger than leaves.
  const { minRadius, maxRadius } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const node of graph.nodes) {
      if (node.radius < min) min = node.radius;
      if (node.radius > max) max = node.radius;
    }
    if (!Number.isFinite(min)) return { minRadius: 0, maxRadius: 0 };
    return { minRadius: min, maxRadius: max };
  }, [graph.nodes]);

  const nodeSize = useCallback(
    (node: NetworkNode) => {
      const span = maxRadius - minRadius;
      const t = span <= 0 ? 0.5 : (node.radius - minRadius) / span;
      return Math.round(18 + t * 12);
    },
    [maxRadius, minRadius],
  );

  // Once the canvas is dense, resting hub labels land on top of each other in
  // the core. Hovering or selecting still names a node, and zooming in is the
  // signal that there is room to print names again.
  const showHubLabels = showEveryLabel || zoom >= 1.2;

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const focusNode = useCallback(() => {
    const node = selectedId ? nodeMap.get(selectedId) : undefined;
    if (!node) return;
    setZoom(1.6);
    setPan({ x: 50 - node.x, y: 50 - node.y });
  }, [nodeMap, selectedId]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setPan((current) => ({
      x: current.x + dx * 0.15,
      y: current.y + dy * 0.15,
    }));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      data-ocid="graph_canvas"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        role="presentation"
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="relative h-full w-full"
          role="img"
          aria-label="Entity link analysis graph"
        >
          <g
            transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
            style={{ transformOrigin: "50px 50px" }}
          >
            {graph.edges.map((edge) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const isActive =
                activeId === edge.source || activeId === edge.target;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={riskColor[edge.risk]}
                  // With non-scaling-stroke these are screen pixels: the old
                  // 0.35px at 0.35 opacity drew every edge as an invisible
                  // hairline, which is why the graph read as loose letters.
                  strokeWidth={isActive ? 1.8 : 0.9}
                  strokeOpacity={isActive ? 0.95 : 0.5}
                  strokeDasharray={edge.weight >= 3 ? undefined : "2 1.5"}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        </svg>
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})`,
            transformOrigin: "50% 50%",
          }}
        >
          {activeEdges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            return (
              <span
                key={`label-${edge.id}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-border bg-card/95 px-1.5 py-0.5 text-[10px] text-foreground shadow-xs"
                style={{
                  left: `${(source.x + target.x) / 2}%`,
                  top: `${(source.y + target.y) / 2}%`,
                }}
              >
                {edge.label}
              </span>
            );
          })}
          {graph.nodes.map((node) => {
            const isActive = activeId === node.id;
            const size = nodeSize(node);
            return (
              <button
                key={node.id}
                type="button"
                data-ocid={`graph_canvas.node.${node.id}`}
                onClick={() => onSelect?.(node.id)}
                onDoubleClick={() => onExpand?.(node.id)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-full outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                aria-label={`${node.label} — ${node.kind}`}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 font-mono-id text-[11px] font-semibold transition-smooth",
                    isActive ? "scale-110" : "scale-100",
                  )}
                  style={{
                    width: size,
                    height: size,
                    borderColor: riskColor[node.risk],
                    backgroundColor: "var(--card)",
                    color: riskColor[node.risk],
                    boxShadow: isActive
                      ? `0 0 0 4px ${riskColor[node.risk]}22`
                      : undefined,
                  }}
                >
                  {kindGlyph[node.kind]}
                </span>
                {isActive || (showHubLabels && (showEveryLabel || isHub(node))) ? (
                  <span
                    className={cn(
                      "max-w-[7rem] truncate rounded px-1.5 py-0.5 text-[10px] transition-smooth",
                      isActive
                        ? "bg-card text-foreground"
                        : "bg-card/70 text-muted-foreground",
                    )}
                  >
                    {node.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          type="button"
          data-ocid="graph_canvas.zoom_in_button"
          onClick={() => setZoom((value) => Math.min(value + 0.2, 3))}
          aria-label="Zoom in"
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground backdrop-blur transition-smooth hover:text-foreground"
        >
          <ZoomIn className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          data-ocid="graph_canvas.zoom_out_button"
          onClick={() => setZoom((value) => Math.max(value - 0.2, 0.5))}
          aria-label="Zoom out"
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground backdrop-blur transition-smooth hover:text-foreground"
        >
          <ZoomOut className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          data-ocid="graph_canvas.focus_button"
          onClick={focusNode}
          aria-label="Focus node"
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground backdrop-blur transition-smooth hover:text-foreground"
        >
          <Crosshair className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          data-ocid="graph_canvas.expand_button"
          onClick={() => selectedId && onExpand?.(selectedId)}
          aria-label="Expand network"
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground backdrop-blur transition-smooth hover:text-foreground"
        >
          <Maximize2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          data-ocid="graph_canvas.reset_button"
          onClick={reset}
          aria-label="Reset view"
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground backdrop-blur transition-smooth hover:text-foreground"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
