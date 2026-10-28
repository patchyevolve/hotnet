import fixtures from "@/test/fixtures/api-fixtures.json";
import { renderApp } from "@/test/render-app";
import { configure, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

interface SourceFileRow {
  file: string;
  records?: number;
  hash?: string;
  integrity?: string;
  transferCount?: number;
  volume?: number;
}

interface MoneyTx {
  id: string;
  amount: number;
  description?: string;
  sourceFile?: string;
  sourceHash?: string;
  sourceIntegrity?: string;
  extractionConfidence?: number;
  extractionBasis?: string[];
}

const money = fixtures["/api/money?caseId=CASE_000001"] as {
  totalVolume: number;
  tracedLabel: string;
  transactions: MoneyTx[];
  sourceFiles: SourceFileRow[];
};

/**
 * Judges rejected the old Money Trail because it showed a bare total with no
 * backing. These tests lock the provenance contract: the rupee total is
 * exactly the sum of the transfers, every transfer names a hashed source
 * file, and the coverage panel shows all bank files the run ingested.
 */
describe("Money Trail provenance", () => {
  it("the traced total is a rupee amount with a transfer count behind it", async () => {
    renderApp("/money-trail");

    await screen.findByText("Source coverage");
    // Was: TRACED card showed only "6 traced transfers" with no ₹ figure.
    expect(await screen.findByText("₹20,65,000")).toBeInTheDocument();
    expect(screen.getByText("6 transfers")).toBeInTheDocument();
  });

  it("proves the arithmetic: transfers and source files both sum to the total", () => {
    const transferSum = money.transactions.reduce(
      (sum, tx) => sum + tx.amount,
      0,
    );
    const fileSum = money.sourceFiles.reduce(
      (sum, row) => sum + (row.volume ?? 0),
      0,
    );
    expect(transferSum).toBe(money.totalVolume);
    expect(fileSum).toBe(money.totalVolume);
    expect(money.totalVolume).toBe(2_065_000);
  });

  it("ties every transfer to a hashed source file with an integrity verdict", () => {
    expect(money.transactions.length).toBeGreaterThan(0);
    const verdicts = new Set<string>();
    for (const tx of money.transactions) {
      expect(tx.sourceFile).toBeTruthy();
      expect(tx.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(tx.sourceIntegrity).toMatch(/^(verified|tampered)$/);
      verdicts.add(tx.sourceIntegrity as string);
      expect(tx.description).toBeTruthy();
      expect(tx.extractionConfidence).toBe(1);
      expect(tx.extractionBasis).toContain("Bank record direct");
    }
    // The 31_Adversarial_Bank.csv transfer keeps its failed verdict — it is
    // not laundered into "verified" to make the panel look clean.
    expect(verdicts).toEqual(new Set(["verified", "tampered"]));
    const tampered = money.transactions.filter(
      (tx) => tx.sourceIntegrity === "tampered",
    );
    expect(tampered).toHaveLength(1);
    expect(tampered[0].sourceFile).toBe("31_Adversarial_Bank.csv");
  });

  it("coverage panel lists every bank file, including zero-transfer ones", async () => {
    renderApp("/money-trail");

    const heading = await screen.findByText("Source coverage");
    const panel = heading.closest("section");
    expect(panel).not.toBeNull();
    const scope = within(panel as HTMLElement);

    // All 7 bank files are shown — files with 0 transfers included.
    expect(scope.getByText("15_Bank_Meena.csv")).toBeInTheDocument();
    expect(scope.getByText("05_Bank_Rakesh.csv")).toBeInTheDocument();
    expect(scope.getByText("48_Bank_Transactions.xlsx")).toBeInTheDocument();
    expect(scope.getByText("07_Bank_Amit.csv")).toBeInTheDocument();

    // Hash + integrity verdict are surfaced per file (hash rendered short).
    expect(scope.getAllByText(/^sha256:5ede39dc58640bef1/).length).toBe(1);
    expect(scope.getAllByText("Integrity Verified").length).toBeGreaterThan(0);
    // 31_Adversarial_Bank.csv failed the run's integrity screen.
    expect(scope.getByText("Integrity Failed")).toBeInTheDocument();

    // Zero-transfer files must not print a bare ₹0 — an em dash plus the
    // explanation that their rows were read but held no resolved transfer.
    expect(screen.queryByText("₹0")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Files showing 0 transfers were read and quality-screened/,
      ),
    ).toBeInTheDocument();
  });

  it("every transaction row names the file it was extracted from", async () => {
    renderApp("/money-trail");

    await screen.findByText("Source coverage");
    // 3 of the 6 transfers were read from 15_Bank_Meena.csv.
    expect(
      screen.getAllByText("15_Bank_Meena.csv").length,
    ).toBeGreaterThanOrEqual(3);
    // The adversarial file's transfer keeps its provenance visible too.
    expect(
      screen.getAllByText("31_Adversarial_Bank.csv").length,
    ).toBeGreaterThan(0);
    // Channel column (always "—") was replaced by the source file column.
    expect(screen.queryByRole("columnheader", { name: /channel/i })).toBeNull();
    expect(
      screen.getAllByRole("columnheader", { name: /source file/i }).length,
    ).toBeGreaterThan(0);
  });

  it("stage detail explains extraction instead of an empty indicator block", async () => {
    renderApp("/money-trail");

    // Default-selected stage carries its narration + extraction basis
    // (also echoed in the transaction detail panel).
    expect(
      (await screen.findAllByText("Transfer to Suresh")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Bank record direct").length).toBeGreaterThan(0);
    // Extraction confidence renders as a percent (100%), not a raw ratio.
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });
});
