import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * The Evidence Vault renders its page shell immediately and swaps in the
 * loaded content once `getEvidence()` / `getCustodyEvents()` resolve. Every
 * test therefore waits for a loaded-content signal (the metric cards) before
 * asserting, rather than resolving on the loading skeleton.
 *
 * The same value can appear in both the table and the detail panel, so
 * assertions are scoped to the region that owns the behavior under test.
 */
async function renderLoadedEvidence() {
  renderApp("/evidence");
  await screen.findByTestId("evidence.page");
  await screen.findByText("Total Items");
}

describe("Evidence Vault", () => {
  it("renders the vault metrics and the integrity overview", async () => {
    await renderLoadedEvidence();

    // Scope to the metric cards: "Verified" also appears as a status pill.
    const total = within(screen.getByTestId("metric_card.1")).getByText(
      "Total Items",
    );
    expect(total).toBeInTheDocument();
    expect(
      within(screen.getByTestId("metric_card.1")).getByText("55"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("metric_card.2")).getByText("Verified"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("metric_card.2")).getByText("51"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("metric_card.3")).getByText("Integrity Flags"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("metric_card.3")).getByText("4"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Vault Integrity Overview" }),
    ).toBeInTheDocument();
  });

  it("shows hash, uploader, timestamp and chain of custody for the selected item", async () => {
    await renderLoadedEvidence();

    // EV_0001 is selected by default and has two custody events.
    const detail = screen.getByTestId("detail_panel");
    expect(
      within(detail).getByText(
        "sha256:737fde3ea198f9760c0fd17c52244536df4be4d5a4677a17fb4e40f451e5133e",
      ),
    ).toBeInTheDocument();
    expect(
      within(detail).getAllByText("USER_3CC3F8041605").length,
    ).toBeGreaterThan(0);
    expect(within(detail).getByText("Chain of Custody")).toBeInTheDocument();
    expect(
      within(detail).getByTestId("chain_of_custody.item.1"),
    ).toBeInTheDocument();
    expect(
      within(detail).getByTestId("chain_of_custody.item.2"),
    ).toBeInTheDocument();
    expect(within(detail).getAllByText("Collected").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("Analyzed").length).toBeGreaterThan(0);
  });

  it("filters to tampered items and shows the integrity-failed label", async () => {
    const user = userEvent.setup();
    await renderLoadedEvidence();

    await user.selectOptions(
      screen.getByTestId("filter_bar.select.integrity"),
      "tampered",
    );

    // Filtering narrows the table to the four adversarial files, each carrying
    // the "Integrity Failed" status pill. The detail panel keeps the default
    // selection; filtering does not change it.
    const table = screen.getByTestId("data_table");
    await waitFor(() => {
      expect(within(table).getAllByText("Integrity Failed")).toHaveLength(4);
    });
    expect(
      within(table).getByText("30_Adversarial_CDR.csv"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("33_Adversarial_CCTV.csv"),
    ).toBeInTheDocument();
    expect(within(table).queryByText("01_FIR.txt")).not.toBeInTheDocument();
  });

  it("selects a different evidence row and updates the detail panel", async () => {
    const user = userEvent.setup();
    await renderLoadedEvidence();

    const table = screen.getByTestId("data_table");
    await user.click(within(table).getByText("30_Adversarial_CDR.csv"));

    const detail = screen.getByTestId("detail_panel");
    await waitFor(() => {
      expect(
        within(detail).getAllByText("30_Adversarial_CDR.csv").length,
      ).toBeGreaterThan(0);
    });
    expect(within(detail).getAllByText("Integrity Failed")).toHaveLength(1);
    expect(within(detail).getByText("EV_0030")).toBeInTheDocument();
  });
});
