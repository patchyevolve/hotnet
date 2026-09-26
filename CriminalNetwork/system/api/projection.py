"""Project pipeline output into the shapes the frontend's ``types.ts`` declares.

Every function here is total: if ``output_geo`` is missing, empty, or a file is
absent, the caller gets an empty list or a zero-valued summary. That is what
makes the UI start at zero before anything has been uploaded, rather than
rendering placeholder measurements.

Counting rules
--------------
Counts may legitimately be 0 — "no calls in this run" is a true statement.
Measurements may not: if a source record has no timestamp or no duration, the
record is *dropped* rather than emitted with ``0``, because a fabricated 0
would be indistinguishable from a real one.

Risk derivation
---------------
The pipeline stores no per-node risk field (verified across ``resolved_entities``,
``graph_nodes``, ``entity_index``, ``global_entities``). Risk is therefore
derived, in two steps, both structurally:

1. A node incident to an edge that Stage 1 flagged adversarial is ``critical``.
   Those are the pipeline's own judgement, not ours.
2. Otherwise the node is banded by quartile of degree centrality across this
   run — boundaries come from the data, so no tuned constant is involved.

Quartile banding always fills all four bands by construction; that is a
property of the method, not a claim that a quarter of the network is critical.
"""

from __future__ import annotations

import json
import math
import statistics
from functools import cached_property
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

# node_type (pipeline) -> EntityKind (frontend).
# The frontend union is extended with amount/date/event/device because those
# node types exist in the graph and dropping them would hide ~40% of it.
_KIND_BY_NODE_TYPE: dict[str, str] = {
    "person": "person",
    "phone": "phone",
    "account": "account",
    "organization": "organization",
    "location": "location",
    "vehicle": "vehicle",
    "amount": "amount",
    "date": "date",
    "event": "event",
    "device": "device",
}
_DEFAULT_KIND = "event"

# risk_band (zone_scores) -> RiskLevel
_BAND_TO_RISK: dict[str, str] = {
    "RED": "critical",
    "ORANGE": "high",
    "AMBER": "high",
    "YELLOW": "medium",
    "GREEN": "low",
    "BLUE": "low",
}

# Mirrors MoneyTransaction["channel"] in types.ts. Anything outside this set
# is treated as unknown rather than coerced into a plausible-sounding value.
_MONEY_CHANNELS = frozenset({"upi", "neft", "imps", "atm", "crypto", "cash"})

# Group labels for the search dropdown, matching entityKindLabels in format.ts.
_SEARCH_KINDS: tuple[tuple[str, str], ...] = (
    ("person", "Persons"),
    ("phone", "Phones"),
    ("account", "Accounts"),
    ("vehicle", "Vehicles"),
    ("organization", "Organizations"),
    ("location", "Locations"),
    ("amount", "Amounts"),
    ("date", "Dates"),
    ("event", "Events"),
    ("device", "Devices"),
)
_SEARCH_KIND_ORDER: tuple[str, ...] = tuple(kind for kind, _ in _SEARCH_KINDS)
_SEARCH_KIND_LABELS: dict[str, str] = dict(_SEARCH_KINDS)

# Mirrors CaseStatus in types.ts. The registry stores free text; anything
# outside this set falls back to "open" rather than being coerced.
_CASE_STATUSES = frozenset(
    {"open", "active", "under_review", "charge_sheet", "closed"}
)

_EMPTY_COUNTS = {
    "total": 0,
    "byKind": {},
    "byRisk": {"critical": 0, "high": 0, "medium": 0, "low": 0},
}


#: Keep markers off the very edge of the canvas box.
_CANVAS_PAD = 6.0


def _project_to_canvas(
    latitude: float, longitude: float, markers: list[dict[str, Any]]
) -> tuple[float, float]:
    """Fit one ``latitude``/``longitude`` onto the 0-100 canvas box.

    Equirectangular and north-up: longitude drives ``x`` ascending, latitude
    drives ``y`` descending. The bounding box is taken from every marker, not
    from this point, so the fit is identical for all of them. A degenerate span
    (one point, or all points on one line) falls back to the centre of the box
    instead of dividing by zero.
    """
    lats = [float(marker["latitude"]) for marker in markers]
    lons = [float(marker["longitude"]) for marker in markers]
    lat_min, lat_max = min(lats), max(lats)
    lon_min, lon_max = min(lons), max(lons)
    span_lat = lat_max - lat_min
    span_lon = lon_max - lon_min
    usable = 100.0 - 2 * _CANVAS_PAD

    x = (
        50.0
        if span_lon <= 0.0
        else _CANVAS_PAD + (longitude - lon_min) / span_lon * usable
    )
    y = (
        50.0
        if span_lat <= 0.0
        else _CANVAS_PAD + (lat_max - latitude) / span_lat * usable
    )
    return round(x, 3), round(y, 3)


