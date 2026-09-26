/**
 * GraphCanvas — production-quality 2D criminal network analysis renderer.
 *
 * Renders onto an HTML Canvas element for performance (500–1000+ nodes).
 * All visual logic lives in this file's draw* helpers; React state manages
 * interaction and viewport only.
 *
 * Accepts the legacy NetworkGraph prop shape (backward compat for
 * CaseWorkbenchPage) AND the rich EnrichedGraph + selection/mode props used by
 * NetworkPage. When passed a plain NetworkGraph it builds a minimal
 * EnrichedGraph locally.
 */

import {
  CANVAS_COLORS,
  KIND_COLORS,
  RISK_COLORS,
  buildCommunityColors,
  convexHull,
  nodePxRadius,
  resolveNodeColor,
} from "@/lib/crimenet/graphTransform";
import type {
  ColorMode,
  EnrichedGraph,
  GraphEdge,
  GraphNode,
  GraphSelectionState,
  NetworkGraph,
  RiskLevel,
  SizeMetric,
  ViewTransform,
} from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import {
  Crosshair,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Snowflake,
  Wind,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SCALE = 0.15;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.22;
const LABEL_MIN_SCALE = 0.45; // below this scale, labels are culled
const ARROW_LEN = 9;
const ARROW_ANGLE = 0.42; // radians
const GRID_SPACING = 60; // canvas-space pixels between grid lines

// ---------------------------------------------------------------------------
// Shape drawing helpers
// ---------------------------------------------------------------------------

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  radius: number,
) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.8, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.8, cy);
  ctx.closePath();
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  cx: number,
  cy: number,
  r: number,
) {
  switch (node.kind) {
    case "person":
      drawCircle(ctx, cx, cy, r);
      break;
    case "organization":
      drawRoundedRect(ctx, cx, cy, r * 2.2, r * 1.6, r * 0.35);
      break;
    case "location":
      drawDiamond(ctx, cx, cy, r * 1.1);
      break;
    case "account":
      drawHexagon(ctx, cx, cy, r);
      break;
    case "phone":
      drawRoundedRect(ctx, cx, cy, r * 1.4, r * 1.8, r * 0.3);
      break;
    case "device":
      drawRoundedRect(ctx, cx, cy, r * 1.8, r * 1.8, r * 0.12);
      break;
    case "vehicle":
      drawRoundedRect(ctx, cx, cy, r * 2.4, r * 1.4, r * 0.18);
      break;
    case "event":
      drawStar(ctx, cx, cy, r, r * 0.45);
      break;
    case "amount":
      drawCircle(ctx, cx, cy, r);
      break;
    case "date":
      drawCircle(ctx, cx, cy, r * 0.85);
      break;
    default:
      drawCircle(ctx, cx, cy, r);
  }
}

// ---------------------------------------------------------------------------
// Glyph / inner label per kind
// ---------------------------------------------------------------------------

const KIND_GLYPH: Record<string, string> = {
  person: "P",
  organization: "O",
  location: "L",
  account: "A",
  phone: "T",
  device: "D",
  vehicle: "V",
  event: "E",
  amount: "₹",
  date: "#",
};

