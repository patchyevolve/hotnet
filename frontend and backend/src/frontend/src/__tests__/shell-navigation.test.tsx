import { apiMock } from "@/test/api-mock";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

const SECTIONS: { label: string; path: string; heading: string }[] = [
  { label: "Command Center", path: "/", heading: "Command Center" },
  { label: "Cases", path: "/cases", heading: "Cases" },
  { label: "Case Intake", path: "/intake", heading: "Case Intake" },
  {
    label: "Graph Analytics",
    path: "/analytics",
    heading: "Graph Analytics",
  },
  {
    label: "Network Intelligence",
    path: "/network",
    heading: "Network",
  },
  { label: "CDR Analysis", path: "/cdr", heading: "CDR Analysis" },
  { label: "Money Trail", path: "/money-trail", heading: "Money Trail" },
  { label: "Command Map", path: "/map", heading: "Command Map" },
  {
    label: "Entity Intelligence",
    path: "/entities",
    heading: "Entity Intelligence",
  },
  {
    label: "Face Intelligence",
    path: "/face",
    heading: "Face Intelligence",
  },
  {
    label: "AI Investigator",
    path: "/ai-investigator",
    heading: "AI Investigator",
  },
  { label: "Evidence Vault", path: "/evidence", heading: "Evidence Vault" },
  {
    label: "Security & Audit",
    path: "/security",
    heading: "Security & Audit",
  },
];

describe("app shell and sidebar navigation", () => {
  it("renders the Command Center on the default route without a blank screen", async () => {
    renderApp("/");

    expect(
      await screen.findByTestId("command_center.page"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("top_bar")).toBeInTheDocument();
  });

  it("lists all thirteen sections in the sidebar", async () => {
    renderApp("/");
    await screen.findByTestId("command_center.page");

    const sidebar = screen.getByTestId("sidebar");
    expect(SECTIONS).toHaveLength(13);
    for (const section of SECTIONS) {
      expect(
        within(sidebar).getByRole("link", { name: section.label }),
      ).toBeInTheDocument();
    }
  });

  it("navigates to every section from the sidebar with no empty-looking page", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByTestId("command_center.page");

    for (const section of SECTIONS) {
      const sidebar = screen.getByTestId("sidebar");
      await user.click(
        within(sidebar).getByRole("link", { name: section.label }),
      );

      // Each page renders a PageHeader with its section title.
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: section.heading, level: 1 }),
        ).toBeInTheDocument();
      });
      // The shell persists across navigation.
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("top_bar")).toBeInTheDocument();
    }

    // Every section read from the fixture server, not from a silent fallback.
    expect(apiMock.missing).toEqual([]);
  });

  it("marks the active section in the sidebar", async () => {
    renderApp("/cases");
    await screen.findByRole("heading", { name: "Cases", level: 1 });

    const sidebar = screen.getByTestId("sidebar");
    expect(
      within(sidebar).getByRole("link", { name: "Cases" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
