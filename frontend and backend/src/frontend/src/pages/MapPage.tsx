import {
  DetailField,
  DetailPanel,
  EmptyState,
  FilterBar,
  MapCanvas,
  PageHeader,
  RiskBadge,
  StatusPill,
} from "@/components/crimenet";
import { caseStatusLabels, caseStatusTones } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getCases, getMapData } from "@/lib/crimenet/services";
import type { CaseRecord, MapData, MapMarker } from "@/lib/crimenet/types";
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type LayerId =
  | "incidents"
  | "riskAreas"
  | "towers"
  | "entities"
  | "trails"
  | "calls";

const layerDefinitions: { id: LayerId; labelKey: string }[] = [
  { id: "incidents", labelKey: "layerIncidents" },
  { id: "riskAreas", labelKey: "layerRiskAreas" },
  { id: "towers", labelKey: "layerTowers" },
  { id: "entities", labelKey: "layerEntities" },
  { id: "trails", labelKey: "layerTrails" },
  { id: "calls", labelKey: "layerCalls" },
];

function markerLayer(marker: MapMarker): LayerId {
  if (marker.kind === "incident") return "incidents";
  if (marker.kind === "tower") return "towers";
  if (marker.kind === "location") return "calls";
  return "entities";
}

function bandTone(band?: string): "neutral" | "success" | "warning" | "danger" {
  if (band === "RED") return "danger";
  if (band === "AMBER") return "warning";
  if (band === "GREEN") return "success";
  return "neutral";
}

/**
 * District filter for one marker. Spatial rows carry an exact `city`, but H3
 * zone markers have no district column at all — dropping them under a
 * district filter would silently hide every risk zone. Zones match against
 * the location names the run recorded for them instead, so filtering to
 * "Delhi" narrows to zones whose data actually names Delhi.
 */
function matchesDistrict(marker: MapMarker, district: string): boolean {
  if (district === "all") return true;
  if (marker.district) return marker.district === district;
  const needle = district.toLowerCase();
  return (marker.locationNames ?? []).some((name) =>
    name.toLowerCase().includes(needle),
  );
}

/**
 * Stamp every marker with the case it came from. Ids are prefixed only when
 * a merged view could collide across runs — single-case scopes keep raw ids
 * so links and the detail panel stay stable.
 */
function stampScope(data: MapData, caseId: string, prefix: boolean): MapData {
  const tag = (id: string) => (prefix ? `${caseId}:${id}` : id);
  return {
    ...data,
    caseId,
    markers: data.markers.map((marker) => ({
      ...marker,
      caseId,
      id: tag(marker.id),
    })),
    links: data.links.map((link) => ({
      ...link,
      from: tag(link.from),
      to: tag(link.to),
    })),
  };
}

/**
 * Map data for a case scope. "all" merges every registered case's run —
 * each marker stays attributed to its own case — while a specific scope
 * requests that case's projection directly. With nothing registered we fall
 * back to the active case so the page still shows real data.
 */
async function loadScopedMap(
  scope: string,
  rows: CaseRecord[],
): Promise<MapData> {
  const targets =
    scope === "all" ? rows : rows.filter((row) => row.id === scope);
  if (targets.length === 0) {
    return getMapData(scope === "all" ? undefined : scope);
  }
  if (targets.length === 1) {
    return stampScope(await getMapData(targets[0].id), targets[0].id, false);
  }
  const parts = await Promise.all(
    targets.map(async (row) =>
      stampScope(await getMapData(row.id), row.id, true),
    ),
  );
  return {
    markers: parts.flatMap((part) => part.markers),
    links: parts.flatMap((part) => part.links),
  };
}

