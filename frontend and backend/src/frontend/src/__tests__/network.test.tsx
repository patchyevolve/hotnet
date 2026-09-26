import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

const PERSON = "RES_f90015a9027df8e3";
const PHONE = "RES_9eeb75085f3656ee";

describe("Network link analysis", () => {
  it("renders the graph canvas, a legend of real relationship types and a detail panel", async () => {
    renderApp("/network");
    await screen.findByTestId("network.page");

    expect(await screen.findByTestId("graph_canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Entity link analysis graph" }),
    ).toBeInTheDocument();

    // The legend lists the relationship types the run actually produced,
    // each with the number of edges carrying it.
    const legend = screen.getByRole("heading", { name: "Graph Legend" })
      .parentElement?.parentElement as HTMLElement;
    expect(legend).toBeInTheDocument();
    for (const label of ["Visited", "Associated With", "Shared Phone"]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }

    // The first node is selected by default and its detail panel is populated.
    const detail = screen.getByTestId("detail_panel");
    expect(
      within(detail).getByText("Karol Bagh Main Market Camera 5"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("network.open_entity_button"),
    ).toBeInTheDocument();
  });

  it("selects a node and opens the entity drawer via double-click expand", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    const node = screen.getByTestId(`graph_canvas.node.${PERSON}`);
    await user.dblClick(node);

    const drawer = await screen.findByTestId("entity_drawer");
    expect(
      await within(drawer).findByRole("heading", { name: "Rakesh Kumar" }),
    ).toBeInTheDocument();
  });

  it("filters the graph by entity type", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    const kindSelect = screen.getByTestId("filter_bar.select.kind");
    await user.selectOptions(kindSelect, "person");

    await waitFor(() => {
      expect(
        screen.getByTestId(`graph_canvas.node.${PERSON}`),
      ).toBeInTheDocument();
    });
    // A phone entity is filtered out when only persons are shown.
    expect(
      screen.queryByTestId(`graph_canvas.node.${PHONE}`),
    ).not.toBeInTheDocument();
  });

  it("resets filters back to the full graph", async () => {
    const user = userEvent.setup();
    renderApp("/network");
    await screen.findByTestId("network.page");
    await screen.findByTestId("graph_canvas");

    await user.selectOptions(
      screen.getByTestId("filter_bar.select.kind"),
      "person",
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId(`graph_canvas.node.${PHONE}`),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId("filter_bar.reset_button"));
    await waitFor(() => {
      expect(
        screen.getByTestId(`graph_canvas.node.${PHONE}`),
      ).toBeInTheDocument();
    });
  });
});
