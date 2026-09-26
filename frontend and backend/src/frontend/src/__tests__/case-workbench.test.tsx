import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

const CASE_PATH = "/cases/CASE_000001";

describe("Case Workbench", () => {
  it("shows the case header, status, risk and the metric strip", async () => {
    renderApp(CASE_PATH);
    await screen.findByTestId("case_workbench.page");

    expect(
      screen.getByRole("heading", { name: "UPI fraud ring", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("CASE_000001 · DF/2026/4561")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);

    // Every figure on the strip comes from the run, not from a fixture.
    const strip = screen.getByTestId("case_workbench.metric_strip");
    expect(within(strip).getByText("Entities")).toBeInTheDocument();
    expect(within(strip).getByText("161")).toBeInTheDocument();
    expect(within(strip).getByText("Relationships")).toBeInTheDocument();
    expect(within(strip).getByText("140")).toBeInTheDocument();
    expect(within(strip).getByText("Traced")).toBeInTheDocument();
    expect(within(strip).getByText("₹20.65L")).toBeInTheDocument();
    expect(within(strip).getByText("Linked Cases")).toBeInTheDocument();
  });

  it("renders all seven tabs with content", async () => {
    const user = userEvent.setup();
    renderApp(CASE_PATH);
    await screen.findByTestId("case_workbench.page");

    const tabs = screen.getByTestId("case_workbench.tabs");
    const tabNames = [
      "Overview",
      "Evidence",
      "Network",
      "CDR",
      "Money Trail",
      "Timeline",
      "Reports",
    ];
    for (const name of tabNames) {
      expect(within(tabs).getByRole("tab", { name })).toBeInTheDocument();
    }

    // Overview is the default and shows the case summary.
    expect(screen.getByText("Case Summary")).toBeInTheDocument();

    // Evidence tab renders the integrity panel.
    await user.click(within(tabs).getByRole("tab", { name: "Evidence" }));
    expect(await screen.findByText("Chain of Custody")).toBeInTheDocument();

    // Network tab renders the graph canvas.
    await user.click(within(tabs).getByRole("tab", { name: "Network" }));
    expect(await screen.findByTestId("graph_canvas")).toBeInTheDocument();

    // CDR tab renders the communication timeline.
    await user.click(within(tabs).getByRole("tab", { name: "CDR" }));
    expect(
      await screen.findByText("Communication Timeline"),
    ).toBeInTheDocument();

    // Money Trail tab renders the traced label the run produced.
    await user.click(within(tabs).getByRole("tab", { name: "Money Trail" }));
    expect(await screen.findByText("6 traced transfers")).toBeInTheDocument();

    // Timeline tab renders the full timeline.
    await user.click(within(tabs).getByRole("tab", { name: "Timeline" }));
    expect(screen.getByTestId("case_workbench.page")).toBeInTheDocument();

    // Reports tab is intentionally unavailable in this prototype.
    await user.click(within(tabs).getByRole("tab", { name: "Reports" }));
    expect(await screen.findByText("Reports unavailable")).toBeInTheDocument();
  });

  it("opens the entity quick view drawer from an entity row", async () => {
    const user = userEvent.setup();
    renderApp(CASE_PATH);
    await screen.findByTestId("case_workbench.page");

    const button = await screen.findByTestId(
      "case_workbench.entity_button.RES_f90015a9027df8e3",
    );
    await user.click(button);

    const drawer = await screen.findByTestId("entity_drawer");
    expect(
      await within(drawer).findByRole("heading", { name: "Rakesh Kumar" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByText("RES_f90015a9027df8e3"),
    ).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown case id", async () => {
    renderApp("/cases/CASE_999999");
    await waitFor(() => {
      expect(screen.getByText("Case not found")).toBeInTheDocument();
    });
  });
});