export function MapPage() {
  const { language } = useRole();
  const strings = getStrings(language);
  const [cases, setCases] = useState<CaseRecord[] | null>(null);
  const [caseScope, setCaseScope] = useState("all");
  const [data, setData] = useState<MapData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [district, setDistrict] = useState("all");
  const [risk, setRisk] = useState("all");
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    incidents: true,
    riskAreas: true,
    towers: true,
    entities: true,
    trails: true,
    calls: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getCases().then((rows) => {
      if (cancelled) return;
      setCases(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The registry decides what the scope can resolve to — wait for it so
    // the first paint is the real scoped fetch, not an unscoped guess.
    if (cases === null) return;
    let cancelled = false;
    setLoading(true);
    void loadScopedMap(caseScope, cases).then((result) => {
      if (cancelled) return;
      setData(result);
      setSelectedId(result.markers[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cases, caseScope]);

  const scopedCases = useMemo(() => {
    const rows = cases ?? [];
    return caseScope === "all"
      ? rows
      : rows.filter((row) => row.id === caseScope);
  }, [cases, caseScope]);

  const districts = useMemo(
    () =>
      [...new Set(data?.markers.map((marker) => marker.district) ?? [])]
        .filter((item): item is string => Boolean(item))
        .sort(),
    [data],
  );

  const filtered = useMemo(() => {
    if (!data) return null;
    const markers = data.markers.filter(
      (marker) =>
        matchesDistrict(marker, district) &&
        (risk === "all" || marker.risk === risk) &&
        layers[markerLayer(marker)],
    );
    const ids = new Set(markers.map((marker) => marker.id));
    const links = data.links.filter(
      (link) => ids.has(link.from) && ids.has(link.to),
    );
    return { markers, links };
  }, [data, district, risk, layers]);

  // Keep the detail panel pointing at a marker that is actually on the map:
  // a filter change used to leave a hidden marker selected.
  useEffect(() => {
    if (!filtered) return;
    if (!filtered.markers.some((marker) => marker.id === selectedId)) {
      setSelectedId(filtered.markers[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  /** Zones ranked exactly as the map shows them — same scope, same filters. */
  const zones = useMemo(
    () =>
      (filtered?.markers ?? [])
        .filter((marker) => typeof marker.riskScore === "number")
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
    [filtered],
  );

  const selected =
    filtered?.markers.find((marker) => marker.id === selectedId) ?? null;
  const selectedCaseId = selected?.caseId ?? data?.caseId;

  const linkedMarkers = selected
    ? (filtered?.links ?? []).filter(
        (link) => link.from === selected.id || link.to === selected.id,
      )
    : [];

  const toggleLayer = (id: LayerId) => {
    setLayers((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <div data-ocid="map.page" className="flex flex-col">
      <PageHeader
        eyebrow={strings.geospatialIntelligence}
        title={strings.commandMap}
        description={strings.mapDescription}
      />

      <section
        data-ocid="map.case_scope"
        aria-label={strings.caseScope}
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <span className="label-caps text-muted-foreground">
          {strings.caseScope}
        </span>
        {cases === null ? (
          <span className="text-xs text-muted-foreground">
            {strings.loading}
          </span>
        ) : scopedCases.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {strings.emptyBody}
          </span>
        ) : (
          scopedCases.map((row) => (
            <span
              key={row.id}
              data-ocid={`map.case_chip.${row.id}`}
              className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs"
            >
              <span className="font-mono-id text-info">{row.id}</span>
              <span className="font-mono-id text-muted-foreground">
                {row.firNumber}
              </span>
              <span className="text-foreground">{row.title}</span>
              <StatusPill
                label={caseStatusLabels[row.status]}
                tone={caseStatusTones[row.status]}
              />
            </span>
          ))
        )}
      </section>

      <FilterBar
        className="mt-4"
        filters={[
          {
            id: "case",
            label: strings.caseScope,
            value: caseScope,
            onChange: setCaseScope,
            options: [
              { value: "all", label: strings.allCases },
              ...(cases ?? []).map((row) => ({
                value: row.id,
                label: `${row.id} · ${row.firNumber}`,
              })),
            ],
          },
          {
            id: "district",
            label: strings.district,
            value: district,
            onChange: setDistrict,
            options: [
              { value: "all", label: strings.all },
              ...districts.map((item) => ({ value: item, label: item })),
            ],
          },
          {
            id: "risk",
            label: strings.riskLevel,
            value: risk,
            onChange: setRisk,
            options: [
              { value: "all", label: strings.all },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
          },
        ]}
        onReset={() => {
          setCaseScope("all");
          setDistrict("all");
          setRisk("all");
          setLayers({
            incidents: true,
            riskAreas: true,
            towers: true,
            entities: true,
            trails: true,
            calls: true,
          });
        }}
        resultCount={filtered?.markers.length ?? 0}
        resultLabel={strings.markers}
      />

      <section className="mt-4 panel">
        <div className="panel-header">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {strings.layers}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-ocid="map.show_all_layers_button"
              onClick={() =>
                setLayers({
                  incidents: true,
                  riskAreas: true,
                  towers: true,
                  entities: true,
                  trails: true,
                  calls: true,
                })
              }
              className="text-[11px] text-info transition-smooth hover:underline"
            >
              {strings.showAllLayers}
            </button>
            <button
              type="button"
              data-ocid="map.hide_all_layers_button"
              onClick={() =>
                setLayers({
                  incidents: false,
                  riskAreas: false,
                  towers: false,
                  entities: false,
                  trails: false,
                  calls: false,
                })
              }
              className="text-[11px] text-muted-foreground transition-smooth hover:text-foreground"
            >
              {strings.hideAllLayers}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {layerDefinitions.map((layer) => {
            const active = layers[layer.id];
            return (
              <button
                key={layer.id}
                type="button"
                data-ocid={`map.layer_toggle.${layer.id}`}
                aria-pressed={active}
                onClick={() => toggleLayer(layer.id)}
                className={
                  active
                    ? "rounded-full border border-info/40 bg-info/12 px-3 py-1 text-[11px] text-info transition-smooth"
                    : "rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground transition-smooth hover:text-foreground"
                }
              >
                {strings[layer.labelKey as keyof typeof strings]}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        {loading || !filtered ? (
          <div
            data-ocid="map.loading_state"
            className="panel h-[560px] animate-pulse bg-muted/20"
          />
        ) : filtered.markers.length === 0 ? (
          <EmptyState
            icon={<MapPin className="size-5" aria-hidden />}
            title={strings.emptyTitle}
            body={strings.emptyBody}
          />
        ) : (
          <MapCanvas
            data={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showHexes={layers.riskAreas}
            className="h-[560px]"
          />
        )}

        <div className="flex flex-col gap-4">
          <DetailPanel
            title={selected ? selected.label : strings.noSelection}
            subtitle={selected?.id}
            badge={selected ? <RiskBadge risk={selected.risk} /> : undefined}
          >
            {selected ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {selected.detail}
                </p>
                <div className="mt-3">
                  {selectedCaseId ? (
                    <DetailField
                      label={strings.caseScope}
                      value={selectedCaseId}
                      mono
                    />
                  ) : null}
                  <DetailField
                    label={strings.district}
                    value={selected.district}
                  />
                  <DetailField
                    label={strings.markerType}
                    value={selected.kind}
                  />
                  <DetailField label={strings.risk} value={selected.risk} />
                  {selected.riskBand ? (
                    <DetailField
                      label={strings.riskBand}
                      value={selected.riskBand}
                    />
                  ) : null}
                  {selected.evidenceCount !== undefined ? (
                    <DetailField
                      label={strings.evidence}
                      value={selected.evidenceCount}
                    />
                  ) : null}
                </div>
                <div className="mt-4">
                  <p className="label-caps mb-2 text-muted-foreground">
                    {strings.linkedMarkers}
                  </p>
                  {linkedMarkers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{"\u2014"}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {linkedMarkers.map((link) => {
                        const otherId =
                          link.from === selected.id ? link.to : link.from;
                        const other = filtered?.markers.find(
                          (marker) => marker.id === otherId,
                        );
                        return (
                          <li
                            key={link.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <button
                              type="button"
                              data-ocid={`map.linked_marker.${otherId}`}
                              onClick={() => setSelectedId(otherId)}
                              className="min-w-0 truncate text-left text-xs text-info transition-smooth hover:underline"
                            >
                              {other?.label ?? otherId}
                            </button>
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                              {link.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {strings.selectMarker}
              </p>
            )}
          </DetailPanel>

          <div data-ocid="map.risk_zones_panel" className="panel">
            <div className="panel-header">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {strings.riskZones}
              </h2>
              <span className="font-mono-id text-xs text-muted-foreground">
                {zones.length}
              </span>
            </div>
            <div className="p-4">
              <p className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="label-caps">{strings.caseScope}</span>
                <span className="font-mono-id text-foreground/80">
                  {caseScope === "all" ? strings.allCases : caseScope}
                </span>
              </p>
              {zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {strings.emptyBody}
                </p>
              ) : (
                <ol
                  data-ocid="map.risk_zones_list"
                  className="scrollbar-thin flex max-h-[26rem] flex-col gap-2 overflow-y-auto overscroll-contain pr-1"
                >
                  {zones.map((zone, index) => (
                    <li
                      key={zone.id}
                      data-ocid={`map.risk_zone.${index + 1}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(zone.id)}
                        className="min-w-0 truncate text-left text-xs text-foreground transition-smooth hover:text-info"
                      >
                        {zone.label}
                      </button>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {zone.riskBand ? (
                          <StatusPill
                            label={zone.riskBand}
                            tone={bandTone(zone.riskBand)}
                          />
                        ) : null}
                        <span className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
                          {zone.riskScore?.toFixed(2)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
