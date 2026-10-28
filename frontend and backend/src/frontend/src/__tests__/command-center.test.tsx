import { ADMIN_DELHI, AUDIT_LOGGER_DELHI, seedToken } from "@/test/identity";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

describe("Command Center", () => {
  it("shows the global metric cards with the values the run produced", async () => {
    seedToken(ADMIN_DELHI);
    renderApp("/");
    const metrics = await screen.findByTestId("command_center.metrics_section");
    await waitFor(() => {
      expect(
        within(metrics).getByText("Entities Identified"),
      ).toBeInTheDocument();
    });
    expect(within(metrics).getByText("Active Cases")).toBeInTheDocument();
    expect(within(metrics).getByText("1")).toBeInTheDocument();
    expect(within(metrics).getByText("175")).toBeInTheDocument();
    expect(within(metrics).getByText("Relationships")).toBeInTheDocument();
    expect(within(metrics).getByText("140")).toBeInTheDocument();
    expect(within(metrics).getByText("High-Risk Networks")).toBeInTheDocument();
    expect(within(metrics).getByText("38")).toBeInTheDocument();
    expect(within(metrics).getByText("Hypotheses")).toBeInTheDocument();
    expect(within(metrics).getByText("73")).toBeInTheDocument();
  });

  it("lists the active investigations from the case registry", async () => {
    renderApp("/");
    const panel = await screen.findByTestId(
      "command_center.investigations_panel",
    );

    const links = within(panel).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText("CASE_000001")).toBeInTheDocument();
    expect(within(panel).getByText("UPI fraud ring")).toBeInTheDocument();
  });

  it("shows the case metric line on its investigation row", async () => {
    renderApp("/");
    const panel = await screen.findByTestId(
      "command_center.investigations_panel",
    );

    await waitFor(() => {
      expect(
        within(panel).getByText("175 Entities · 55 Evidence · 0 Linked Cases"),
      ).toBeInTheDocument();
    });
  });

  it("renders the live intelligence feed and its actions work", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const panel = await screen.findByTestId("command_center.feed_panel");

    const events = within(panel).getAllByRole("listitem");
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(
      within(panel).getAllByText("Hypothesis updated").length,
    ).toBeGreaterThanOrEqual(3);

    // The first feed action navigates to the AI Investigator.
    await user.click(screen.getByTestId("command_center.feed_action.1"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "AI Investigator", level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it("reports the role carried by the signed token", async () => {
    seedToken(ADMIN_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.metrics_section");

    expect(screen.getByText("Role: Administrator")).toBeInTheDocument();
    // The shell persists for the whole session, not per view.
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("top_bar")).toBeInTheDocument();
    expect(screen.getByTestId("top_bar.identity")).toHaveTextContent(
      "Dy. Comm. Sharma",
    );
  });

  it("renders an audit-logger session as itself", async () => {
    seedToken(AUDIT_LOGGER_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.metrics_section");

    expect(screen.getByText("Role: Audit Logger")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
