import indiaOutlineJson from "@/data/india-outline.json";
import indiaStatesJson from "@/data/india-states.json";
import type { RiskLevel } from "@/lib/crimenet/types";
import { cellToBoundary, getHexagonEdgeLengthAvg, latLngToCell } from "h3-js";

export const Z_REF = 10;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 13;
const WORLD = 256 * 2 ** Z_REF;

export interface MapView {
  zoom: number;
  wx: number;
  wy: number;
}

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface HexZone {
  id: string;
  latitude: number;
  longitude: number;
  risk: RiskLevel;
}

export interface HexCell {
  id: string;
  risk: RiskLevel | null;
  zones: string[];
  points: string;
  wx: number;
  wy: number;
}

type Ring = Array<[number, number]>;
type MultiPolygon = Ring[][];

const outlineGeometry = (
  indiaOutlineJson as unknown as {
    geometry: { type: string; coordinates: MultiPolygon };
  }
).geometry;

export const indiaOutline = outlineGeometry;
const outlineRings: Ring[] = asRings(outlineGeometry.coordinates);
export const indiaStates = indiaStatesJson as unknown as {
  type: "FeatureCollection";
  features: Array<{
    properties: { name: string };
    geometry: { type: string; coordinates: MultiPolygon };
  }>;
};

export const INDIA_BBOX: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} = (() => {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const ring of outlineRings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, minLat, maxLon, maxLat };
})();

