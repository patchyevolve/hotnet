#!/usr/bin/env python3
"""Build the bundled India basemap assets for the Command Map.

Sources (Natural Earth 10m, public domain — no attribution required):
  * ne_10m_admin_0_countries.geojson       -> country outline
  * ne_10m_admin_1_states_provinces.geojson -> internal state borders

Both files are ~13MB/40MB upstream, so this extracts only India, simplifies
every ring with Douglas-Peucker (0.02° tolerance ≈ 2km) and writes compact
coordinates (4 decimals ≈ 11m) to:

  src/data/india-outline.json   MultiPolygon feature
  src/data/india-states.json    FeatureCollection, one feature per state

The runtime never fetches geography (offline demo) — these files are imported
directly by src/lib/crimenet/geo.ts. Re-run after editing this script:

  python3 scripts/fetch-india-geo.py
"""

from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

SOURCES = {
    "countries": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
    "states": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
}
CACHE_DIR = Path("/tmp/opencode/natural_earth")
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data"

TOLERANCE = 0.02  # degrees — ~2km, plenty for a country-scale basemap
MIN_RING_BOX = 0.05  # drop rock specks smaller than this bbox diagonal
COORD_DECIMALS = 4


def download(name: str, url: str) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{name}.geojson"
    if not path.exists():
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, path)
    return json.loads(path.read_text(encoding="utf-8"))


def _perp_distance(point, start, end) -> float:
    (x, y), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify_ring(points, tolerance: float) -> list:
    """Iterative Douglas-Peucker (recursion depth blows up on 10m rings)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        worst, index = -1.0, -1
        for i in range(first + 1, last):
            d = _perp_distance(points[i], points[first], points[last])
            if d > worst:
                worst, index = d, i
        if worst > tolerance:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def clean_ring(ring) -> list | None:
    pts = [(round(float(x), COORD_DECIMALS), round(float(y), COORD_DECIMALS))
           for x, y, *_ in ring]
    # drop the duplicated closing vertex; RDP keeps endpoints anyway
    if len(pts) > 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    pts = simplify_ring(pts, TOLERANCE)
    if len(pts) < 4:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    if math.hypot(max(xs) - min(xs), max(ys) - min(ys)) < MIN_RING_BOX:
        return None
    return pts + [pts[0]]  # GeoJSON rings must close


def clean_geometry(geometry) -> dict | None:
    kind = geometry["type"]
    if kind == "Polygon":
        rings = [r for r in (clean_ring(p) for p in geometry["coordinates"]) if r]
        return {"type": "Polygon", "coordinates": rings} if rings else None
    if kind == "MultiPolygon":
        polys = []
        for polygon in geometry["coordinates"]:
            rings = [r for r in (clean_ring(p) for p in polygon) if r]
            if rings:
                polys.append(rings)
        return {"type": "MultiPolygon", "coordinates": polys} if polys else None
    return None


def ring_count(geometry) -> int:
    if geometry["type"] == "Polygon":
        return len(geometry["coordinates"])
    return sum(len(p) for p in geometry["coordinates"])


def main() -> None:
    countries = download("countries", SOURCES["countries"])
    india = next(
        f for f in countries["features"]
        if f["properties"].get("ADM0_A3") == "IND"
        or f["properties"].get("name") == "India"
    )
    outline = clean_geometry(india["geometry"])
    assert outline, "India outline vanished during simplification"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "india-outline.json").write_text(
        json.dumps(
            {"type": "Feature", "properties": {"name": "India"},
             "geometry": outline},
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    states = download("states", SOURCES["states"])
    features = []
    for feature in states["features"]:
        props = feature["properties"]
        adm0 = props.get("adm0_a3") or props.get("ADM0_A3")
        if adm0 != "IND":
            continue
        geometry = clean_geometry(feature["geometry"])
        if not geometry:
            continue
        name = props.get("name") or props.get("name_en") or "State"
        features.append(
            {"type": "Feature",
             "properties": {"name": name},
             "geometry": geometry}
        )
    features.sort(key=lambda f: f["properties"]["name"])
    (OUT_DIR / "india-states.json").write_text(
        json.dumps({"type": "FeatureCollection", "features": features},
                   separators=(",", ":")),
        encoding="utf-8",
    )

    for name in ("india-outline.json", "india-states.json"):
        path = OUT_DIR / name
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["type"] == "Feature":
            rings = ring_count(data["geometry"])
        else:
            rings = sum(ring_count(f["geometry"]) for f in data["features"])
            print(f"{name}: {len(data['features'])} features")
        print(f"{name}: {rings} rings, {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
