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
  it("renders risk-zone names and scores, not blank rows", async () => {
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
    expect(zoneList.getAllByRole("listitem").length).toBeGreaterThan(0);
  });
});
