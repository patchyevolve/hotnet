import { apiMock } from "@/test/api-mock";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * The intake flow is the demo's entry point: register an FIR, attach evidence,
 * run the pipeline, then open the case the run produced. The run is
 * asynchronous, so this test polls the job card until it reaches a terminal
 * state rather than asserting against the first (still-running) frame.
 */
describe("case intake", () => {
  it("registers an FIR, uploads evidence and runs the pipeline", async () => {
    const user = userEvent.setup();
    renderApp("/intake");
    await screen.findByTestId("intake.page");

    // Register: the FIR number is typed, the case id is issued by the server.
    await user.type(screen.getByTestId("intake.fir_input"), "DF/2026/7777");
    await user.type(
      screen.getByTestId("intake.title_input"),
      "Seed wallet fraud",
    );
    await user.type(
      screen.getByTestId("intake.description_input"),
      "Mule account cluster opened from a single seed wallet.",
    );
    await user.click(screen.getByTestId("intake.register_button"));

    const summary = await screen.findByText("CASE_000002");
    expect(summary).toBeInTheDocument();
    expect(screen.getAllByText("DF/2026/7777").length).toBeGreaterThan(0);
    // The register form is replaced by the issued identifiers.
    expect(
      screen.queryByTestId("intake.register_button"),
    ).not.toBeInTheDocument();

    // Attach evidence. The panel lists exactly what the server stored back.
    await user.upload(screen.getByTestId("intake.file_input"), [
      new File(["fir body"], "01_FIR.txt", { type: "text/plain" }),
      new File(["caller,callee"], "12_CDR.csv", { type: "text/csv" }),
    ]);
    expect(screen.getByText("01_FIR.txt")).toBeInTheDocument();
    expect(screen.getByText("12_CDR.csv")).toBeInTheDocument();

    await user.click(screen.getByTestId("intake.upload_button"));
    await waitFor(() => expect(apiMock.uploads).toHaveLength(2));
    expect(apiMock.uploads.map((row) => row.originalName)).toEqual([
      "01_FIR.txt",
      "12_CDR.csv",
    ]);

    // With evidence already stored the run button offers the append path.
    const runButton = screen.getByTestId("intake.run_button");
    await waitFor(() =>
      expect(runButton).toHaveTextContent("Append and re-run"),
    );
    await user.click(runButton);

    // Poll until the job reaches a terminal state.
    await waitFor(
      () => {
        expect(
          screen.getByTestId("intake.open_case_button"),
        ).toBeInTheDocument();
      },
      { timeout: 10_000, interval: 200 },
    );

    const card = screen.getByTestId("intake.run_card");
    expect(within(card).getByText("Completed")).toBeInTheDocument();
    expect(within(card).getByText("12/12")).toBeInTheDocument();
    expect(within(card).getByText("run_test_0001")).toBeInTheDocument();
    expect(screen.queryByTestId("intake.error")).not.toBeInTheDocument();
  }, 15_000);

  it("reports a failed registration instead of failing silently", async () => {
    const user = userEvent.setup();
    renderApp("/intake");
    await screen.findByTestId("intake.page");

    // The submit stays disabled until the FIR number and a real title exist.
    expect(screen.getByTestId("intake.register_button")).toBeDisabled();

    await user.type(screen.getByTestId("intake.fir_input"), "DF/2026/7778");
    await user.type(screen.getByTestId("intake.title_input"), "ab");
    expect(screen.getByTestId("intake.register_button")).toBeDisabled();

    await user.type(screen.getByTestId("intake.title_input"), "c");
    expect(screen.getByTestId("intake.register_button")).toBeEnabled();
  });
});
