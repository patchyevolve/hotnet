import { cellIdAt } from "@/lib/crimenet/geo";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

const hexSelector = '[data-ocid^="map_canvas.hex."]';
const groupSelector = '[data-ocid^="map_canvas.pin_group."]';
const markerSelector = '[data-ocid^="map_canvas.marker."]';

async function renderMap() {
  renderApp("/map");
  await screen.findByTestId("map.page");
  await screen.findByTestId("map_canvas");
  await waitFor(() => {
    expect(
      screen.queryByTestId("map_canvas.india_outline"),
    ).toBeInTheDocument();
  });
  return screen.getByTestId("map_canvas");
}

function currentRes(): number {
  const level = screen.getByTestId("map_canvas.zoom_level");
  return Number(level.getAttribute("data-res"));
}

describe("command map India basemap", () => {
  it("renders the India outline, state borders and risk-coloured hexes", async () => {
    const canvas = await renderMap();
    expect(
      screen.getByTestId("map_canvas.india_outline").getAttribute("d"),
    ).toMatch(/^M/);
    expect(
      screen.getByTestId("map_canvas.india_states").getAttribute("d"),
    ).toMatch(/^M/);
    expect(canvas.querySelectorAll(hexSelector).length).toBeGreaterThan(0);
    expect(canvas.querySelector('[data-risk="critical"]')).toBeTruthy();
    expect(canvas.querySelector('[data-risk="low"]')).toBeTruthy();
  });

  it("shows aggregated pin badges below zoom 7 and individual markers above it", async () => {
    const user = userEvent.setup();
    const canvas = await renderMap();
    expect(canvas.querySelectorAll(groupSelector).length).toBeGreaterThan(0);
    expect(canvas.querySelectorAll(markerSelector)).toHaveLength(0);

    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByTestId("map_canvas.zoom_in"));
    }
    await waitFor(() => {
      const zoom = Number(
        screen.getByTestId("map_canvas.zoom_level").getAttribute("data-zoom"),
      );
      expect(zoom).toBeGreaterThanOrEqual(7);
    });
    expect(canvas.querySelectorAll(markerSelector).length).toBeGreaterThan(0);
    expect(canvas.querySelectorAll(groupSelector)).toHaveLength(0);
  });

  it("hides hexes when the H3 risk layer is toggled off and restores them when on", async () => {
    const user = userEvent.setup();
    const canvas = await renderMap();
    expect(canvas.querySelectorAll(hexSelector).length).toBeGreaterThan(0);

    await user.click(screen.getByTestId("map.layer_toggle.riskAreas"));
    expect(canvas.querySelectorAll(hexSelector)).toHaveLength(0);

    await user.click(screen.getByTestId("map.layer_toggle.riskAreas"));
    expect(canvas.querySelectorAll(hexSelector).length).toBeGreaterThan(0);
  });

  it("zoom in, zoom out and reset view update the viewport", async () => {
    const user = userEvent.setup();
    await renderMap();
    const level = screen.getByTestId("map_canvas.zoom_level");
    const initialZoom = Number(level.getAttribute("data-zoom"));
    expect(Number(level.getAttribute("data-res"))).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByTestId("map_canvas.zoom_in"));
    const zoomedIn = Number(
      screen.getByTestId("map_canvas.zoom_level").getAttribute("data-zoom"),
    );
    expect(zoomedIn).toBeGreaterThan(initialZoom);

    await user.click(screen.getByTestId("map_canvas.zoom_out"));
    expect(
      Number(
        screen.getByTestId("map_canvas.zoom_level").getAttribute("data-zoom"),
      ),
    ).toBe(initialZoom);

    await user.click(screen.getByTestId("map_canvas.zoom_in"));
    await user.click(screen.getByTestId("map_canvas.reset_view"));
    expect(
      Number(
        screen.getByTestId("map_canvas.zoom_level").getAttribute("data-zoom"),
      ),
    ).toBe(initialZoom);
  });

  it("selecting a pin badge opens its zone in the detail panel", async () => {
    const user = userEvent.setup();
    const canvas = await renderMap();
    const res = currentRes();
    const andhraCell = cellIdAt(78.8498348, 14.4671464, res);
    const badge = await screen.findByTestId(
      `map_canvas.pin_group.${andhraCell}`,
    );
    await user.click(badge);
    expect(
      within(screen.getByTestId("detail_panel")).getByText("GRID_14.467_78.85"),
    ).toBeInTheDocument();
    expect(canvas.querySelectorAll(groupSelector).length).toBeGreaterThan(0);
  });

  it("clicking the critical hex selects the highest-risk zone inside it", async () => {
    const user = userEvent.setup();
    await renderMap();
    const res = currentRes();
    const delhiCell = cellIdAt(77.2432851, 28.5660924, res);
    const hex = await screen.findByTestId(`map_canvas.hex.${delhiCell}`);
    expect(hex.getAttribute("data-risk")).toBe("critical");

    const nashikCell = cellIdAt(73.8253308, 19.9685224, res);
    await user.click(
      await screen.findByTestId(`map_canvas.pin_group.${nashikCell}`),
    );
    expect(
      within(screen.getByTestId("detail_panel")).getByText(
        "GRID_19.969_73.825",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId(`map_canvas.hex.${delhiCell}`));
    expect(
      within(screen.getByTestId("detail_panel")).getByText(
        "GRID_28.566_77.243",
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The map must be case-attributed: a judge looking at a risk-zone list has
 * to see which case's run produced it, the scope must be switchable, and
 * "All" must mean every calculated zone — not a top-six teaser. The district
 * filter also must not silently drop every zone (zone markers carry no
 * district column; they match through their recorded location names).
 */
describe("case-scoped command map", () => {
  it("names the case behind the map in a scope strip and a case filter", async () => {
    renderApp("/map");
    const chip = await screen.findByTestId("map.case_chip.CASE_000001");
    expect(chip).toHaveTextContent("CASE_000001");
    expect(chip).toHaveTextContent("DF/2026/4561");
    expect(chip).toHaveTextContent("UPI fraud ring");
    const strip = screen.getByTestId("map.case_scope");
    expect(strip).toHaveTextContent("Case scope");

    const select = screen.getByTestId("filter_bar.select.case");
    expect(
      within(select).getByRole("option", {
        name: /CASE_000001 · DF\/2026\/4561/,
      }),
    ).toBeInTheDocument();
    expect(
      within(select).getByRole("option", { name: "All Cases" }),
    ).toBeInTheDocument();
  });

  it("lists every risk zone under an All scope, not a top-six slice", async () => {
    renderApp("/map");
    await screen.findByTestId("map_canvas");
    const panel = await screen.findByTestId("map.risk_zones_panel");

    const scope = within(panel);
    expect(scope.getByText("All Cases")).toBeInTheDocument();
    // Fixture holds 18 zone markers; the old panel rendered 6 of them.
    expect(scope.getAllByRole("listitem")).toHaveLength(18);
    expect(scope.getByText("18")).toBeInTheDocument();
    // Rows carry the pipeline's band and score.
    expect(scope.getAllByText("RED").length).toBeGreaterThan(0);
    expect(scope.getAllByText(/\d\.\d\d/).length).toBeGreaterThan(0);
  });

  it("switching the case scope re-scopes the zones panel", async () => {
    const user = userEvent.setup();
    renderApp("/map");
    const panel = await screen.findByTestId("map.risk_zones_panel");
    await screen.findByTestId("map.case_chip.CASE_000001");

    await user.selectOptions(
      screen.getByTestId("filter_bar.select.case"),
      "CASE_000001",
    );

    await waitFor(() => {
      expect(within(panel).getByText("CASE_000001")).toBeInTheDocument();
    });
    expect(within(panel).queryByText("All Cases")).not.toBeInTheDocument();
    // The scoped fetch still resolves to the fixture-backed projection.
    expect(screen.getByTestId("map_canvas")).toBeInTheDocument();
    expect(screen.getByTestId("map.case_chip.CASE_000001")).toBeInTheDocument();
  });

  it("district filter narrows zones to the ones whose data names Delhi", async () => {
    const user = userEvent.setup();
    renderApp("/map");
    await screen.findByTestId("map_canvas");
    const panel = await screen.findByTestId("map.risk_zones_panel");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(18);

    await user.selectOptions(
      screen.getByTestId("filter_bar.select.district"),
      "Delhi",
    );

    // Six fixture zones record a Delhi location name; the old code hid all
    // 18 zones the moment a district was picked.
    await waitFor(() => {
      expect(within(panel).getAllByRole("listitem")).toHaveLength(6);
    });
    // 6 zones + 6 Delhi positions remain on the map.
    expect(screen.getByText("12 Markers")).toBeInTheDocument();
    expect(screen.getByTestId("map_canvas")).toBeInTheDocument();
  });

  it("risk filter narrows zones and markers together", async () => {
    const user = userEvent.setup();
    renderApp("/map");
    await screen.findByTestId("map_canvas");
    const panel = await screen.findByTestId("map.risk_zones_panel");

    await user.selectOptions(
      screen.getByTestId("filter_bar.select.risk"),
      "high",
    );

    // Fixture: five high zones; spatial positions are medium, so five markers.
    await waitFor(() => {
      expect(within(panel).getAllByRole("listitem")).toHaveLength(5);
    });
    expect(screen.getByText("5 Markers")).toBeInTheDocument();
    expect(within(panel).getByText("5")).toBeInTheDocument();
  });
});
