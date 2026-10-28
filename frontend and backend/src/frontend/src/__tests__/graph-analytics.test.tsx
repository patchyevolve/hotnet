import { renderApp } from "@/test/render-app";
import { configure, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * Risk zones come from `/api/analytics` as the camelCase `ZoneScore` shape.
 * Every field on that type is optional, so a snake_case regression does not
 * fail typecheck — it renders blank rows behind a real count (the exact bug
 * this locks: `location_names`/`risk_score` never matched
 * `locationNames`/`riskScore`).
 */
describe("Graph Analytics", () => {
  it("renders risk-zone names, scores and bands, not blank rows", async () => {
    renderApp("/analytics");

    const heading = await screen.findByText("Risk zones");
    const panel = heading.closest("section");
    expect(panel).not.toBeNull();

    const zoneList = within(panel as HTMLElement);
    // Top zone in the fixture dump: risk_score 1.0, RED band.
    expect(
      zoneList.getByText(
        "Amit Sharma, Lajpat Nagar, Lajpat Nagar Part II, Rakesh Kumar",
      ),
    ).toBeInTheDocument();
    expect(zoneList.getByText("1.00")).toBeInTheDocument();
    expect(zoneList.getByText("RED")).toBeInTheDocument();
    expect(zoneList.getAllByText("3 Evidence").length).toBeGreaterThan(0);
    expect(zoneList.getByText("2 Suspects")).toBeInTheDocument();
    expect(zoneList.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("shows confidences as percents, not raw 0–1 ratios", async () => {
    renderApp("/analytics");

    // Fixture component avg_confidence 0.8746 must read 87.5%, not 0.9%.
    await screen.findByText("Components");
    expect(await screen.findByText("87.5%")).toBeInTheDocument();

    // Fixture top path path_confidence 0.6184 must read 61.8%, not 0.6%.
    expect(await screen.findByText(/Confidence 61\.8%/)).toBeInTheDocument();
  });

  it("labels hop counts as hops and flags inferred paths", async () => {
    renderApp("/analytics");

    await screen.findByText("Multi-hop paths");
    // Was rendering "2 Multi-hop paths" by reusing the panel title as a unit.
    expect(screen.getAllByText(/2 hops/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inferred").length).toBeGreaterThan(0);
    // The relationship-type chain is part of the path evidence.
    expect(screen.getAllByText("MESSED → MESSED").length).toBeGreaterThan(0);
  });

  it("summarises isolated components instead of listing them", async () => {
    renderApp("/analytics");

    const summary = await screen.findByTestId("analytics.components_summary");
    // Fixture: 114 components, most size-1 isolates; only clusters are tabulated.
    expect(summary.textContent).toContain("isolated");
    expect(summary.textContent).toContain("Main cluster");

    // "Components" is both a stat-card label and the panel heading.
    const headings = screen.getAllByText("Components");
    const heading = headings.find((node) => node.closest("section"));
    expect(heading).toBeDefined();
    const panel = (heading as HTMLElement).closest("section");
    // DataTable renders table rows, not list items; isolates must be summarised away.
    const rows = within(panel as HTMLElement).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    expect(screen.getByText("Investigation")).toBeInTheDocument();
    expect(screen.queryByText("Risk Level")).not.toBeInTheDocument();
  });
});
