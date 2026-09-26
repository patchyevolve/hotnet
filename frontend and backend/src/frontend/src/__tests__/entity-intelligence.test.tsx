import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

const ENTITY_PATH = "/entities/RES_f90015a9027df8e3";

describe("Entity Intelligence", () => {
  it("renders the profile header and the count cards", async () => {
    renderApp(ENTITY_PATH);
    await screen.findByTestId("entity.page");

    expect(
      screen.getByRole("heading", { name: "Rakesh Kumar", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("RES_f90015a9027df8e3 · Person"),
    ).toBeInTheDocument();

    // Every count is derived from the entity record, never a literal.
    const panels = document.querySelectorAll(
      "[data-ocid='entity.page'] .panel",
    );
    const value = (label: string) => {
      const card = [...panels].find(
        (node) => node.querySelector(".label-caps")?.textContent === label,
      );
      return card?.querySelector(".metric-value")?.textContent ?? null;
    };
    expect(value("Linked Cases")).toBe("1");
    expect(value("Phone Numbers")).toBe("1");
    expect(value("Bank Accounts")).toBe("0");
    expect(value("Associates")).toBe("10");
    expect(value("Locations")).toBe("3");
  });

  it("renders all seven tabs and switches content", async () => {
    const user = userEvent.setup();
    renderApp(ENTITY_PATH);
    await screen.findByTestId("entity.page");

    const tabs = screen.getByTestId("entity.tabs");
    for (const name of [
      "Overview",
      "Connections",
      "Cases",
      "Communications",
      "Financial Activity",
      "Locations",
      "Timeline",
    ]) {
      expect(within(tabs).getByRole("tab", { name })).toBeInTheDocument();
    }

    // Overview shows identifiers and attributes.
    expect(screen.getByText("Identifiers")).toBeInTheDocument();
    expect(screen.getByText("Attributes")).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "Connections" }));
    expect(await screen.findByText("Entity ID")).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "Cases" }));
    expect(
      await screen.findByTestId("entity.case_link.CASE_000001"),
    ).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "Communications" }));
    expect(await screen.findByText(/records$/)).toBeInTheDocument();

    await user.click(
      within(tabs).getByRole("tab", { name: "Financial Activity" }),
    );
    expect(await screen.findByText("6 traced transfers")).toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "Locations" }));
    expect(
      await screen.findByRole("heading", { name: "Locations" }),
    ).toBeInTheDocument();
  });

  it("navigates to the linked case from the Cases tab", async () => {
    const user = userEvent.setup();
    renderApp(ENTITY_PATH);
    await screen.findByTestId("entity.page");

    await user.click(screen.getByTestId("entity.tab.cases"));
    await user.click(await screen.findByTestId("entity.case_link.CASE_000001"));

    await waitFor(() => {
      expect(screen.getByTestId("case_workbench.page")).toBeInTheDocument();
    });
  });

  it("navigates to the network from Expand Network", async () => {
    const user = userEvent.setup();
    renderApp(ENTITY_PATH);
    await screen.findByTestId("entity.page");

    await user.click(screen.getByTestId("entity.expand_network_button"));
    await waitFor(() => {
      expect(screen.getByTestId("network.page")).toBeInTheDocument();
    });
  });

  it("shows a not-found state for an unknown entity id", async () => {
    renderApp("/entities/RES_000000000000000");
    await waitFor(() => {
      expect(screen.getByText("Entity not found")).toBeInTheDocument();
    });
  });
});