// ---------------------------------------------------------------------------
// Edge arrow helper
// ---------------------------------------------------------------------------

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  targetR: number,
  color: string,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  // Tip sits on the node border
  const tipX = x2 - (dx / len) * (targetR + 1);
  const tipY = y2 - (dy / len) * (targetR + 1);

  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - ARROW_LEN * Math.cos(angle - ARROW_ANGLE),
    tipY - ARROW_LEN * Math.sin(angle - ARROW_ANGLE),
  );
  ctx.lineTo(
    tipX - ARROW_LEN * Math.cos(angle + ARROW_ANGLE),
    tipY - ARROW_LEN * Math.sin(angle + ARROW_ANGLE),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Community hull drawing
// ---------------------------------------------------------------------------

function drawCommunityHulls(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  communityColors: Record<string, string>,
  toCanvas: (x: number, y: number) => [number, number],
  nodeR: (n: GraphNode) => number,
) {
  const communityNodes = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (!n.communityId) continue;
    const arr = communityNodes.get(n.communityId) ?? [];
    arr.push(n);
    communityNodes.set(n.communityId, arr);
  }

  for (const [cid, members] of communityNodes) {
    if (members.length < 2) continue;
    const color = communityColors[cid] ?? "#6b9dea";
    const pad = 24;
    const pts = members.flatMap((n) => {
      const [cx, cy] = toCanvas(n.x, n.y);
      const r = nodeR(n) + pad;
      return [
        { x: cx - r, y: cy - r },
        { x: cx + r, y: cy - r },
        { x: cx + r, y: cy + r },
        { x: cx - r, y: cy + r },
      ];
    });

    const hull = convexHull(pts);
    if (hull.length < 3) continue;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.fillStyle = `${color}12`;
    ctx.strokeStyle = `${color}28`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Main canvas render pass
// ---------------------------------------------------------------------------

interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  communityColors: Record<string, string>;
  selection: GraphSelectionState;
  colorMode: ColorMode;
  graphMode: string;
  scale: number;
  showCommunityHulls: boolean;
  /** Map 0-100 graph coords → canvas pixels. */
  toCanvas: (gx: number, gy: number) => [number, number];
  /** Pixel radius for a given node. */
  nodeR: (n: GraphNode) => number;
}

function renderFrame(p: RenderParams) {
  const {
    ctx,
    width,
    height,
    nodes,
    edges,
    communityColors,
    selection,
    colorMode,
    graphMode,
    scale,
    showCommunityHulls,
    toCanvas,
    nodeR,
  } = p;

  const {
    selectedNodeId,
    selectedNodeIds,
    hoveredNodeId,
    highlightedNodeIds,
    highlightedEdgeIds,
    pathNodeIds,
    pathEdgeIds,
    selectedEdgeId,
    hoveredEdgeId,
  } = selection;

  const hasSelection = selectedNodeId !== null || selectedNodeIds.size > 0;
  const hasPath = pathNodeIds.size > 0;

  // -- Background --------------------------------------------------------
  ctx.fillStyle = CANVAS_COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // -- Grid --------------------------------------------------------------
  const gridAlpha = Math.min(1, (scale - 0.3) / 0.4);
  if (gridAlpha > 0) {
    ctx.save();
    ctx.strokeStyle = CANVAS_COLORS.gridLine;
    ctx.globalAlpha = gridAlpha * 0.6;
    ctx.lineWidth = 0.5;
    // vertical lines
    const startX = ((0 % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
    for (let x = startX; x < width; x += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    const startY = ((0 % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
    for (let y = startY; y < height; y += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // -- Community hulls ---------------------------------------------------
  if (showCommunityHulls || graphMode === "community") {
    drawCommunityHulls(ctx, nodes, communityColors, toCanvas, nodeR);
  }

  // -- Edges -------------------------------------------------------------
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;

    const [sx, sy] = toCanvas(src.x, src.y);
    const [tx, ty] = toCanvas(tgt.x, tgt.y);

    const isSelected = edge.id === selectedEdgeId || edge.id === hoveredEdgeId;
    const isHighlighted = highlightedEdgeIds.has(edge.id);
    const isOnPath = pathEdgeIds.has(edge.id);

    // Dim non-relevant edges when selection/path is active
    let alpha = 1;
    if (hasPath) {
      alpha = isOnPath ? 1 : 0.12;
    } else if (hasSelection) {
      alpha = isHighlighted || isSelected ? 1 : 0.14;
    }

    // Edge colour
    let strokeColor = CANVAS_COLORS.edgeDefault;
    if (isOnPath) {
      strokeColor = CANVAS_COLORS.pathHighlight;
    } else if (isSelected || isHighlighted) {
      strokeColor = resolveEdgeColor(edge, graphMode);
    } else {
      strokeColor = resolveEdgeColor(edge, graphMode);
    }

    const baseWidth = edge.thickness * Math.min(scale * 0.8, 1.8);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? baseWidth * 1.8 : baseWidth;

    // Dash patterns
    if (edge.lineStyle === "dashed") ctx.setLineDash([5 * scale, 3 * scale]);
    else if (edge.lineStyle === "dotted")
      ctx.setLineDash([2 * scale, 3 * scale]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Arrow
    if (edge.directed && scale > 0.35) {
      const tgtR = nodeR(tgt);
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      drawArrowhead(ctx, sx, sy, tx, ty, tgtR, strokeColor);
      ctx.restore();
    }

    // Edge label — only when selected/highlighted and scale is sufficient
    if ((isSelected || isOnPath) && scale > LABEL_MIN_SCALE) {
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;
      drawLabel(ctx, edge.label, mx, my - 8, 10, false);
    }
  }

  // -- Nodes -------------------------------------------------------------
  for (const node of nodes) {
    const [cx, cy] = toCanvas(node.x, node.y);
    const r = nodeR(node);

    const isSelected =
      selectedNodeId === node.id || selectedNodeIds.has(node.id);
    const isHovered = hoveredNodeId === node.id;
    const isHighlighted = highlightedNodeIds.has(node.id);
    const isOnPath = pathNodeIds.has(node.id);

    let alpha = 1;
    if (hasPath) {
      alpha = isOnPath ? 1 : 0.15;
    } else if (hasSelection) {
      alpha = isSelected || isHighlighted ? 1 : 0.18;
    }

    const fillColor = resolveNodeColor(node, colorMode, communityColors);
    const borderColor = isOnPath
      ? CANVAS_COLORS.pathHighlight
      : isSelected || isHovered
        ? CANVAS_COLORS.selectedRing
        : fillColor;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Selection / path highlight ring
    if (isSelected || isOnPath) {
      ctx.save();
      ctx.shadowColor = isOnPath
        ? CANVAS_COLORS.pathHighlight
        : CANVAS_COLORS.selectedRing;
      ctx.shadowBlur = 10;
      drawNodeShape(ctx, node, cx, cy, r + 4);
      ctx.fillStyle = isOnPath
        ? `${CANVAS_COLORS.pathHighlight}22`
        : `${CANVAS_COLORS.selectedRing}22`;
      ctx.fill();
      ctx.restore();
    }

    // Risk border ring (mode-aware)
    if (
      graphMode === "risk" &&
      (node.risk === "critical" || node.risk === "high")
    ) {
      ctx.save();
      drawNodeShape(ctx, node, cx, cy, r + 3);
      ctx.strokeStyle = RISK_COLORS[node.risk];
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha * 0.6;
      ctx.stroke();
      ctx.restore();
    }

    // Node fill — dark background inside the shape
    drawNodeShape(ctx, node, cx, cy, r);
    ctx.fillStyle = CANVAS_COLORS.card;
    ctx.fill();

    // Node border
    drawNodeShape(ctx, node, cx, cy, r);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isSelected || isHovered ? 2.2 : 1.4;
    ctx.stroke();

    // Inner glyph
    if (r >= 8 && scale > 0.3) {
      const glyph = KIND_GLYPH[node.kind] ?? "?";
      const fontSize = Math.max(8, Math.min(r * 0.72, 13));
      ctx.fillStyle = fillColor;
      ctx.font = `600 ${fontSize}px "Space Grotesk", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, cx, cy + 0.5);
    }

    // Risk indicator dot (bottom-right corner) for critical/high
    if ((node.risk === "critical" || node.risk === "high") && r > 8) {
      const dotR = Math.max(3, r * 0.22);
      ctx.beginPath();
      ctx.arc(cx + r * 0.65, cy + r * 0.65, dotR, 0, Math.PI * 2);
      ctx.fillStyle = RISK_COLORS[node.risk];
      ctx.fill();
    }

    ctx.restore();

    // Node label (drawn outside globalAlpha save so it's always legible)
    if (scale >= LABEL_MIN_SCALE) {
      const showLabel =
        isSelected ||
        isHovered ||
        isOnPath ||
        isHighlighted ||
        nodes.length <= 40 ||
        (nodes.length <= 120 && node.radius >= 6) ||
        (nodes.length > 120 && scale >= 1.2 && node.radius >= 7);

      if (showLabel) {
        const labelAlpha = hasPath
          ? isOnPath
            ? 1
            : 0.3
          : hasSelection
            ? isSelected || isHighlighted
              ? 1
              : 0.35
            : 1;
        ctx.save();
        ctx.globalAlpha = labelAlpha;
        drawLabel(ctx, node.label, cx, cy + r + 10, 10.5, true);
        ctx.restore();
      }
    }
  }
}

function resolveEdgeColor(edge: GraphEdge, graphMode: string): string {
  if (graphMode === "risk")
    return RISK_COLORS[edge.risk as RiskLevel] ?? CANVAS_COLORS.edgeActive;
  if (graphMode === "evidence") {
    const alpha = Math.round(40 + edge.weight * 160)
      .toString(16)
      .padStart(2, "0");
    return `#8891b0${alpha}`;
  }
  // Default: soft blue-gray tint based on relationship type
  const rt = edge.relationshipType.toLowerCase();
  if (/transfer|paid/.test(rt)) return "#fb923c88";
  if (/call/.test(rt)) return "#6b9dea88";
  if (/message/.test(rt)) return "#4ade8088";
  return CANVAS_COLORS.edgeDefault;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  withBg: boolean,
) {
  ctx.save();
  ctx.font = `500 ${fontSize}px "Figtree", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const maxChars = 18;
  const display = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  const measured = ctx.measureText(display);
  const tw = measured.width;

  if (withBg) {
    const pad = 3;
    ctx.fillStyle = CANVAS_COLORS.labelBg;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - pad, y - 1, tw + pad * 2, fontSize + 4, 3);
    ctx.fill();
  }

  ctx.fillStyle = CANVAS_COLORS.foreground;
  ctx.fillText(display, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hit testing — find node under pointer in graph coords
// ---------------------------------------------------------------------------

function hitTestNode(
  nodes: GraphNode[],
  gx: number,
  gy: number,
  toCanvas: (gx: number, gy: number) => [number, number],
  nodeR: (n: GraphNode) => number,
  canvasPx: { x: number; y: number },
): GraphNode | null {
  // We test in canvas-pixel space (most accurate for non-circular shapes)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const [cx, cy] = toCanvas(n.x, n.y);
    const r = nodeR(n) + 4; // +4px tolerance
    const dx = canvasPx.x - cx;
    const dy = canvasPx.y - cy;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

function hitTestEdge(
  edges: GraphEdge[],
  nodes: GraphNode[],
  canvasPx: { x: number; y: number },
  toCanvas: (gx: number, gy: number) => [number, number],
  nodeR: (n: GraphNode) => number,
  tolerance = 7,
): GraphEdge | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;
    const [sx, sy] = toCanvas(src.x, src.y);
    const [tx, ty] = toCanvas(tgt.x, tgt.y);
    const dist = pointToSegmentDist(canvasPx.x, canvasPx.y, sx, sy, tx, ty);
    if (dist < tolerance) return edge;
  }
  return null;
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2),
  );
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

// ---------------------------------------------------------------------------
// Force simulation — lightweight spring layout for when nodes need settling
// ---------------------------------------------------------------------------

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

function runForceStep(
  simNodes: SimNode[],
  edges: GraphEdge[],
  alpha: number,
): void {
  const k = 4; // spring rest length
  const repulsion = 0.5;
  const cooling = 0.82;

  // Repulsion
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const ni = simNodes[i];
      const nj = simNodes[j];
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      const force = (repulsion / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!ni.pinned) {
        ni.vx -= fx;
        ni.vy -= fy;
      }
      if (!nj.pinned) {
        nj.vx += fx;
        nj.vy += fy;
      }
    }
  }

  // Attraction
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
    const force = ((dist - k) / dist) * 0.3 * alpha;
    const fx = dx * force;
    const fy = dy * force;
    if (!src.pinned) {
      src.vx += fx;
      src.vy += fy;
    }
    if (!tgt.pinned) {
      tgt.vx -= fx;
      tgt.vy -= fy;
    }
  }

  // Integrate
  for (const n of simNodes) {
    if (n.pinned) continue;
    n.vx *= cooling;
    n.vy *= cooling;
    n.x = Math.max(2, Math.min(98, n.x + n.vx));
    n.y = Math.max(2, Math.min(98, n.y + n.vy));
  }
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface GraphCanvasProps {
  /** Accepts either the legacy NetworkGraph OR the rich EnrichedGraph. */
  graph: NetworkGraph | EnrichedGraph;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onSelectEdge?: (id: string | null) => void;
  onExpand?: (id: string) => void;
  className?: string;
  colorMode?: ColorMode;
  sizeMetric?: SizeMetric;
  graphMode?: string;
  selection?: Partial<GraphSelectionState>;
  frozen?: boolean;
  onFrozenChange?: (frozen: boolean) => void;
  showCommunityHulls?: boolean;
  /** Called with the current ViewTransform whenever it changes. */
  onViewChange?: (vt: ViewTransform) => void;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isEnrichedGraph(g: NetworkGraph | EnrichedGraph): g is EnrichedGraph {
  return "communityColors" in g;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphCanvas({
  graph: graphProp,
  selectedId,
  onSelect,
  onSelectEdge,
  onExpand,
  className,
  colorMode = "entityType",
  sizeMetric = "radius",
  graphMode = "network",
  selection: selectionProp,
  frozen = true,
  onFrozenChange,
  showCommunityHulls = false,
  onViewChange,
}: GraphCanvasProps) {
  // -- Normalise to EnrichedGraph ----------------------------------------
  const enriched = useMemo<EnrichedGraph>(() => {
    if (isEnrichedGraph(graphProp)) return graphProp;
    // Minimal conversion for backward compat
    const communityColors = buildCommunityColors([]);
    return {
      caseId: graphProp.caseId,
      communityColors,
      nodes: graphProp.nodes.map((n) => ({ ...n, sizeScore: 0.5 })),
      edges: graphProp.edges.map((e) => ({
        ...e,
        relationshipType: e.label.toLowerCase().replace(/\s+/g, "_"),
        directed: false,
        lineStyle: "solid" as const,
        thickness: 1,
        confidence: e.weight,
      })),
    };
  }, [graphProp]);

  // -- Pixel radius function (memoised) -----------------------------------
  const nodeR = useCallback((n: { radius: number; sizeScore?: number }) => {
    const score = n.sizeScore ?? 0.5;
    return nodePxRadius(score, 8, 28);
  }, []);

  // -- Simulation state (mutable, not React state) -----------------------
  const simNodesRef = useRef<SimNode[]>([]);
  const simRunningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  useEffect(() => {
    simNodesRef.current = enriched.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      vx: 0,
      vy: 0,
      pinned: false,
    }));
  }, [enriched.nodes]);

  // Hit-testing must see current sim positions (drag/sim move nodes), not
  // the original backend coordinates.
  const currentNodes = useCallback(
    () =>
      enriched.nodes.map((n) => {
        const sim = simNodesRef.current.find((s) => s.id === n.id);
        return sim ? { ...n, x: sim.x, y: sim.y } : n;
      }),
    [enriched.nodes],
  );

  // -- Viewport state -----------------------------------------------------
  const [view, setView] = useState<ViewTransform>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const viewRef = useRef(view);
  viewRef.current = view;

  // -- Canvas refs --------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest paint closure; drag handlers and sim ticks call it directly so
  // they redraw even when no React state changes.
  const drawRef = useRef<(() => void) | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // -- Graph → canvas coordinate transform --------------------------------
  const toCanvas = useCallback(
    (gx: number, gy: number): [number, number] => {
      const { offsetX, offsetY, scale } = viewRef.current;
      const { w, h } = size;
      const cx = (gx / 100) * w * scale + offsetX;
      const cy = (gy / 100) * h * scale + offsetY;
      return [cx, cy];
    },
    [size],
  );

  const toGraph = useCallback(
    (px: number, py: number): [number, number] => {
      const { offsetX, offsetY, scale } = viewRef.current;
      const { w, h } = size;
      const gx = ((px - offsetX) / (w * scale)) * 100;
      const gy = ((py - offsetY) / (h * scale)) * 100;
      return [gx, gy];
    },
    [size],
  );

  // -- Selection state ---------------------------------------------------
  const selection = useMemo<GraphSelectionState>(() => {
    const base: GraphSelectionState = {
      selectedNodeId: selectedId ?? null,
      selectedNodeIds: new Set(),
      selectedEdgeId: null,
      hoveredNodeId: null,
      hoveredEdgeId: null,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      pathSource: null,
      pathTarget: null,
      pathNodeIds: new Set(),
      pathEdgeIds: new Set(),
    };
    return { ...base, ...(selectionProp ?? {}) };
  }, [selectedId, selectionProp]);

  const [localHovered, setLocalHovered] = useState<{
    nodeId: string | null;
    edgeId: string | null;
  }>({ nodeId: null, edgeId: null });

  const mergedSelection = useMemo<GraphSelectionState>(
    () => ({
      ...selection,
      hoveredNodeId: localHovered.nodeId ?? selection.hoveredNodeId,
      hoveredEdgeId: localHovered.edgeId ?? selection.hoveredEdgeId,
    }),
    [selection, localHovered],
  );

  // -- Render loop --------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / non-canvas environment

    // Sync sim node positions → enriched graph nodes for rendering
    const syncedNodes = enriched.nodes.map((n) => {
      const sim = simNodesRef.current.find((s) => s.id === n.id);
      return sim ? { ...n, x: sim.x, y: sim.y } : n;
    });

    renderFrame({
      ctx,
      width: size.w,
      height: size.h,
      nodes: syncedNodes,
      edges: enriched.edges,
      communityColors: enriched.communityColors,
      selection: mergedSelection,
      colorMode,
      graphMode,
      scale: view.scale,
      showCommunityHulls,
      toCanvas,
      nodeR,
    });
    drawRef.current = () => {
      const c = canvasRef.current;
      const context = c?.getContext("2d");
      if (!c || !context) return;
      const synced = enriched.nodes.map((n) => {
        const sim = simNodesRef.current.find((s) => s.id === n.id);
        return sim ? { ...n, x: sim.x, y: sim.y } : n;
      });
      renderFrame({
        ctx: context,
        width: size.w,
        height: size.h,
        nodes: synced,
        edges: enriched.edges,
        communityColors: enriched.communityColors,
        selection: mergedSelection,
        colorMode,
        graphMode,
        scale: view.scale,
        showCommunityHulls,
        toCanvas,
        nodeR,
      });
    };
    return () => {
      drawRef.current = null;
    };
  });

  // -- Simulation tick ---------------------------------------------------
  useEffect(() => {
    if (frozen) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let alpha = 0.2;
    let ticks = 0;
    const maxTicks = 80;

    function tick() {
      if (frozenRef.current || ticks >= maxTicks) {
        simRunningRef.current = false;
        return;
      }
      runForceStep(simNodesRef.current, enriched.edges, alpha);
      alpha *= 0.96;
      ticks++;
      drawRef.current?.();
      rafRef.current = requestAnimationFrame(tick);
    }

    simRunningRef.current = true;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enriched.edges, frozen]);

  // -- Drag state --------------------------------------------------------
  const dragRef = useRef<{
    nodeId: string | null;
    panStart: { x: number; y: number } | null;
  }>({ nodeId: null, panStart: null });

  const getCanvasPoint = useCallback(
    (e: React.PointerEvent | React.WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = getCanvasPoint(e);

      const hitNode = hitTestNode(currentNodes(), 0, 0, toCanvas, nodeR, pt);

      if (hitNode) {
        // Start node drag
        dragRef.current = { nodeId: hitNode.id, panStart: null };
        const sim = simNodesRef.current.find((s) => s.id === hitNode.id);
        if (sim) sim.pinned = true;
      } else {
        // Start canvas pan
        dragRef.current = {
          nodeId: null,
          panStart: { x: e.clientX, y: e.clientY },
        };
      }
    },
    [currentNodes, toCanvas, nodeR, getCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pt = getCanvasPoint(e);

      if (dragRef.current.nodeId) {
        // Drag node
        const [gx, gy] = toGraph(pt.x, pt.y);
        const sim = simNodesRef.current.find(
          (s) => s.id === dragRef.current.nodeId,
        );
        if (sim) {
          sim.x = Math.max(1, Math.min(99, gx));
          sim.y = Math.max(1, Math.min(99, gy));
          sim.vx = 0;
          sim.vy = 0;
          drawRef.current?.();
        }
      } else if (dragRef.current.panStart) {
        // Pan canvas
        const dx = e.clientX - dragRef.current.panStart.x;
        const dy = e.clientY - dragRef.current.panStart.y;
        dragRef.current.panStart = { x: e.clientX, y: e.clientY };
        setView((v) => {
          const next = {
            ...v,
            offsetX: v.offsetX + dx,
            offsetY: v.offsetY + dy,
          };
          viewRef.current = next;
          return next;
        });
      } else {
        // Hover detection
        const hitNode = hitTestNode(currentNodes(), 0, 0, toCanvas, nodeR, pt);
        if (hitNode) {
          setLocalHovered({ nodeId: hitNode.id, edgeId: null });
        } else {
          const hitEdge = hitTestEdge(
            enriched.edges,
            currentNodes(),
            pt,
            toCanvas,
            nodeR,
          );
          setLocalHovered({
            nodeId: null,
            edgeId: hitEdge ? hitEdge.id : null,
          });
        }
      }
    },
    [currentNodes, enriched.edges, toCanvas, toGraph, nodeR, getCanvasPoint],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const dragged = dragRef.current.nodeId;
      if (dragged) {
        const sim = simNodesRef.current.find((s) => s.id === dragged);
        if (sim) sim.pinned = false;
      }
      dragRef.current = { nodeId: null, panStart: null };
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = getCanvasPoint(e as unknown as React.PointerEvent);
      const hitNode = hitTestNode(currentNodes(), 0, 0, toCanvas, nodeR, pt);
      if (hitNode) {
        if (e.shiftKey) {
          // Multi-select handled by parent
          onSelect?.(hitNode.id);
        } else {
          onSelect?.(hitNode.id);
        }
        return;
      }
      const hitEdge = hitTestEdge(
        enriched.edges,
        currentNodes(),
        pt,
        toCanvas,
        nodeR,
      );
      if (hitEdge) {
        onSelectEdge?.(hitEdge.id);
        return;
      }
      // Click empty canvas — deselect
      onSelect?.(null);
      onSelectEdge?.(null);
    },
    [
      currentNodes,
      enriched.edges,
      toCanvas,
      nodeR,
      onSelect,
      onSelectEdge,
      getCanvasPoint,
    ],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = getCanvasPoint(e as unknown as React.PointerEvent);
      const hitNode = hitTestNode(currentNodes(), 0, 0, toCanvas, nodeR, pt);
      if (hitNode) onExpand?.(hitNode.id);
    },
    [currentNodes, toCanvas, nodeR, onExpand, getCanvasPoint],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const pt = getCanvasPoint(e);
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setView((v) => {
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, v.scale + delta * v.scale * 0.5),
        );
        const scaleDelta = newScale / v.scale;
        const next = {
          scale: newScale,
          offsetX: pt.x - scaleDelta * (pt.x - v.offsetX),
          offsetY: pt.y - scaleDelta * (pt.y - v.offsetY),
        };
        viewRef.current = next;
        onViewChange?.(next);
        return next;
      });
    },
    [getCanvasPoint, onViewChange],
  );

  // -- Keyboard navigation -----------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const step = 5;
      if (e.key === "ArrowLeft")
        setView((v) => ({ ...v, offsetX: v.offsetX - step }));
      if (e.key === "ArrowRight")
        setView((v) => ({ ...v, offsetX: v.offsetX + step }));
      if (e.key === "ArrowUp")
        setView((v) => ({ ...v, offsetY: v.offsetY - step }));
      if (e.key === "ArrowDown")
        setView((v) => ({ ...v, offsetY: v.offsetY + step }));
      if (e.key === "+" || e.key === "=")
        setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.15) }));
      if (e.key === "-")
        setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.15) }));
      if (e.key === "Escape") {
        onSelect?.(null);
        onSelectEdge?.(null);
      }
    },
    [onSelect, onSelectEdge],
  );

  // -- Toolbar actions ---------------------------------------------------
  const handleZoomIn = () =>
    setView((v) => {
      const next = {
        ...v,
        scale: Math.min(MAX_SCALE, v.scale + ZOOM_STEP * v.scale * 0.5),
      };
      viewRef.current = next;
      return next;
    });

  const handleZoomOut = () =>
    setView((v) => {
      const next = {
        ...v,
        scale: Math.max(MIN_SCALE, v.scale - ZOOM_STEP * v.scale * 0.5),
      };
      viewRef.current = next;
      return next;
    });

  const handleFitToScreen = useCallback(() => {
    const { w, h } = size;
    const nodes = enriched.nodes;
    if (!nodes.length) return;
    let minGx = 100,
      maxGx = 0,
      minGy = 100,
      maxGy = 0;
    for (const n of nodes) {
      minGx = Math.min(minGx, n.x);
      maxGx = Math.max(maxGx, n.x);
      minGy = Math.min(minGy, n.y);
      maxGy = Math.max(maxGy, n.y);
    }
    const spanX = maxGx - minGx || 100;
    const spanY = maxGy - minGy || 100;
    const padding = 0.12;
    const scaleX = (w * (1 - padding * 2)) / ((spanX / 100) * w);
    const scaleY = (h * (1 - padding * 2)) / ((spanY / 100) * h);
    const newScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min(scaleX, scaleY)),
    );
    const centerGx = (minGx + maxGx) / 2;
    const centerGy = (minGy + maxGy) / 2;
    const next = {
      scale: newScale,
      offsetX: w / 2 - (centerGx / 100) * w * newScale,
      offsetY: h / 2 - (centerGy / 100) * h * newScale,
    };
    viewRef.current = next;
    setView(next);
  }, [enriched.nodes, size]);

  const handleFocusSelected = useCallback(() => {
    const node = enriched.nodes.find((n) => n.id === selectedId);
    if (!node) return;
    const { w, h } = size;
    const newScale = Math.min(MAX_SCALE, Math.max(viewRef.current.scale, 1.6));
    const next = {
      scale: newScale,
      offsetX: w / 2 - (node.x / 100) * w * newScale,
      offsetY: h / 2 - (node.y / 100) * h * newScale,
    };
    viewRef.current = next;
    setView(next);
  }, [enriched.nodes, selectedId, size]);

  const handleReset = useCallback(() => {
    const next = { offsetX: 0, offsetY: 0, scale: 1 };
    viewRef.current = next;
    setView(next);
  }, []);

  // -- Cursor style ------------------------------------------------------
  const [cursor, setCursor] = useState("grab");
  const handlePointerMoveForCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragRef.current.nodeId) {
        setCursor("grabbing");
        return;
      }
      if (dragRef.current.panStart) {
        setCursor("grabbing");
        return;
      }
      const pt = getCanvasPoint(e);
      const hit = hitTestNode(currentNodes(), 0, 0, toCanvas, nodeR, pt);
      setCursor(hit ? "pointer" : "grab");
    },
    [currentNodes, toCanvas, nodeR, getCanvasPoint],
  );

  // -- Tooltip state -----------------------------------------------------
  const [tooltip, setTooltip] = useState<{
    node: GraphNode | null;
    edge: GraphEdge | null;
    x: number;
    y: number;
  }>({ node: null, edge: null, x: 0, y: 0 });

  useEffect(() => {
    const hoveredNode = enriched.nodes.find(
      (n) => n.id === localHovered.nodeId,
    );
    const hoveredEdge = enriched.edges.find(
      (e) => e.id === localHovered.edgeId,
    );
    if (hoveredNode) {
      const [cx, cy] = toCanvas(hoveredNode.x, hoveredNode.y);
      setTooltip({ node: hoveredNode, edge: null, x: cx, y: cy });
    } else if (hoveredEdge) {
      const srcNode = enriched.nodes.find((n) => n.id === hoveredEdge.source);
      const tgtNode = enriched.nodes.find((n) => n.id === hoveredEdge.target);
      if (srcNode && tgtNode) {
        const [sx, sy] = toCanvas(srcNode.x, srcNode.y);
        const [tx, ty] = toCanvas(tgtNode.x, tgtNode.y);
        setTooltip({
          node: null,
          edge: hoveredEdge,
          x: (sx + tx) / 2,
          y: (sy + ty) / 2,
        });
      }
    } else {
      setTooltip({ node: null, edge: null, x: 0, y: 0 });
    }
  }, [localHovered, enriched.nodes, enriched.edges, toCanvas]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      data-ocid="graph_canvas"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border",
        className,
      )}
      style={{ background: CANVAS_COLORS.background }}
    >
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        style={{ display: "block", cursor }}
        aria-label="Criminal network analysis graph — use arrow keys to pan, +/- to zoom"
        role="img"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          handlePointerMove(e);
          handlePointerMoveForCursor(e);
        }}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          dragRef.current = { nodeId: null, panStart: null };
          setLocalHovered({ nodeId: null, edgeId: null });
          setCursor("grab");
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      />

      {/* Hover tooltip */}
      {(tooltip.node || tooltip.edge) && (
        <div
          className="pointer-events-none absolute z-20 max-w-[200px] rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 8,
            transform:
              tooltip.x > size.w * 0.7 ? "translateX(-110%)" : undefined,
          }}
          aria-hidden
        >
          {tooltip.node && (
            <>
              <div className="font-semibold text-foreground">
                {tooltip.node.label}
              </div>
              <div className="mt-0.5 text-muted-foreground capitalize">
                {tooltip.node.kind}
              </div>
              {tooltip.node.degree !== undefined && (
                <div className="mt-1 text-muted-foreground">
                  Degree: {tooltip.node.degree}
                </div>
              )}
              {tooltip.node.communityId && (
                <div className="text-muted-foreground">
                  Community: {tooltip.node.communityId}
                </div>
              )}
              <div
                className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                style={{
                  background: `${RISK_COLORS[tooltip.node.risk]}22`,
                  color: RISK_COLORS[tooltip.node.risk],
                }}
              >
                {tooltip.node.risk}
              </div>
            </>
          )}
          {tooltip.edge && (
            <>
              <div className="font-semibold text-foreground">
                {tooltip.edge.label}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                Confidence: {(tooltip.edge.weight * 100).toFixed(0)}%
              </div>
            </>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <ToolButton
          onClick={handleZoomIn}
          label="Zoom in"
          data-ocid="graph_canvas.zoom_in_button"
        >
          <Plus className="size-3.5" aria-hidden />
        </ToolButton>
        <ToolButton
          onClick={handleZoomOut}
          label="Zoom out"
          data-ocid="graph_canvas.zoom_out_button"
        >
          <Minus className="size-3.5" aria-hidden />
        </ToolButton>
        <ToolButton onClick={handleFitToScreen} label="Fit to screen">
          <Maximize2 className="size-3.5" aria-hidden />
        </ToolButton>
        <ToolButton
          onClick={handleFocusSelected}
          label="Focus selected"
          data-ocid="graph_canvas.focus_button"
        >
          <Crosshair className="size-3.5" aria-hidden />
        </ToolButton>
        <ToolButton
          onClick={handleReset}
          label="Reset view"
          data-ocid="graph_canvas.reset_button"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </ToolButton>
        <ToolButton
          onClick={() => onFrozenChange?.(!frozen)}
          label={frozen ? "Unfreeze layout" : "Freeze layout"}
          data-ocid="graph_canvas.expand_button"
          active={frozen}
        >
          {frozen ? (
            <Snowflake className="size-3.5" aria-hidden />
          ) : (
            <Wind className="size-3.5" aria-hidden />
          )}
        </ToolButton>
      </div>

      {/* Node / edge count badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="rounded border border-border bg-card/80 px-2 py-0.5 font-mono-id text-[10px] text-muted-foreground backdrop-blur">
          {enriched.nodes.length}N · {enriched.edges.length}E
        </span>
        <span className="rounded border border-border bg-card/80 px-2 py-0.5 font-mono-id text-[10px] text-muted-foreground backdrop-blur">
          {Math.round(view.scale * 100)}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable toolbar button
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  "data-ocid"?: string;
}

function ToolButton({
  onClick,
  label,
  children,
  active,
  "data-ocid": ocid,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      data-ocid={ocid}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded border border-border backdrop-blur transition-smooth",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-info/50 bg-info/15 text-info"
          : "bg-card/80 text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