export function lonLatToWorld(lon: number, lat: number) {
  const wx = ((lon + 180) / 360) * WORLD;
  const clamped = Math.max(-85.05, Math.min(85.05, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  const wy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  return { wx, wy };
}

export function worldToLonLat(wx: number, wy: number): GeoPoint {
  const lon = (wx / WORLD) * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (wy / WORLD);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
}

export function viewScale(view: MapView): number {
  return 2 ** (view.zoom - Z_REF);
}

export function worldToScreen(
  wx: number,
  wy: number,
  view: MapView,
  width: number,
  height: number,
) {
  const s = viewScale(view);
  return {
    x: (wx - view.wx) * s + width / 2,
    y: (wy - view.wy) * s + height / 2,
  };
}

export function screenToWorld(
  x: number,
  y: number,
  view: MapView,
  width: number,
  height: number,
) {
  const s = viewScale(view);
  return {
    wx: view.wx + (x - width / 2) / s,
    wy: view.wy + (y - height / 2) / s,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomAt(
  view: MapView,
  px: number,
  py: number,
  deltaZoom: number,
  width: number,
  height: number,
): MapView {
  const zoom = clampZoom(view.zoom + deltaZoom);
  if (zoom === view.zoom) return view;
  const anchor = screenToWorld(px, py, view, width, height);
  const s = 2 ** (zoom - Z_REF);
  return {
    zoom,
    wx: anchor.wx - (px - width / 2) / s,
    wy: anchor.wy - (py - height / 2) / s,
  };
}

export function fitBounds(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  width: number,
  height: number,
  pad = 0.06,
): MapView {
  const topLeft = lonLatToWorld(bbox.minLon, bbox.maxLat);
  const bottomRight = lonLatToWorld(bbox.maxLon, bbox.minLat);
  const spanX = Math.max(bottomRight.wx - topLeft.wx, 1);
  const spanY = Math.max(bottomRight.wy - topLeft.wy, 1);
  const availW = Math.max(width * (1 - 2 * pad), 1);
  const availH = Math.max(height * (1 - 2 * pad), 1);
  const zoom = clampZoom(
    Z_REF + Math.min(Math.log2(availW / spanX), Math.log2(availH / spanY)),
  );
  const center = lonLatToWorld(
    (bbox.minLon + bbox.maxLon) / 2,
    (bbox.minLat + bbox.maxLat) / 2,
  );
  return { zoom, wx: center.wx, wy: center.wy };
}

export function resolutionForZoom(zoom: number): number {
  return Math.min(9, Math.max(1, Math.round(zoom) - 2));
}

export function cellIdAt(lon: number, lat: number, res: number): string {
  return latLngToCell(lat, lon, res);
}

const outlineVertices: Array<[number, number]> = outlineRings.flat();

function pointInRing(
  ring: Ring,
  lon: number,
  lat: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const outlineRingBounds = outlineRings.map((ring) => {
  let minX = 180;
  let maxX = -180;
  let minY = 90;
  let maxY = -90;
  for (const [lon, lat] of ring) {
    if (lon < minX) minX = lon;
    if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }
  return { ring, minX, maxX, minY, maxY };
});

export function pointInIndia(lon: number, lat: number): boolean {
  return outlineRingBounds.some((bounds) =>
    pointInRing(
      bounds.ring,
      lon,
      lat,
      bounds.minX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
    ),
  );
}

function ringPointInPolygon(ring: Ring, lon: number, lat: number): boolean {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return pointInRing(ring, lon, lat, minX, maxX, minY, maxY);
}

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function worstRisk(risks: RiskLevel[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const risk of risks) {
    if (!worst || RISK_RANK[risk] > RISK_RANK[worst]) worst = risk;
  }
  return worst;
}

function cellRingWorld(
  cellId: string,
): { ring: Ring; wx: number; wy: number } | null {
  const boundary = cellToBoundary(cellId);
  const ring: Ring = [];
  let sumX = 0;
  let sumY = 0;
  for (const [lat, lon] of boundary) {
    const { wx, wy } = lonLatToWorld(lon, lat);
    ring.push([wx, wy]);
    sumX += wx;
    sumY += wy;
  }
  if (ring.length === 0) return null;
  return { ring, wx: sumX / ring.length, wy: sumY / ring.length };
}

function cellIntersectsIndia(cellRing: Ring, wx: number, wy: number): boolean {
  const { lon, lat } = worldToLonLat(wx, wy);
  if (pointInIndia(lon, lat)) return true;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of cellRing) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (const [vx, vy] of outlineVertices) {
    if (vx < minX || vx > maxX || vy < minY || vy > maxY) continue;
    if (ringPointInPolygon(cellRing, vx, vy)) return true;
  }
  return false;
}

function asRings(coordinates: unknown): Ring[] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
  const first = coordinates[0];
  if (!Array.isArray(first) || first.length === 0) return [];
  if (typeof first[0] === "number") {
    return [coordinates as unknown as Ring];
  }
  const second = first[0];
  if (!Array.isArray(second) || second.length === 0) return [];
  if (typeof second[0] === "number") {
    return coordinates as unknown as Ring[];
  }
  const third = second[0];
  if (!Array.isArray(third) || third.length === 0) return [];
  if (typeof third[0] === "number") {
    return (coordinates as unknown as Ring[][]).flat(1);
  }
  return (coordinates as unknown as Ring[][][]).flat(2);
}

export function polygonsToPath(coordinates: unknown): string {
  const parts: string[] = [];
  for (const ring of asRings(coordinates)) {
    if (ring.length === 0) continue;
    const segments = ring.map(([lon, lat]) => {
      const { wx, wy } = lonLatToWorld(lon, lat);
      return `${wx.toFixed(1)} ${wy.toFixed(1)}`;
    });
    parts.push(`M${segments.join("L")}Z`);
  }
  return parts.join(" ");
}

export interface HexGrid {
  res: number;
  cells: HexCell[];
}

function latticeIds(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  res: number,
  maxEstimate: number,
): { ids: Set<string>; rows: number; cols: number } {
  const centerLat = (minLat + maxLat) / 2;
  const edgeKm = getHexagonEdgeLengthAvg(res, "km");
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const stepLat = Math.max(0.01, ((2 * edgeKm) / 110.574) * 0.78);
  const stepLng = Math.max(0.01, ((1.732 * edgeKm * cosLat) / 111.32) * 0.78);
  const rows = Math.floor((maxLat - minLat) / stepLat) + 2;
  const cols = Math.floor((maxLon - minLon) / stepLng) + 2;
  const ids = new Set<string>();
  if (rows * cols > maxEstimate) return { ids, rows, cols };
  let row = 0;
  for (let lat = minLat; lat <= maxLat; lat += stepLat) {
    row += 1;
    const offset = row % 2 === 0 ? stepLng / 2 : 0;
    for (let lon = minLon + offset; lon <= maxLon; lon += stepLng) {
      ids.add(latLngToCell(lat, lon, res));
    }
  }
  return { ids, rows, cols };
}

export function buildHexCells(
  view: MapView,
  width: number,
  height: number,
  zones: HexZone[],
  maxCells = 900,
): HexGrid {
  const corners = [
    screenToWorld(0, 0, view, width, height),
    screenToWorld(width, 0, view, width, height),
    screenToWorld(0, height, view, width, height),
    screenToWorld(width, height, view, width, height),
  ];
  const lons = corners.map((corner) => worldToLonLat(corner.wx, corner.wy).lon);
  const lats = corners.map((corner) => worldToLonLat(corner.wx, corner.wy).lat);
  const padLon = (Math.max(...lons) - Math.min(...lons)) * 0.3;
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.3;
  const viewMinLon = Math.min(...lons) - padLon;
  const viewMaxLon = Math.max(...lons) + padLon;
  const viewMinLat = Math.min(...lats) - padLat;
  const viewMaxLat = Math.max(...lats) + padLat;
  const minLon = Math.max(viewMinLon, INDIA_BBOX.minLon);
  const maxLon = Math.min(viewMaxLon, INDIA_BBOX.maxLon);
  const minLat = Math.max(viewMinLat, INDIA_BBOX.minLat);
  const maxLat = Math.min(viewMaxLat, INDIA_BBOX.maxLat);

  const startRes = resolutionForZoom(view.zoom);
  if (minLon >= maxLon || minLat >= maxLat) {
    return { res: startRes, cells: [] };
  }

  let res = startRes;
  let cellIds: Set<string> = new Set();
  for (;;) {
    const limit =
      res <= 1 ? Number.POSITIVE_INFINITY : Math.ceil(maxCells * 1.5);
    const estimate = latticeIds(minLon, maxLon, minLat, maxLat, res, limit);
    const oversized =
      estimate.ids.size === 0 && estimate.rows * estimate.cols > 0;
    if (res <= 1 || (!oversized && estimate.ids.size <= maxCells)) {
      cellIds = estimate.ids;
      break;
    }
    res -= 1;
  }

  const zonesByCell = new Map<string, string[]>();
  const zoneRiskByCell = new Map<string, RiskLevel[]>();
  for (const zone of zones) {
    const id = latLngToCell(zone.latitude, zone.longitude, res);
    const members = zonesByCell.get(id);
    if (members) members.push(zone.id);
    else zonesByCell.set(id, [zone.id]);
    const risks = zoneRiskByCell.get(id);
    if (risks) risks.push(zone.risk);
    else zoneRiskByCell.set(id, [zone.risk]);
  }

  const cells: HexCell[] = [];
  for (const id of cellIds) {
    const shape = cellRingWorld(id);
    if (!shape) continue;
    if (!cellIntersectsIndia(shape.ring, shape.wx, shape.wy)) continue;
    const risks = zoneRiskByCell.get(id);
    cells.push({
      id,
      risk: risks ? worstRisk(risks) : null,
      zones: zonesByCell.get(id) ?? [],
      points: shape.ring.map(([x, y]) => `${x},${y}`).join(" "),
      wx: shape.wx,
      wy: shape.wy,
    });
  }
  return { res, cells };
}
