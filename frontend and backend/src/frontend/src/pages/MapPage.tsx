import {
  DetailField,
  DetailPanel,
  EmptyState,
  FilterBar,
  MapCanvas,
  PageHeader,
  RiskBadge,
} from "@/components/crimenet";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { getMapData } from "@/lib/crimenet/services";
import type { MapData, MapMarker } from "@/lib/crimenet/types";
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

export function MapPage() {
  const { language } = useRole();
  const strings = getStrings(language);
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
    void getMapData().then((result) => {
      if (cancelled) return;
      setData(result);
      setSelectedId(result.markers[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        (district === "all" || marker.district === district) &&
        (risk === "all" || marker.risk === risk) &&
        layers[markerLayer(marker)],
    );
    const ids = new Set(markers.map((marker) => marker.id));
    const links = data.links.filter(
      (link) => ids.has(link.from) && ids.has(link.to),
    );
    return { markers, links };
  }, [data, district, risk, layers]);

  const rankedZones = useMemo(
    () =>
      (data?.markers ?? [])
        .filter((marker) => typeof marker.riskScore === "number")
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
    [data],
  );

  const selected =
    data?.markers.find((marker) => marker.id === selectedId) ?? null;

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

      <FilterBar
        filters={[
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
                  <DetailField
                    label={strings.district}
                    value={selected.district}
                  />
                  <DetailField
                    label={strings.markerType}
                    value={selected.kind}
                  />
                  <DetailField label={strings.risk} value={selected.risk} />
                </div>
                <div className="mt-4">
                  <p className="label-caps mb-2 text-muted-foreground">
                    {strings.linkedMarkers}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {(data?.links ?? [])
                      .filter(
                        (link) =>
                          link.from === selected.id || link.to === selected.id,
                      )
                      .map((link) => {
                        const otherId =
                          link.from === selected.id ? link.to : link.from;
                        const other = data?.markers.find(
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
                {rankedZones.length}
              </span>
            </div>
            <div className="p-4">
              {rankedZones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {strings.emptyBody}
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {rankedZones.slice(0, 6).map((zone, index) => (
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
                      <span className="shrink-0 font-mono-id text-[11px] tabular-nums text-muted-foreground">
                        {zone.riskScore?.toFixed(2)}
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
