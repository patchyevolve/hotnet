/**
 * Network page tests — updated for the Canvas-based renderer.
 *
 * The new GraphCanvas renders onto an HTML <canvas> element, so individual
 * nodes are no longer DOM buttons. Tests verify the page structure, controls,
 * filters, legend, and detail panel rather than per-node DOM elements.
 */
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

describe("Network link analysis", () => {
  it("renders the graph canvas, controls, legend and detail panel", async () => {
    renderApp("/network");
    await screen.findByTestId("network.page");

    // The canvas container is present
    expect(await screen.findByTestId("graph_canvas")).toBeInTheDocument();
    // The canvas element has its accessible role+label
    expect(
      screen.getByRole("img", {
        name: "Criminal network analysis graph — use arrow keys to pan, +/- to zoom",
      }),
    ).toBeInTheDocument();

    // GraphControls strip is rendered
    expect(screen.getByTestId("graph_controls")).toBeInTheDocument();

    // Mode buttons — all 6 modes
    for (const mode of [
      "Network",
      "Risk",
      "Community",
      "Evidence",
      "Temporal",
      "Centrality",
    ]) {
      expect(
        within(screen.getByTestId("graph_controls")).getByRole("button", {
          name: mode,
        }),
      ).toBeInTheDocument();
    }

    // Legend is rendered
    expect(screen.getByTestId("graph_legend")).toBeInTheDocument();

    // Entity detail panel is rendered (nothing selected yet — shows placeholder)
    expect(screen.getByTestId("detail_panel")).toBeInTheDocument();
  });

  it("switches graph modes via the controls", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    const controls = screen.getByTestId("graph_controls");

    // Switch to Risk mode
    await user.click(within(controls).getByRole("button", { name: "Risk" }));
    const riskBtn = within(controls).getByRole("button", { name: "Risk" });
    expect(riskBtn).toHaveAttribute("aria-pressed", "true");

    // Switch to Community mode
    await user.click(
      within(controls).getByRole("button", { name: "Community" }),
    );
    expect(
      within(controls).getByRole("button", { name: "Community" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Risk should no longer be active
    expect(
      within(controls).getByRole("button", { name: "Risk" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("filters the graph by entity type — node and edge counts update", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    // The filter bar has the entity-type dropdown
    const kindSelect = screen.getByTestId("filter_bar.select.kind");
    expect(kindSelect).toBeInTheDocument();

    // Select "Person" — node count badge should update
    await user.selectOptions(kindSelect, "person");

    await waitFor(() => {
      // The node·edge count badges on the controls strip should show
      // only person nodes (some number > 0 followed by N)
      const countText = screen.getByTestId("graph_controls").textContent ?? "";
      expect(countText).toMatch(/\d+N/);
    });
  });

  it("resets filters via the reset button", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    // Apply a filter
    await user.selectOptions(
      screen.getByTestId("filter_bar.select.kind"),
      "person",
    );

    // Reset
    await user.click(screen.getByTestId("filter_bar.reset_button"));

    await waitFor(() => {
      // After reset the "All" option should be selected again
      expect(
        (screen.getByTestId("filter_bar.select.kind") as HTMLSelectElement)
          .value,
      ).toBe("all");
    });
  });

  it("enables path mode via the controls", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    const pathBtn = screen.getByTestId("graph_controls.path_mode");
    await user.click(pathBtn);

    expect(pathBtn).toHaveAttribute("aria-pressed", "true");
    // Placeholder pills should appear
    expect(
      within(screen.getByTestId("graph_controls")).getByText(/select source/i),
    ).toBeInTheDocument();
  });

  it("toggles the freeze layout button", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    const freezeBtn = screen.getByTestId("graph_controls.freeze");
    // Initially frozen — the backend layout renders untouched
    expect(freezeBtn).toHaveTextContent(/Frozen/i);
    expect(freezeBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(freezeBtn);
    expect(freezeBtn).toHaveTextContent(/Live/i);
    expect(freezeBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the legend with entity shapes and risk colours", async () => {
    renderApp("/network");
    await screen.findByTestId("network.page");

    const legend = await screen.findByTestId("graph_legend");

    // Legend has an entity shapes section
    expect(within(legend).getByText("Entity shapes")).toBeInTheDocument();

    // Risk border key
    for (const level of ["Critical", "High", "Medium", "Low"]) {
      expect(within(legend).getByText(level)).toBeInTheDocument();
    }

    // State labels
    expect(within(legend).getByText("Selected")).toBeInTheDocument();
    expect(within(legend).getByText("Path")).toBeInTheDocument();
  });

  it("detail panel shows placeholder when nothing is selected", async () => {
    renderApp("/network");
    await screen.findByTestId("network.page");

    const panel = await screen.findByTestId("detail_panel");
    expect(
      within(panel).getByText(/Click a node to inspect/i),
    ).toBeInTheDocument();
  });

  it("the colour mode dropdown changes the legend colour section label", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_legend");

    // Default is entity type
    const legend = screen.getByTestId("graph_legend");
    expect(
      within(legend).getByText(/Colour — entity type/i),
    ).toBeInTheDocument();

    // Switch to risk level
    const colorSelect = screen.getByTestId("graph_controls.color_mode");
    await user.selectOptions(colorSelect, "riskLevel");

    await waitFor(() => {
      expect(
        within(screen.getByTestId("graph_legend")).getByText(
          /Colour — risk level/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
