import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

describe("global search", () => {
  it("returns the Rakesh Kumar entity and opens its Entity Intelligence profile", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByTestId("command_center.page");

    const input = screen.getByTestId("global_search.input");
    await user.type(input, "rakesh");

    const results = await screen.findByTestId("global_search.results");
    const entityResult = await within(results).findByTestId(
      "global_search.result.RES_f90015a9027df8e3",
    );
    expect(entityResult).toBeInTheDocument();
    expect(within(entityResult).getByText("Rakesh Kumar")).toBeInTheDocument();
    expect(within(results).getByText("Persons")).toBeInTheDocument();

    await user.click(entityResult);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Rakesh Kumar", level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("entity.page")).toBeInTheDocument();
  });

  it("groups results by record kind for a case query", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByTestId("command_center.page");

    await user.type(screen.getByTestId("global_search.input"), "case");

    const results = await screen.findByTestId("global_search.results");
    const caseResult = await within(results).findByTestId(
      "global_search.result.CASE_000001",
    );
    expect(caseResult).toBeInTheDocument();
    expect(within(results).getByText("Cases")).toBeInTheDocument();
    expect(within(results).getByText("UPI fraud ring")).toBeInTheDocument();
  });

  it("shows an empty state for a query with no matches", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByTestId("command_center.page");

    await user.type(screen.getByTestId("global_search.input"), "zzzz-no-match");

    expect(
      await screen.findByTestId("global_search.empty_state"),
    ).toBeInTheDocument();
  });
});