def _spatial_zone_links(
    spatial_rows: list[dict[str, Any]], zone_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Join a geocoded entity location to the risk zones that name it.

    Both sides already carry a place name, so the link is a name match — no
    distance threshold is guessed. A zone name that is a bare single word is
    skipped, otherwise the city name ("Delhi") would link to every point in the
    city and the line would mean nothing.
    """
    links: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for spatial in spatial_rows:
        spatial_id = str(spatial.get("id") or "")
        address = str(spatial.get("address") or "").strip().lower()
        if not spatial_id or not address:
            continue
        for zone in zone_rows:
            zone_id = str(zone.get("hex_id") or "")
            if not zone_id:
                continue
            matched = ""
            for name in zone.get("location_names") or []:
                text = str(name).strip().lower()
                if " " not in text:
                    continue
                if text in address or address in text:
                    matched = str(name).strip()
                    break
            if not matched:
                continue
            key = (spatial_id, zone_id)
            if key in seen:
                continue
            seen.add(key)
            links.append(
                {
                    "id": f"{spatial_id}__{zone_id}",
                    "from": spatial_id,
                    "to": zone_id,
                    "label": matched,
                }
            )
    return links


def _present(row: dict[str, Any]) -> dict[str, Any]:
    """Drop ``None`` so an unknown field is absent rather than ``null``.

    The frontend types mark these fields optional; ``null`` would not satisfy
    ``district?: string``, and an empty string would be a fabricated value.
    """
    return {key: value for key, value in row.items() if value is not None}


def _risk_from_quartile(rank: int) -> str:
    """Map a 0-based quartile rank (0 = least central) to a risk level.

    ``critical`` is deliberately unreachable here: the pipeline has no risk
    field, so a quartile cannot tell us an entity is critical — only that it is
    well connected. Critical stays reserved for nodes the adversarial screen
    actually flagged, so "critical" keeps meaning "the pipeline raised this".
    """
    return ("low", "low", "medium", "high")[max(0, min(3, rank))]


class RunProjection:
    """Reads one case's ``output_geo`` directory and shapes it for the API.

    ``uploaded`` / ``ingested`` / ``tampered`` come from outside the run:
    an incremental run rewrites ``extraction_summary.json`` with only the files
    it just processed, so the registry's upload list and an accumulated ledger
    of verdicts are what keep the evidence view from shrinking between runs.
    Pass them through ``ApiState``; omit them to project a run directory on its
    own (the demo/CLI case, where the run's summary is the only source).
    """

    def __init__(
        self,
        output_dir: Path | str,
        uploaded: list[dict[str, Any]] | None = None,
        ingested: dict[str, str] | None = None,
        tampered: set[str] | None = None,
        case_id: str = "",
    ) -> None:
        self.output_dir = Path(output_dir)
        self._uploaded = uploaded
        self._ingested = ingested or {}
        self._tampered = tampered or set()
        # The run directory belongs to exactly one case; entities carry that
        # case id so the UI can link back without guessing.
        self.case_id = case_id

    # -- raw loading ------------------------------------------------------
    def _path(self, name: str) -> Path:
        return self.output_dir / name

    def read(self, name: str) -> Any:
        """Return parsed JSON, or ``None`` when the run has not produced it."""
        path = self._path(name)
        if not path.is_file():
            return None
        try:
            with path.open(encoding="utf-8") as handle:
                return json.load(handle)
        except (ValueError, OSError):
            return None

    def _list(self, name: str) -> list[dict[str, Any]]:
        data = self.read(name)
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    @property
    def exists(self) -> bool:
        """True once a run has written anything at all."""
        if not self.output_dir.is_dir():
            return False
        return self._path("graph_nodes.json").is_file() or any(
            self.output_dir.glob("*.json")
        )

    @cached_property
    def run_id(self) -> str:
        analytics = self.read("analytics_output.json")
        if isinstance(analytics, dict) and analytics.get("run_id"):
            return str(analytics["run_id"])
        nodes = self._list("graph_nodes.json")
        for node in nodes:
            if node.get("run_id"):
                return str(node["run_id"])
        return ""

    # -- shared derivations -----------------------------------------------
    @cached_property
    def _suspicious_nodes(self) -> set[str]:
        flagged = {
            row.get("edge_id")
            for row in self._list("adversarial_scores.json")
            if row.get("is_suspicious")
        }
        touched: set[str] = set()
        for edge in self._list("graph_edges.json"):
            if edge.get("id") in flagged:
                touched.add(str(edge.get("source_id", "")))
                touched.add(str(edge.get("target_id", "")))
        touched.discard("")
        return touched

    @cached_property
    def _centrality(self) -> dict[str, dict[str, Any]]:
        return {
            str(row.get("node_id")): row
            for row in self._list("centrality_scores.json")
            if row.get("node_id")
        }

    @cached_property
    def _quartile_edges(self) -> list[float]:
        values = [
            float(row["degree_centrality"])
            for row in self._centrality.values()
            if isinstance(row.get("degree_centrality"), (int, float))
        ]
        if len(values) < 4:
            return []
        try:
            return list(statistics.quantiles(values, n=4))
        except statistics.StatisticsError:
            return []

    def _risk_for_node(self, node_id: str) -> str:
        if node_id in self._suspicious_nodes:
            return "critical"
        row = self._centrality.get(node_id)
        if not row:
            return "low"
        value = row.get("degree_centrality")
        if not isinstance(value, (int, float)):
            return "low"
        edges = self._quartile_edges
        if not edges:
            return "low"
        # bisect-style banding on the three quartile boundaries.
        rank = sum(1 for boundary in edges if value > boundary)
        return _risk_from_quartile(rank)

    @staticmethod
    def _kind(raw: Any) -> str:
        if not raw:
            return _DEFAULT_KIND
        return _KIND_BY_NODE_TYPE.get(str(raw).lower(), _DEFAULT_KIND)

    @staticmethod
    def _confidence(value: Any) -> float:
        if isinstance(value, dict):
            value = value.get("score")
        if isinstance(value, (int, float)):
            return round(float(value), 4)
        try:
            return round(float(str(value)), 4)
        except (TypeError, ValueError):
            return 0.0

    # ------------------------------------------------------------------
    # Cases
    # ------------------------------------------------------------------
    def case_records(
        self,
        case_id: str,
        registry_case: Any = None,
        fir_numbers: list[str] | None = None,
        case_status: str | None = None,
    ) -> list[dict[str, Any]]:
        """One CaseRecord for this run.

        Identity (title, FIR number, officer) comes from the registry, which is
        where the investigator typed it. Counts come from the run.
        """
        if not self.exists and registry_case is None:
            return []

        counts = self.entity_counts()
        nodes = self._list("graph_nodes.json")
        hypotheses = self._list("hypotheses.json")
        audit = self._list("audit_trail.json")
        evidence_rows = self.evidence_records()

        title = case_id
        description = ""
        opened_at = ""
        updated_at = ""
        district = ""
        lead_officer = ""
        lead_officer_id = ""

        if registry_case is not None:
            case_dict = (
                registry_case.to_dict()
                if hasattr(registry_case, "to_dict")
                else dict(registry_case)
            )
            title = case_dict.get("title") or title
            description = case_dict.get("description") or ""
            opened_at = case_dict.get("opened_at") or ""
            updated_at = case_dict.get("updated_at") or opened_at
            district = case_dict.get("jurisdiction_node_id") or ""
            lead_officer_id = case_dict.get("opened_by") or ""
            lead_officer = case_dict.get("opened_by_display") or lead_officer_id

        # The human FIR number lives on the FIR record, not the case.
        fir_number = (fir_numbers or [""])[0]

        if not updated_at and audit:
            updated_at = str(audit[-1].get("timestamp") or "")
        if not opened_at and audit:
            opened_at = str(audit[0].get("timestamp") or "")

        entity_ids = [node["id"] for node in nodes if node.get("id")][:200]

        # progress = share of pipeline stages that produced output this run.
        stage_markers = (
            "extraction_summary.json",
            "resolution_history.json",
            "temporal_log.json",
            "graph_nodes.json",
            "analytics_output.json",
            "hypotheses.json",
            "contradictions.json",
            "evidence_gaps.json",
            "critic_review.json",
            "global_entities.json",
        )
        produced = sum(1 for name in stage_markers if self._path(name).is_file())

        # Registry status is the investigator's; case priority and category do
        # not exist anywhere in the pipeline output, so they stay absent.
        raw_status = str(case_status or "open")
        if raw_status not in _CASE_STATUSES:
            raw_status = "open"

        return [
            _present(
                {
                    "id": case_id,
                    "firNumber": fir_number,
                    "title": title,
                    "summary": description,
                    "status": raw_status,
                    "priority": None,
                    "risk": self.overall_risk(),
                    "district": district or None,
                    "station": district or None,
                    "category": None,
                    "openedAt": opened_at,
                    "updatedAt": updated_at,
                    "leadOfficer": lead_officer,
                    "leadOfficerId": lead_officer_id,
                    "entityIds": entity_ids,
                    "evidenceCount": len(evidence_rows),
                    "linkedCaseIds": [],
                    "progress": int(round(100 * produced / len(stage_markers))),
                    "counts": {
                        **counts,
                        "hypotheses": len(hypotheses),
                        "auditEvents": len(audit),
                        "nodes": len(nodes),
                    },
                }
            )
        ]

    def overall_risk(self) -> str:
        """Highest band present, so the case row reflects its worst node."""
        band = self.entity_counts()["byRisk"]
        for level in ("critical", "high", "medium", "low"):
            if band.get(level):
                return level
        return "low"

    def entity_counts(self) -> dict[str, Any]:
        by_kind: dict[str, int] = {}
        by_risk = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for node in self._list("graph_nodes.json"):
            kind = self._kind(node.get("node_type"))
            by_kind[kind] = by_kind.get(kind, 0) + 1
            by_risk[self._risk_for_node(str(node.get("id", "")))] += 1
        if not by_kind:
            return json.loads(json.dumps(_EMPTY_COUNTS))
        return {
            "total": sum(by_kind.values()),
            "byKind": by_kind,
            "byRisk": by_risk,
        }

    # ------------------------------------------------------------------
    # Entities
    # ------------------------------------------------------------------
    def entities(self) -> list[dict[str, Any]]:
        resolved = self.read("resolved_entities.json")
        rows: list[dict[str, Any]] = []
        if isinstance(resolved, dict):
            items: Iterable[Any] = resolved.values()
        else:
            items = self._list("resolved_entities.json")

        graph_by_id = {
            str(node.get("id")): node for node in self._list("graph_nodes.json")
        }

        # Adjacency straight from the run's edges, so "connections" means the
        # same thing here as it does on the graph.
        neighbours: dict[str, set[str]] = {}
        for edge in self._list("graph_edges.json"):
            source = str(edge.get("source_id") or "")
            target = str(edge.get("target_id") or "")
            if not source or not target or source == target:
                continue
            neighbours.setdefault(source, set()).add(target)
            neighbours.setdefault(target, set()).add(source)

        for item in items:
            if not isinstance(item, dict):
                continue
            entity_id = str(item.get("id") or "")
            if not entity_id:
                continue
            node = graph_by_id.get(entity_id, {})
            attributes = item.get("attributes") or {}
            if not isinstance(attributes, dict):
                attributes = {}

            identifiers: list[dict[str, str]] = []
            for number in item.get("phones") or []:
                identifiers.append(
                    {"label": "Phone", "value": str(number), "kind": "phone"}
                )
            for account in item.get("accounts") or []:
                identifiers.append(
                    {"label": "Account", "value": str(account), "kind": "account"}
                )
            for address in item.get("addresses") or []:
                identifiers.append(
                    {"label": "Address", "value": str(address), "kind": "location"}
                )

            rows.append(
                {
                    "id": entity_id,
                    "kind": self._kind(item.get("entity_type") or node.get("node_type")),
                    "name": str(item.get("canonical_name") or node.get("name") or entity_id),
                    "alias": [str(a) for a in (item.get("aliases") or [])],
                    "risk": self._risk_for_node(entity_id),
                    "summary": self._summary(item, node),
                    "identifiers": identifiers,
                    "linkedCaseIds": [self.case_id] if self.case_id else [],
                    "linkedEntityIds": sorted(neighbours.get(entity_id, set())),
                    "firstSeen": str(item.get("created_at") or ""),
                    "lastSeen": str(item.get("updated_at") or item.get("created_at") or ""),
                    "tags": [str(t) for t in (item.get("provenance_chain") or [])][:6],
                    "attributes": {
                        str(k): str(v)
                        for k, v in attributes.items()
                        if not isinstance(v, (list, dict))
                    },
                    # extra, not in the original mock contract:
                    "epistemicStatus": str(item.get("epistemic_status") or ""),
                    "confidence": self._confidence(
                        item.get("effective_confidence") or node.get("effective_confidence")
                    ),
                    "sourceFiles": [
                        str(s) for s in (item.get("provenance_chain") or [])
                    ],
                }
            )
        rows = [_present(row) for row in rows]
        rows.sort(key=lambda row: row["name"].lower())
        return rows

    @staticmethod
    def _summary(item: dict[str, Any], node: dict[str, Any]) -> str:
        parts = []
        if item.get("entity_type"):
            parts.append(str(item["entity_type"]).title())
        if item.get("epistemic_status"):
            parts.append(f"{item['epistemic_status']}")
        if item.get("merge_type"):
            parts.append(f"merged via {item['merge_type']}")
        if node.get("resolution_status"):
            parts.append(str(node["resolution_status"]))
        return " · ".join(parts)

    # ------------------------------------------------------------------
    # Network
    # ------------------------------------------------------------------
    def network(self, case_id: str = "") -> dict[str, Any]:
        nodes = self._list("graph_nodes.json")
        edges = self._list("graph_edges.json")
        if not nodes:
            return {"caseId": case_id, "nodes": [], "edges": []}

        positions = self._layout(nodes, edges)
        out_nodes = []
        for node in nodes:
            node_id = str(node.get("id") or "")
            if not node_id:
                continue
            x, y = positions.get(node_id, (50.0, 50.0))
            out_nodes.append(
                {
                    "id": node_id,
                    "label": str(node.get("name") or node_id),
                    "kind": self._kind(node.get("node_type")),
                    "risk": self._risk_for_node(node_id),
                    "x": x,
                    "y": y,
                    # Overwritten below once real degrees are counted; the
                    # placeholder only keeps the record well-formed.
                    "radius": 3.0,
                }
            )

        degree = {node["id"]: 0 for node in out_nodes}
        out_edges = []
        for edge in edges:
            source = str(edge.get("source_id") or "")
            target = str(edge.get("target_id") or "")
            if not source or not target or source == target:
                continue
            if source in degree:
                degree[source] += 1
            if target in degree:
                degree[target] += 1
            label = str(edge.get("relationship_type") or "RELATED")
            out_edges.append(
                {
                    "id": str(edge.get("id") or f"{source}->{target}"),
                    "source": source,
                    "target": target,
                    "label": label.replace("_", " ").title(),
                    "weight": self._confidence(edge.get("confidence")),
                    "risk": self._risk_for_edge(edge),
                }
            )

        if out_nodes:
            max_degree = max(degree.values()) or 1
            for node in out_nodes:
                node["radius"] = round(
                    2.5 + 7.0 * (degree.get(node["id"], 0) / max_degree), 2
                )

        return {"caseId": case_id, "nodes": out_nodes, "edges": out_edges}

    def _risk_for_edge(self, edge: dict[str, Any]) -> str:
        if str(edge.get("id")) in {
            row.get("edge_id")
            for row in self._list("adversarial_scores.json")
            if row.get("is_suspicious")
        }:
            return "critical"
        score = self._confidence(edge.get("confidence"))
        # Highest confidence edges are the load-bearing claims of the graph.
        if score >= 0.9:
            return "high"
        if score >= 0.7:
            return "medium"
        return "low"

    #: Fruchterman-Reingold iterations. Fixed, so the picture is reproducible.
    _LAYOUT_ITERATIONS = 80
    #: Canvas padding, in 0-100 units, kept clear of every node.
    _LAYOUT_PAD = 6.0
    #: Cooling floor: below this the relaxation stops settling and just jitters.
    _LAYOUT_MIN_TEMP = 0.15

    @classmethod
    def _layout(
        cls, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]
    ) -> dict[str, tuple[float, float]]:
        """Place nodes so the graph's own structure is visible.

        Two halves, because they answer different questions.

        The connected nodes are relaxed with Fruchterman-Reingold over their
        own adjacency: they pull together along real edges and push apart
        everywhere else, so the communities the pipeline found read as
        clusters instead of as crossing spokes. Relaxing them *with* the
        leaves is what used to knot the interesting part of the graph into a
        ball at the centre — a node with no edges feels only repulsion, so a
        hundred of them shove the core inward and then pile up on the hull.
        So the core gets the whole inner canvas.

        The leaves have no structure to reveal, and scattering them produced a
        ragged ring that read as noise. They are laid out deliberately
        instead, on concentric bands around the core: visible, countable, and
        obviously the unconnected remainder.

        The seed is a fixed ring (no random source) and the iteration count is
        constant, so the same graph always draws the same way and a client-side
        filter can never shuffle nodes under the cursor.

        A graph with no edges has no structure to reveal — it falls back to
        concentric rings by node type, which at least keeps the kinds apart.
        """
        ids: list[str] = []
        seen: set[str] = set()
        for node in nodes:
            node_id = str(node.get("id") or "")
            if node_id and node_id not in seen:
                seen.add(node_id)
                ids.append(node_id)
        if not ids:
            return {}

        pairs: list[tuple[str, str]] = []
        for edge in edges:
            source = str(edge.get("source_id") or "")
            target = str(edge.get("target_id") or "")
            if source and target and source != target:
                pairs.append((source, target))

        if not pairs:
            return cls._ring_layout(nodes)

        count = len(ids)
        index = {node_id: i for i, node_id in enumerate(ids)}
        adjacency: list[set[int]] = [set() for _ in range(count)]
        for source, target in pairs:
            i = index.get(source)
            j = index.get(target)
            if i is None or j is None or i == j:
                continue
            adjacency[i].add(j)
            adjacency[j].add(i)

        connected = [i for i in range(count) if adjacency[i]]
        isolated = [i for i in range(count) if not adjacency[i]]
        if not connected:
            # Every edge pointed at a node this projection dropped.
            return cls._ring_layout(nodes)

        # The core relaxes into an inner disc when there are leaves to ring
        # around it, and into the full padded square when it is on its own.
        # 31 is measured on the real 193-node corpus: the leaf rings sit at
        # r=35..43, so the core hull must stay under ~31 to leave a visible
        # gap; the connected nodes keep ~4 units of median neighbour spacing.
        core_limit = 31.0 if isolated else 44.0
        core_points = cls._fruchterman(
            connected,
            adjacency,
            math.pi * core_limit * core_limit,
            max_radius=core_limit if isolated else None,
        )

        core_xs = [point[0] for point in core_points]
        core_ys = [point[1] for point in core_points]
        centre_x = (max(core_xs) + min(core_xs)) / 2.0
        centre_y = (max(core_ys) + min(core_ys)) / 2.0
        # Containment above already holds the disc to core_limit; this is a
        # safety net only (normally shrink == 1).
        max_radius = max(
            math.hypot(x - centre_x, y - centre_y) for x, y in core_points
        )
        shrink = (core_limit / max_radius) if max_radius > core_limit else 1.0

        positions: dict[str, tuple[float, float]] = {}
        for node_id, (x, y) in zip(
            (ids[i] for i in connected), core_points, strict=True
        ):
            positions[node_id] = (
                50.0 + (x - centre_x) * shrink,
                50.0 + (y - centre_y) * shrink,
            )

        if isolated:
            ring_radii = [41.0] if len(isolated) <= 55 else [35.0, 43.0]
            buckets: list[list[int]] = [[] for _ in ring_radii]
            for offset, node_index in enumerate(isolated):
                buckets[offset % len(ring_radii)].append(node_index)
            for ring_index, (radius, bucket) in enumerate(
                zip(ring_radii, buckets, strict=True)
            ):
                if not bucket:
                    continue
                # Offset alternate bands so the two do not line up into spokes.
                phase = (math.pi / len(bucket)) * ring_index
                for position, node_index in enumerate(bucket):
                    angle = phase + (2 * math.pi * position) / len(bucket)
                    positions[ids[node_index]] = (
                        50.0 + radius * math.cos(angle),
                        50.0 + radius * math.sin(angle),
                    )

        return cls._fit(positions)

    @classmethod
    def _fruchterman(
        cls,
        members: list[int],
        adjacency: list[set[int]],
        area: float,
        max_radius: float | None = None,
    ) -> list[tuple[float, float]]:
        """Relax the given node indices, addressed in the caller's index space.

        Same force model as before — ideal-area repulsion between every pair,
        attraction once per real edge, a cooling schedule with a floor — but it
        only considers `members`, so nodes outside the subset neither repel nor
        attract, and `area` is the region the result should occupy rather than
        the whole canvas. Positions come back as a list parallel to `members`.

        The seed is a sunflower lattice filling a disc of that area, not a thin
        ring. A ring packs `count` nodes onto a circumference of 2*pi*ideal,
        which for a few hundred nodes is a fraction of a unit apart; the
        repulsion that follows throws the graph several canvases wide before
        cooling can catch it, and normalising that runaway back onto the canvas
        squashes the node *spacing* along with it — which is how the core ended
        up a solid knot of overlapping circles. Starting at the equilibrium
        spacing means relaxation only has to refine.
        """
        count = len(members)
        if count == 1:
            return [(50.0, 50.0)]

        ideal = math.sqrt(area / count)
        radius = math.sqrt(area / math.pi)
        golden_angle = math.pi * (3.0 - math.sqrt(5.0))

        xs = [0.0] * count
        ys = [0.0] * count
        for i in range(count):
            r = radius * math.sqrt((i + 0.5) / count)
            theta = i * golden_angle
            xs[i] = 50.0 + r * math.cos(theta)
            ys[i] = 50.0 + r * math.sin(theta)

        temperature = 0.5 * ideal
        for _ in range(cls._LAYOUT_ITERATIONS):
            dx = [0.0] * count
            dy = [0.0] * count

            # Repulsion between every pair.
            for i in range(count):
                xi, yi = xs[i], ys[i]
                for j in range(i + 1, count):
                    ddx = xi - xs[j]
                    ddy = yi - ys[j]
                    separation = ddx * ddx + ddy * ddy
                    if separation < 1e-6:
                        # Exactly coincident: nudge rather than divide by zero.
                        ddx, ddy, separation = 1e-3, 1e-3, 1e-6
                    distance = math.sqrt(separation)
                    force = (ideal * ideal) / distance
                    fx = (ddx / distance) * force
                    fy = (ddy / distance) * force
                    dx[i] += fx
                    dy[i] += fy
                    dx[j] -= fx
                    dy[j] -= fy

            # Attraction along real edges, each one visited once.
            for i in range(count):
                neighbours = adjacency[members[i]]
                for j in range(i + 1, count):
                    if members[j] not in neighbours:
                        continue
                    ddx = xs[i] - xs[j]
                    ddy = ys[i] - ys[j]
                    separation = ddx * ddx + ddy * ddy
                    if separation < 1e-6:
                        continue
                    distance = math.sqrt(separation)
                    force = separation / ideal
                    fx = (ddx / distance) * force
                    fy = (ddy / distance) * force
                    dx[i] -= fx
                    dy[i] -= fy
                    dx[j] += fx
                    dy[j] += fy

            for i in range(count):
                step = math.hypot(dx[i], dy[i])
                if step < 1e-9:
                    continue
                travel = min(step, temperature)
                xs[i] += (dx[i] / step) * travel
                ys[i] += (dy[i] / step) * travel

            # Containment: hold the cloud inside the disc while it relaxes so
            # repulsion equilibrates against the boundary instead of being
            # squashed onto it afterwards (a post-hoc squash scales node
            # spacing down with the radius — the core turns into a knot).
            if max_radius is not None:
                for i in range(count):
                    ox, oy = xs[i] - 50.0, ys[i] - 50.0
                    r = math.hypot(ox, oy)
                    if r > max_radius and r > 1e-9:
                        scale = max_radius / r
                        xs[i] = 50.0 + ox * scale
                        ys[i] = 50.0 + oy * scale

            # Cool, but not to nothing — a floor keeps late moves meaningful.
            temperature = max(temperature * 0.90, cls._LAYOUT_MIN_TEMP)

        return list(zip(xs, ys, strict=True))

    @classmethod
    def _ring_layout(cls, nodes: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
        """Fallback for a graph with no edges: concentric rings by node type."""
        grouped: dict[str, list[str]] = {}
        for node in nodes:
            node_id = str(node.get("id") or "")
            if not node_id:
                continue
            grouped.setdefault(str(node.get("node_type") or "other"), []).append(node_id)

        kinds = sorted(grouped)
        ring_count = max(1, len(kinds))
        positions: dict[str, tuple[float, float]] = {}
        for ring_index, kind in enumerate(kinds):
            ids = sorted(grouped[kind])
            ring_radius = 14.0 + 26.0 * (ring_index + 1) / ring_count
            count = max(1, len(ids))
            for position, node_id in enumerate(ids):
                angle = (2 * math.pi * position) / count
                positions[node_id] = (
                    ring_radius * math.cos(angle),
                    ring_radius * math.sin(angle),
                )
        return cls._fit(positions)

    @classmethod
    def _fit(
        cls, positions: dict[str, tuple[float, float]]
    ) -> dict[str, tuple[float, float]]:
        """Rescale a point cloud into the padded 0-100 canvas box.

        A single point, or a set collapsed onto one line, has no span on an
        axis; that axis is centred rather than divided through.
        """
        if not positions:
            return {}
        xs = [point[0] for point in positions.values()]
        ys = [point[1] for point in positions.values()]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        span_x = x_max - x_min
        span_y = y_max - y_min
        usable = 100.0 - 2 * cls._LAYOUT_PAD

        fitted: dict[str, tuple[float, float]] = {}
        for node_id, (x, y) in positions.items():
            nx = 50.0 if span_x <= 0 else cls._LAYOUT_PAD + (x - x_min) / span_x * usable
            ny = 50.0 if span_y <= 0 else cls._LAYOUT_PAD + (y - y_min) / span_y * usable
            fitted[node_id] = (round(nx, 3), round(ny, 3))
        return fitted

    # ------------------------------------------------------------------
    # CDR
    # ------------------------------------------------------------------
    def cdr_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        node_name = {
            str(node.get("id")): str(node.get("name") or "")
            for node in self._list("graph_nodes.json")
        }
        index = 0
        for relation in self._list("relations.json"):
            rel_type = str(relation.get("relation_type") or "")
            if rel_type not in {"CALLED", "VISITED"}:
                continue
            attributes = relation.get("attributes") or {}
            if not isinstance(attributes, dict):
                continue
            timestamp = attributes.get("timestamp")
            duration = attributes.get("duration")
            if not timestamp:
                # A call with no time cannot be placed on the CDR timeline.
                continue
            try:
                duration_sec = int(float(str(duration)))
            except (TypeError, ValueError):
                continue
            index += 1
            caller = str(attributes.get("phone") or relation.get("source_entity_id") or "")
            callee = str(attributes.get("phone_2") or relation.get("target_entity_id") or "")
            location = str(attributes.get("location") or "")
            direction = str(attributes.get("direction") or "")
            flagged = relation.get("id") in {
                row.get("edge_id")
                for row in self._list("adversarial_scores.json")
                if row.get("is_suspicious")
            }
            records.append(
                {
                    "id": str(relation.get("id") or f"CDR_{index}"),
                    "caller": caller,
                    "callerName": str(attributes.get("source_name") or node_name.get(caller, "") or caller),
                    "callee": callee,
                    "calleeName": str(attributes.get("target_name") or node_name.get(callee, "") or callee),
                    "startedAt": str(timestamp),
                    "durationSec": duration_sec,
                    # Absent in the source stays absent; the type marks both
                    # optional so the UI can render "—" instead of a blank.
                    "cellTower": location or None,
                    "type": "voice",
                    "flagged": bool(flagged),
                    "direction": direction or None,
                    "sourceFile": str(relation.get("source_id") or ""),
                }
            )
        records = [_present(row) for row in records]
        records.sort(key=lambda row: row["startedAt"])
        return records

    def cdr_summary(self) -> dict[str, Any]:
        records = self.cdr_records()
        if not records:
            return {
                "totalCalls": 0,
                "uniqueNumbers": 0,
                "commonNumbers": 0,
                "anomalies": 0,
                "flaggedCalls": 0,
                "nightCalls": 0,
                "topContacts": [],
                "hourly": [],
                "timeline": [],
            }

        contacts: dict[str, dict[str, Any]] = {}
        hourly: dict[int, int] = {}
        numbers: set[str] = set()
        night = 0
        flagged = 0
        for row in records:
            numbers.add(row["caller"])
            numbers.add(row["callee"])
            key = row["callee"] or row["calleeName"]
            entry = contacts.setdefault(
                key,
                {"number": row["callee"], "name": row["calleeName"], "count": 0},
            )
            entry["count"] += 1
            hour = int(str(row["startedAt"])[11:13] or 0)
            hourly[hour] = hourly.get(hour, 0) + 1
            if hour < 6 or hour >= 21:
                night += 1
            if row["flagged"]:
                flagged += 1

        top = sorted(contacts.values(), key=lambda row: row["count"], reverse=True)[:6]
        timeline = [
            {
                "id": row["id"],
                "time": row["startedAt"],
                "label": f"{row['callerName'] or row['caller']} → {row['calleeName'] or row['callee']}",
                "detail": f"{row['durationSec']}s · {row.get('cellTower') or 'no tower recorded'}",
                "risk": "high" if row["flagged"] else "low",
            }
            for row in records[:: max(1, len(records) // 12)][:12]
        ]
        return {
            "totalCalls": len(records),
            "uniqueNumbers": len(numbers),
            "commonNumbers": len(contacts),
            "anomalies": flagged,
            "flaggedCalls": flagged,
            "nightCalls": night,
            "topContacts": top,
            "hourly": [
                {"hour": f"{hour:02d}", "count": hourly[hour]}
                for hour in sorted(hourly)
            ],
            "timeline": timeline,
        }

    # ------------------------------------------------------------------
    # Money
    # ------------------------------------------------------------------
    @cached_property
    def _amount_names(self) -> dict[str, str]:
        """AMOUNT entity id -> its rendered name (``Rs. 5,00,000``).

        Narrative transfers carry the sum as the *source entity*, not in
        ``attributes``, so the value has to be looked up.
        """
        extraction = self.read("extraction_output.json")
        if not isinstance(extraction, dict):
            return {}
        return {
            str(row.get("id")): str(row.get("name") or "")
            for row in extraction.get("entities") or []
            if row.get("entity_type") == "AMOUNT" and row.get("id")
        }

    def _resolve_amount(
        self, relation: dict[str, Any], attributes: dict[str, Any]
    ) -> float | None:
        if attributes.get("amount") is not None:
            return self._parse_amount(attributes.get("amount"))
        source = str(relation.get("source_entity_id") or "")
        if source in self._amount_names:
            return self._parse_amount(self._amount_names[source])
        target = str(relation.get("target_entity_id") or "")
        if target in self._amount_names:
            return self._parse_amount(self._amount_names[target])
        return None

    @staticmethod
    def _resolve_timestamp(
        relation: dict[str, Any], attributes: dict[str, Any]
    ) -> str:
        """Bank rows date the transfer in ``temporal_info`` or ``date``."""
        for candidate in (
            attributes.get("timestamp"),
            (relation.get("temporal_info") or {}).get("timestamp")
            if isinstance(relation.get("temporal_info"), dict)
            else None,
            attributes.get("date"),
        ):
            if candidate:
                return str(candidate)
        return ""

    def money_flow(self, case_id: str = "") -> dict[str, Any]:
        node_name = {
            str(node.get("id")): str(node.get("name") or "")
            for node in self._list("graph_nodes.json")
        }
        transfers: list[dict[str, Any]] = []
        accounts: dict[str, dict[str, Any]] = {}
        total = 0.0
        flagged_total = 0.0
        by_channel: dict[str, float] = {}

        for relation in self._list("relations.json"):
            rel_type = str(relation.get("relation_type") or "")
            if rel_type not in {"TRANSFERRED_TO", "RECEIVED_FROM", "OWNS_ACCOUNT"}:
                continue
            attributes = relation.get("attributes") or {}
            if not isinstance(attributes, dict):
                continue
            amount = self._resolve_amount(relation, attributes)
            if amount is None:
                # No readable amount: keep the link out of the money trail
                # rather than recording a 0-rupee transfer.
                if rel_type == "OWNS_ACCOUNT":
                    source = str(relation.get("source_entity_id") or "")
                    target = str(relation.get("target_entity_id") or "")
                    if source:
                        accounts[source] = {
                            "id": source,
                            "name": node_name.get(source, source),
                            "bank": node_name.get(target, ""),
                            "risk": self._risk_for_node(source),
                        }
                continue

            source = str(relation.get("source_entity_id") or "")
            target = str(relation.get("target_entity_id") or "")
            timestamp = self._resolve_timestamp(relation, attributes)
            if not timestamp:
                # Narrative transfers ("5,00,000 transferred to …") have no
                # date anywhere in the source. They cannot be placed in time,
                # so they stay out of the trail instead of being dated arbitrarily.
                continue
            suspicious = str(relation.get("id")) in {
                row.get("edge_id")
                for row in self._list("adversarial_scores.json")
                if row.get("is_suspicious")
            }
            total += amount
            if suspicious:
                flagged_total += amount
            channel = str(attributes.get("channel") or "").strip().lower()
            # The bank rows carry no channel column. Inventing "cash" would
            # invent a fact, so an unknown channel stays absent and drops out
            # of the by-channel breakdown entirely.
            if channel in _MONEY_CHANNELS:
                by_channel[channel] = by_channel.get(channel, 0.0) + amount
            else:
                channel = ""

            for account_id, bank in ((source, ""), (target, "")):
                if account_id and account_id not in accounts:
                    accounts[account_id] = {
                        "id": account_id,
                        "name": node_name.get(account_id, account_id),
                        "bank": bank or None,
                        "risk": self._risk_for_node(account_id),
                    }

            transfers.append(
                {
                    "id": str(relation.get("id")),
                    "fromAccount": source,
                    "fromName": str(
                        attributes.get("source_name")
                        or node_name.get(source)
                        or source
                    ),
                    "toAccount": target,
                    "toName": str(
                        attributes.get("target_name")
                        or node_name.get(target)
                        or target
                    ),
                    "amount": amount,
                    "currency": "INR",
                    "channel": channel or None,
                    "occurredAt": timestamp,
                    "flagged": suspicious,
                    "risk": "critical" if suspicious else "medium",
                    "note": attributes.get("note") or None,
                }
            )

        transfers = [_present(row) for row in transfers]
        transfers.sort(key=lambda row: row["occurredAt"])
        stages = [
            {
                "id": row["id"],
                "label": f"{row['fromName']} → {row['toName']}",
                "kind": "shell" if row["flagged"] else "cluster",
                "risk": row["risk"],
                "amount": row["amount"],
                "timestamp": row["occurredAt"],
                "transactionId": row["id"],
                "linkedEntity": row["toAccount"],
                "indicators": ["flagged by adversarial screen"] if row["flagged"] else [],
            }
            for row in transfers
        ]
        return {
            "caseId": case_id,
            "totalVolume": round(total, 2),
            "flaggedVolume": round(flagged_total, 2),
            "tracedLabel": f"{len(transfers)} traced transfers",
            "stages": stages,
            "accounts": list(accounts.values()),
            "transactions": transfers,
            "byChannel": [
                {"channel": channel, "amount": round(amount, 2)}
                for channel, amount in sorted(by_channel.items(), key=lambda kv: -kv[1])
            ],
        }

    @staticmethod
    def _parse_amount(raw: Any) -> float | None:
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            return float(raw)
        text = str(raw).replace(",", "")
        digits = "".join(ch for ch in text if ch.isdigit() or ch == ".")
        if not digits or digits == ".":
            return None
        try:
            value = float(digits)
        except ValueError:
            return None
        return value if value > 0 else None

    # ------------------------------------------------------------------
    # Map
    # ------------------------------------------------------------------
    def map_data(self) -> dict[str, Any]:
        """Canvas-space markers plus the links that are actually in the data.

        Markers carry real ``latitude``/``longitude``; ``x``/``y`` are the same
        point fitted to a 0-100 canvas box (north up). The fit is computed once
        over the whole marker set so filtering in the UI never shifts a marker
        under the cursor. Ties are broken to the centre of the box rather than
        invented, so a single point or a collinear set still lands somewhere
        predictable.
        """
        markers: list[dict[str, Any]] = []
        zone_rows: list[dict[str, Any]] = []

        # Risk zones carry real coordinates for every record.
        for zone in self._list("zone_scores.json"):
            latitude = zone.get("latitude")
            longitude = zone.get("longitude")
            if not isinstance(latitude, (int, float)) or not isinstance(
                longitude, (int, float)
            ):
                continue
            band = str(zone.get("risk_band") or "")
            zone_rows.append(zone)
            markers.append(
                {
                    "id": str(zone.get("hex_id") or ""),
                    "label": ", ".join(str(n) for n in (zone.get("location_names") or []))[:60]
                    or str(zone.get("hex_id") or ""),
                    "kind": "incident",
                    "risk": _BAND_TO_RISK.get(band, "medium"),
                    "detail": (
                        f"{zone.get('evidence_count', 0)} evidence · "
                        f"{zone.get('suspect_count', 0)} suspects · risk "
                        f"{zone.get('risk_score')}"
                    ),
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "riskBand": band,
                    "riskScore": zone.get("risk_score"),
                    "evidenceCount": zone.get("evidence_count"),
                }
            )

        # Spatial entities: only the ones the pipeline actually geocoded.
        spatial_rows: list[dict[str, Any]] = []
        for spatial in self._list("spatial_infos.json"):
            latitude = spatial.get("latitude")
            longitude = spatial.get("longitude")
            if not isinstance(latitude, (int, float)) or not isinstance(
                longitude, (int, float)
            ):
                continue
            spatial_rows.append(spatial)
            markers.append(
                {
                    "id": str(spatial.get("id") or ""),
                    "label": str(spatial.get("address") or spatial.get("city") or ""),
                    "kind": "tower" if spatial.get("precision") == "tower" else "location",
                    "risk": "medium",
                    "district": str(spatial.get("city") or "") or None,
                    "detail": str(spatial.get("address") or ""),
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "precision": str(spatial.get("precision") or ""),
                }
            )

        for marker in markers:
            x, y = _project_to_canvas(
                float(marker["latitude"]), float(marker["longitude"]), markers
            )
            marker["x"] = x
            marker["y"] = y

        links = _spatial_zone_links(spatial_rows, zone_rows)
        return {"markers": [_present(marker) for marker in markers], "links": links}

    # ------------------------------------------------------------------
    # Evidence / audit / timeline
    # ------------------------------------------------------------------
    @cached_property
    def _integrity_rows(self) -> list[dict[str, Any]]:
        """``extraction_summary.evidence_integrity`` — the real evidence ledger.

        One record per ingested file, with a genuine sha256, an ingestion
        timestamp and a chain-of-custody list. This is the only source that
        covers every file; ``extraction_output.entities`` only covers files
        that happened to yield an entity.
        """
        summary = self.read("extraction_summary.json")
        if not isinstance(summary, dict):
            return []
        rows = summary.get("evidence_integrity")
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)]

    @cached_property
    def _adversarial_files(self) -> set[str]:
        summary = self.read("extraction_summary.json")
        if not isinstance(summary, dict):
            return set()
        adversarial = (summary.get("ingestion_summary") or {}).get("adversarial") or {}
        if not isinstance(adversarial, dict):
            return set()
        return {str(name) for name in adversarial.get("suspicious_files") or []}

    @staticmethod
    def _evidence_kind(file_name: str) -> str:
        lowered = file_name.lower()
        if lowered.endswith((".png", ".jpg", ".jpeg", ".gif")):
            return "image"
        if lowered.endswith((".mp4", ".mov", ".avi")):
            return "video"
        if lowered.endswith((".wav", ".mp3", ".m4a")):
            return "audio"
        if lowered.endswith((".csv", ".xlsx", ".xls")):
            return "forensic"
        if lowered.endswith((".json",)):
            return "device"
        return "document"

    @cached_property
    def _evidence_bundle(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Evidence rows and their custody events, built together.

        Two sources, deliberately: the registry knows every file ever uploaded
        (so the list cannot shrink when an incremental run rewrites its own
        summary), and the run knows when a file was actually examined.
        """
        flagged = self._adversarial_files | self._tampered
        ingested: dict[str, str] = dict(self._ingested)

        if self._uploaded is not None:
            base = [
                {
                    "label": str(row.get("original_name") or ""),
                    "storageRef": str(row.get("stored_name") or ""),
                    "hash": str(row.get("sha256") or ""),
                    "collectedAt": str(row.get("uploaded_at") or ""),
                    "collectedBy": str(row.get("uploaded_by") or ""),
                }
                for row in self._uploaded
            ]
        else:
            base = []
            for record in self._integrity_rows:
                name = str(record.get("original_filename") or "")
                if not name:
                    continue
                ingested.setdefault(name, str(record.get("ingestion_time") or ""))
                base.append(
                    {
                        "label": name,
                        "storageRef": name,
                        "hash": str(record.get("file_hash") or ""),
                        "collectedAt": "",
                        "collectedBy": "",
                    }
                )

        rows: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []
        sequence = 0
        for index, item in enumerate(base, start=1):
            evidence_id = f"EV_{index:04d}"
            name = item["label"]
            at_upload = ingested.get(name, "")
            checked = bool(at_upload)
            if name in flagged:
                # The pipeline's own adversarial screen flagged this input.
                integrity = "tampered"
            elif checked:
                integrity = "verified"
            else:
                # Uploaded but not yet examined by a run.
                integrity = "pending"

            rows.append(
                _present(
                    {
                        "id": evidence_id,
                        "label": name,
                        "kind": self._evidence_kind(item["storageRef"] or name),
                        "collectedAt": item["collectedAt"] or at_upload or None,
                        "collectedBy": item["collectedBy"] or None,
                        "storageRef": item["storageRef"] or None,
                        "hash": item["hash"] or None,
                        "integrity": integrity,
                    }
                )
            )

            if self._uploaded is not None:
                sequence += 1
                events.append(
                    {
                        "id": f"CUS_{sequence:04d}",
                        "evidenceId": evidence_id,
                        "action": "collected",
                        "actor": item["collectedBy"] or "investigator",
                        "at": item["collectedAt"],
                    }
                )
            if checked:
                sequence += 1
                events.append(
                    {
                        "id": f"CUS_{sequence:04d}",
                        "evidenceId": evidence_id,
                        "action": "analyzed",
                        "actor": "ingestion_engine",
                        "at": at_upload,
                    }
                )

        custody_by_id: dict[str, int] = {}
        for event in events:
            custody_by_id[event["evidenceId"]] = (
                custody_by_id.get(event["evidenceId"], 0) + 1
            )
        for row in rows:
            count = custody_by_id.get(row["id"], 0)
            if count:
                row["custody"] = count

        events.sort(key=lambda row: (row["at"], row["id"]))
        return rows, events

    def evidence_records(self) -> list[dict[str, Any]]:
        return self._evidence_bundle[0]

    def custody_events(self) -> list[dict[str, Any]]:
        """Chain of custody: upload recorded by the registry, examination by
        the pipeline. Files never examined have no ``analyzed`` event.
        """
        return self._evidence_bundle[1]

    #: detail keys whose non-zero value means the stage hit a problem.
    _AUDIT_PROBLEM_KEYS = (
        "files_skipped",
        "adversarial_flagged",
        "rejected_edges",
        "contradictions",
        "unresolved",
        "ambiguous_matches",
    )

    def audit_events(self) -> list[dict[str, Any]]:
        """Audit entries exactly as the pipeline recorded them.

        The source carries no actor identity, role, IP address or hash chain,
        so those fields stay absent rather than being invented. ``severity`` is
        derived: an entry is escalated only when the stage it records reported
        a problem — skipped files, flagged inputs, contradictions, ambiguous
        matches or a failed critic pass.
        """
        rows: list[dict[str, Any]] = []
        for index, entry in enumerate(self._list("audit_trail.json"), start=1):
            details = entry.get("details")
            if not isinstance(details, dict):
                details = {}
            problems = 0
            for key in self._AUDIT_PROBLEM_KEYS:
                value = details.get(key)
                if isinstance(value, (int, float)) and value > 0:
                    problems += 1
            if str(details.get("llm_status") or "") == "failed":
                problems += 1
            rows.append(
                _present(
                    {
                        "id": f"AUD_{index:04d}",
                        "actor": "pipeline",
                        "action": str(entry.get("action") or ""),
                        "target": str(entry.get("stage") or ""),
                        "at": str(entry.get("timestamp") or ""),
                        "severity": "high" if problems else "low",
                    }
                )
            )
        return rows

    def timeline_events(self) -> list[dict[str, Any]]:
        kind_map = {
            "call": "cdr",
            "sms": "cdr",
            "meeting": "network",
            "transfer": "money",
            "payment": "money",
            "arrest": "case",
            "fir": "case",
        }
        rows = []
        for entry in self._list("timeline_events.json"):
            event_type = str(entry.get("event_type") or "")
            rows.append(
                {
                    "id": str(entry.get("id") or ""),
                    "at": str(entry.get("timestamp") or ""),
                    "title": event_type.replace("_", " ").title() or "Event",
                    "detail": str(entry.get("description") or ""),
                    "kind": kind_map.get(event_type.lower(), "case"),
                    "risk": "high" if self._confidence(entry.get("confidence")) < 0.6 else "medium",
                }
            )
        rows.sort(key=lambda row: row["at"])
        return rows

    # ------------------------------------------------------------------
    # Reasoning layer (hypotheses / contradictions / gaps / critic)
    # ------------------------------------------------------------------
    def insights(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for hypothesis in self._list("hypotheses.json"):
            confidence = self._confidence(hypothesis.get("confidence"))
            supporting = hypothesis.get("supporting") or []
            rows.append(
                {
                    "id": str(hypothesis.get("id") or ""),
                    "title": str(hypothesis.get("type") or "Hypothesis").replace("_", " ").title(),
                    "detail": str(hypothesis.get("description") or ""),
                    "confidence": confidence,
                    "risk": self._risk_from_confidence(confidence),
                    "citations": [str(s) for s in supporting][:6],
                }
            )
        rows.sort(key=lambda row: row["confidence"], reverse=True)
        return rows

    @staticmethod
    def _risk_from_confidence(confidence: float) -> str:
        if confidence >= 0.8:
            return "high"
        if confidence >= 0.6:
            return "medium"
        return "low"

    def intelligence_feed(self) -> list[dict[str, Any]]:
        feed: list[dict[str, Any]] = []

        for contradiction in self._list("contradictions.json"):
            feed.append(
                {
                    "id": str(contradiction.get("id") or ""),
                    "at": str(contradiction.get("created_at") or ""),
                    "title": "Contradiction detected",
                    "detail": str(
                        contradiction.get("description")
                        or contradiction.get("evidence_a")
                        or ""
                    )[:200],
                    "severity": "high",
                    "route": "/ai-investigator",
                    "actionLabel": "Review",
                }
            )
        for gap in self._list("evidence_gaps.json"):
            feed.append(
                {
                    "id": str(gap.get("id") or ""),
                    "at": "",
                    "title": "Evidence gap",
                    "detail": str(gap.get("description") or "")[:200],
                    "severity": "medium",
                    "route": "/ai-investigator",
                    "actionLabel": "Close gap",
                }
            )
        for hypothesis in self._list("hypotheses.json")[:5]:
            feed.append(
                {
                    "id": str(hypothesis.get("id") or ""),
                    "at": str(hypothesis.get("last_updated") or ""),
                    "title": "Hypothesis updated",
                    "detail": str(hypothesis.get("description") or "")[:200],
                    "severity": "medium",
                    "route": "/ai-investigator",
                    "actionLabel": "Inspect",
                }
            )
        feed.sort(key=lambda row: row["at"], reverse=True)
        return feed

    def notifications(self) -> list[dict[str, Any]]:
        rows = []
        for item in self.intelligence_feed()[:8]:
            rows.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "detail": item["detail"],
                    "at": item["at"],
                    "risk": item["severity"],
                    "read": False,
                }
            )
        return rows

    # ------------------------------------------------------------------
    # Stubs with deliberately clear contracts
    # ------------------------------------------------------------------
    def face_records(self) -> list[dict[str, Any]]:
        """Stage 2.5 face output → ``FaceRecord`` (types.ts).

        Source is ``face_embeddings.json`` written by the pipeline
        (RESEARCH_FACE_RECOGNITION doc 08 §7); total in the documented sense:
        a run that produced no faces yields ``[]``, and a face the detector
        rejected is dropped rather than shown with a fabricated identity.

        Field derivations are structural, never invented:
          * confidence   — ``match_confidence`` computed at Stage 2.5
                           (doc 07 similarity mapping × doc 11 context floors)
          * entityId     — person link from Stage 2.5 (same-file/filename
                           context); unresolved faces keep their identity
                           candidate's person id, else ""
          * risk         — the linked node's usual derived risk, else low
                           (unknown to the graph = not flagged = low)
          * capturedAt   — CCTV overlay timestamp when the source carried one,
                           else the file's modified time (noted per record)
          * matchedWith / matchedFrom / similarity — provenance of the match
                           claim: which person and which evidence files
          * matchStatus  — ``rejected``/``confirmed`` only after an investigator
                           decision (``face_decisions.json``); ``confirmed``
                           also when an identity document confirmed the face;
                           ``probable`` while a person claim awaits review;
                           else ``unverified``
        """
        data = self.read("face_embeddings.json")
        if not isinstance(data, dict):
            return []
        faces = [row for row in data.get("faces", []) if isinstance(row, dict)]
        matches = [row for row in data.get("matches", []) if isinstance(row, dict)]
        candidates = [row for row in data.get("candidates", []) if isinstance(row, dict)]

        decisions_raw = self.read("face_decisions.json")
        decisions: dict[str, Any] = {}
        if isinstance(decisions_raw, dict) and isinstance(decisions_raw.get("decisions"), dict):
            decisions = decisions_raw["decisions"]

        identity_by_face = {
            str(row.get("source_entity_id")): row
            for row in candidates
            if row.get("kind") == "identity"
        }
        best_similarity: dict[str, float] = {}
        counterpart_files: dict[str, set[str]] = {}
        for row in matches:
            similarity = row.get("similarity")
            if not isinstance(similarity, (int, float)):
                continue
            for key in ("face_a", "face_b"):
                face_id = row.get(key)
                if isinstance(face_id, str) and similarity > best_similarity.get(face_id, -1.0):
                    best_similarity[face_id] = float(similarity)
            if isinstance(row.get("face_a"), str) and isinstance(row.get("face_b"), str):
                counterpart_files.setdefault(row["face_a"], set()).add(str(row.get("file_b") or ""))
                counterpart_files.setdefault(row["face_b"], set()).add(str(row.get("file_a") or ""))

        records: list[dict[str, Any]] = []
        for face in faces:
            status = str(face.get("status") or "")
            if status == "REJECTED":
                continue
            face_id = str(face.get("id") or "")
            similarity = best_similarity.get(face_id)
            identity = identity_by_face.get(face_id, {})
            if similarity is None and identity:
                # identity candidates carry the pairwise similarity that
                # produced them; it still governs the doc 08 §4.3 review floor
                candidate_similarity = identity.get("signals", {}).get("face_similarity")
                if isinstance(candidate_similarity, (int, float)):
                    similarity = float(candidate_similarity)
            entity_id = str(face.get("person_id") or identity.get("candidate_entity_id") or "")
            subject = str(
                face.get("person_name")
                or identity.get("candidate_person_name")
                or ""
            )
            confidence = float(face.get("match_confidence") or 0.0)
            decision = decisions.get(face_id)
            decision = decision if isinstance(decision, dict) else {}

            if decision.get("decision") == "confirm":
                match_status = "confirmed"
            elif decision.get("decision") == "reject":
                match_status = "rejected"
            elif status == "CONFIRMED":
                match_status = "confirmed"
            elif entity_id:
                # a person claim (link or identity candidate) awaits review
                match_status = "probable"
            else:
                match_status = "unverified"

            matched_from = sorted(
                path
                for path in (
                    set(identity.get("files") or [])
                    or counterpart_files.get(face_id, set())
                    or ({str(face.get("file_name") or "")} if entity_id else set())
                )
                if path
            )

            notes_parts: list[str] = []
            link_basis = face.get("link_basis")
            if link_basis == "same_file_context":
                notes_parts.append("identity from context in the same file")
            elif link_basis == "filename_context":
                notes_parts.append("identity hint from filename context")
            elif identity:
                notes_parts.append(
                    f"identity candidate via face match "
                    f"(similarity {float(identity.get('signals', {}).get('face_similarity', 0.0)):.3f})"
                )
            if status == "LOW_QUALITY":
                notes_parts.append("below quality cutoff — embedding not stored")
            if similarity is None and not entity_id:
                notes_parts.append("no face match at or above 0.40 similarity")
            if face.get("captured_at"):
                if face.get("capture_time_source") == "overlay":
                    notes_parts.append("capture time from image overlay")
                elif face.get("capture_time_source") == "file_mtime":
                    notes_parts.append("capture time from file metadata")

            records.append({
                "id": face_id,
                "subject": subject or "Unidentified subject",
                "entityId": entity_id,
                "confidence": round(confidence, 4),
                "camera": str(face.get("camera") or ""),
                "capturedAt": str(face.get("captured_at") or face.get("created_at") or ""),
                "risk": self._risk_for_node(entity_id),
                "matchStatus": match_status,
                "matchedWith": subject,
                "matchedFrom": matched_from,
                "similarity": round(similarity, 4) if similarity is not None else None,
                "decidedBy": str(decision.get("reviewer") or ""),
                "decidedAt": str(decision.get("decidedAt") or ""),
                "notes": "; ".join(notes_parts) if notes_parts else None,
            })
        return records

    # ------------------------------------------------------------------
    # Analytics (centrality / communities / components / multi-hop)
    # ------------------------------------------------------------------
    def graph_statistics(self) -> dict[str, Any]:
        stats = self.read("graph_statistics.json")
        if not isinstance(stats, dict):
            nodes = self._list("graph_nodes.json")
            edges = self._list("graph_edges.json")
            stats = {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "connected_components": 0,
                "avg_degree": 0.0,
                "max_degree": 0,
            }
        return stats

    def analytics(self) -> dict[str, Any]:
        """Graph analytics, in the same camelCase contract as every other view.

        The pipeline writes snake_case JSON on disk; normalising it here keeps
        the field names out of the UI. Absent numbers stay absent rather than
        becoming ``0``, because a missing score and a score of zero are
        different claims.
        """
        centrality = [
            _present(
                {
                    "nodeId": row.get("node_id"),
                    "name": row.get("name"),
                    "nodeType": row.get("node_type"),
                    "degree": row.get("degree"),
                    "degreeCentrality": row.get("degree_centrality"),
                    "betweenness": row.get("betweenness_centrality"),
                    "closeness": row.get("closeness_centrality"),
                    "eigenvector": row.get("eigenvector_centrality"),
                    "pageRank": row.get("pagerank"),
                }
            )
            for row in self._list("centrality_scores.json")
        ]
        communities = [
            _present(
                {
                    "communityId": row.get("community_id"),
                    "nodeIds": row.get("node_ids"),
                    "size": row.get("size"),
                    "dominantNodeType": row.get("dominant_node_type"),
                    "density": row.get("density"),
                    "internalEdgeCount": row.get("internal_edge_count"),
                    "modularityContribution": row.get("modularity_contribution"),
                }
            )
            for row in self._list("community_assignments.json")
        ]
        components = [
            _present(
                {
                    "componentId": row.get("component_id"),
                    "size": row.get("size"),
                    "edgeCount": row.get("edge_count"),
                    "density": row.get("density"),
                    "nodeTypes": row.get("node_types"),
                    "avgConfidence": row.get("avg_confidence"),
                    "pathLength": row.get("path_length"),
                    "keyEntities": row.get("key_entities"),
                    "hasPerson": row.get("has_person"),
                    "hasFinancial": row.get("has_financial"),
                    "hasCommunication": row.get("has_communication"),
                    "hasTemporalData": row.get("has_temporal_data"),
                    "hasSpatialData": row.get("has_spatial_data"),
                    "isCandidateForInvestigation": row.get(
                        "is_candidate_for_investigation"
                    ),
                }
            )
            for row in self._list("component_analysis.json")
        ]
        paths = [
            _present(
                {
                    "sourceId": row.get("source_id"),
                    "targetId": row.get("target_id"),
                    "path": row.get("path"),
                    "hops": row.get("hops"),
                    "relationshipTypes": row.get("relationship_types"),
                    "pathConfidence": row.get("path_confidence"),
                    "epistemicStatus": row.get("epistemic_status"),
                }
            )
            for row in self._list("multi_hop_paths.json")
        ]

        stats = self.graph_statistics()
        statistics = _present(
            {
                "totalNodes": stats.get("total_nodes"),
                "totalEdges": stats.get("total_edges"),
                "nodeTypeCounts": stats.get("node_type_counts"),
                "edgeTypeCounts": stats.get("edge_type_counts"),
                "relationshipTypeCounts": stats.get("relationship_type_counts"),
                "avgDegree": stats.get("avg_degree"),
                "maxDegree": stats.get("max_degree"),
                "connectedComponents": stats.get("connected_components"),
                "density": stats.get("density"),
                "multiplexityTies": stats.get("multiplexity_ties_count"),
            }
        )

        # Risk zones were the one list still dumped raw: snake_case keys
        # silently failed against the camelCase ZoneScore type (every field
        # optional), so the panel rendered blank rows behind a real count.
        zones = [
            _present(
                {
                    "hexId": row.get("hex_id"),
                    "latitude": row.get("latitude"),
                    "longitude": row.get("longitude"),
                    "locationNames": row.get("location_names"),
                    "evidenceCount": row.get("evidence_count"),
                    "suspectCount": row.get("suspect_count"),
                    "riskScore": row.get("risk_score"),
                    "riskBand": row.get("risk_band"),
                    "caseIds": row.get("case_ids"),
                }
            )
            for row in self._list("zone_scores.json")
        ]

        return {
            "runId": self.run_id,
            "statistics": statistics,
            "centrality": centrality,
            "communities": communities,
            "components": components,
            "multiHopPaths": paths,
            "zones": zones,
            "summary": self.read("analytics_summary.json") or {},
        }

    # ------------------------------------------------------------------
    # Dashboard / metrics
    # ------------------------------------------------------------------
    def metrics(self) -> list[dict[str, Any]]:
        counts = self.entity_counts()
        stats = self.graph_statistics()
        feed = self.intelligence_feed()
        insight_count = len(self._list("hypotheses.json"))
        case_count = 1 if self.exists else 0

        return [
            {
                "id": "cc1",
                "label": "Active Cases",
                "value": f"{case_count}",
                "delta": "",
                "trend": "flat",
                "tone": "info",
                "series": [case_count],
            },
            {
                "id": "cc2",
                "label": "Entities Identified",
                "value": f"{counts['total']:,}",
                "delta": "",
                "trend": "flat",
                "tone": "low",
                "series": [counts["total"]],
            },
            {
                "id": "cc3",
                "label": "Relationships",
                "value": f"{stats.get('total_edges', 0):,}",
                "delta": "",
                "trend": "flat",
                "tone": "medium",
                "series": [int(stats.get("total_edges", 0))],
            },
            {
                "id": "cc4",
                "label": "High-Risk Networks",
                "value": f"{counts['byRisk']['critical'] + counts['byRisk']['high']}",
                "delta": "",
                "trend": "flat",
                "tone": "critical",
                "series": [counts["byRisk"]["critical"] + counts["byRisk"]["high"]],
            },
            {
                "id": "cc5",
                "label": "Open Findings",
                "value": f"{len(feed)}",
                "delta": "",
                "trend": "flat",
                "tone": "medium",
                "series": [len(feed)],
            },
            {
                "id": "cc6",
                "label": "Hypotheses",
                "value": f"{insight_count}",
                "delta": "",
                "trend": "flat",
                "tone": "info",
                "series": [insight_count],
            },
        ]

    def dashboard(self, role: str) -> dict[str, Any]:
        counts = self.entity_counts()
        recent = self.timeline_events()[-6:]
        alerts = [
            {
                "id": item["id"],
                "title": item["title"],
                "detail": item["detail"],
                "risk": item["severity"],
                "at": item["at"],
            }
            for item in self.intelligence_feed()[:5]
        ]
        return {
            "metrics": self.metrics(),
            "widgets": [
                {
                    "id": "w-risk",
                    "title": "Risk distribution",
                    "kind": "chart",
                    "description": "Entities by derived risk band",
                },
                {
                    "id": "w-activity",
                    "title": "Recent activity",
                    "kind": "list",
                    "description": "Latest recorded events",
                },
                {
                    "id": "w-mix",
                    "title": "Network composition",
                    "kind": "chart",
                    "description": "Nodes by kind",
                },
            ],
            "riskBreakdown": [
                {"label": level.title(), "value": counts["byRisk"][level], "tone": level}
                for level in ("critical", "high", "medium", "low")
            ],
            "caseTrend": [],
            "districtLoad": [
                {"label": kind, "value": value}
                for kind, value in sorted(
                    counts["byKind"].items(), key=lambda kv: -kv[1]
                )
            ],
            "recentActivity": recent,
            "alerts": alerts,
        }

    def seeded_messages(self) -> list[dict[str, Any]]:
        """Conversation seed. Static by design — it is a prompt, not a finding."""
        return [
            {
                "id": "seed-1",
                "author": "ai",
                "text": (
                    "Upload an FIR with its evidence files to begin. "
                    "I run the extraction, resolution, graph, hypothesis and "
                    "critic stages over whatever you submit."
                ),
                "at": "",
            }
        ]

    def search(
        self, query: str, cases: list[dict[str, Any]] | None = None
    ) -> list[dict[str, Any]]:
        """Grouped global search across cases and resolved entities.

        Mirrors the shape the search dropdown expects: cases first, then one
        group per entity kind that actually matched. ``cases`` is supplied by
        the caller because case identity lives in the registry, not the run.
        """
        term = str(query or "").strip().lower()
        if len(term) < 2:
            return []

        groups: list[dict[str, Any]] = []

        case_matches = [
            case
            for case in (cases or [])
            if term in case["id"].lower()
            or term in str(case.get("firNumber") or "").lower()
            or term in case["title"].lower()
        ]
        if case_matches:
            groups.append(
                {
                    "kind": "case",
                    "label": "Cases",
                    "items": [
                        {
                            "id": case["id"],
                            "title": case["title"],
                            "subtitle": " · ".join(
                                part
                                for part in (case["id"], case.get("firNumber"))
                                if part
                            ),
                            "risk": case["risk"],
                            "route": f"/cases/{case['id']}",
                        }
                        for case in case_matches
                    ],
                }
            )

        entity_matches = []
        for entity in self.entities():
            if (
                term in entity["id"].lower()
                or term in entity["name"].lower()
                or any(term in alias.lower() for alias in entity["alias"])
                or any(
                    term in identifier["value"].lower()
                    for identifier in entity["identifiers"]
                )
            ):
                entity_matches.append(entity)

        for kind in _SEARCH_KIND_ORDER:
            matched = [item for item in entity_matches if item["kind"] == kind]
            if not matched:
                continue
            groups.append(
                {
                    "kind": kind,
                    "label": _SEARCH_KIND_LABELS.get(kind, kind),
                    "items": [
                        {
                            "id": item["id"],
                            "title": item["name"],
                            "subtitle": " · ".join(
                                part
                                for part in (item["id"], item.get("district"))
                                if part
                            ),
                            "risk": item["risk"],
                            "route": f"/entities/{item['id']}",
                        }
                        for item in matched
                    ],
                }
            )
        return groups
