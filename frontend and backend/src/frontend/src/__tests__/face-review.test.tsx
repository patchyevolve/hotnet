import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * The Face review flow runs against the real fixture dump of the demo
 * pipeline run (suresh.jpeg + liftCCTV.jpeg): one confirmed FIR portrait,
 * one probable CCTV match carrying the overlay provenance (CAM_4,
 * 2024-06-25T14:32:01, similarity 0.5306, confidence 0.65).
 *
 * Tests wait for the loaded table rather than the loading skeleton, and scope
 * assertions to the detail panel because subjects repeat across rows.
 *
 * The confirm test runs last: the api mock persists decisions in its fixture
 * copy, so the "probable" precondition must not be consumed earlier.
 */
async function renderLoadedFacePage() {
  renderApp("/face");
  await screen.findByTestId("face.page");
  await screen.findByText("Total Matches");
}

function detail() {
  return screen.getByTestId("detail_panel");
}

describe("Face review", () => {
  it("raises the review alert for a pending identity candidate", async () => {
    await renderLoadedFacePage();

    const banner = screen.getByTestId("face.alert_banner");
    expect(
      within(banner).getByText("Face match awaiting review"),
    ).toBeInTheDocument();
    expect(within(banner).getByText("1")).toBeInTheDocument();

    // The pending CCTV match shows its overlay provenance in the detail panel.
    await userEvent.click(screen.getByText("face_liftCCTV_0"));
    await waitFor(() => {
      expect(within(detail()).getByText("CAM_4")).toBeInTheDocument();
    });
    expect(within(detail()).getByText("65.0%")).toBeInTheDocument();
    expect(within(detail()).getByText("53.1%")).toBeInTheDocument();
    expect(within(detail()).getByText("Matched from")).toBeInTheDocument();
    expect(
      within(detail()).getByText("liftCCTV.jpeg, suresh.jpeg"),
    ).toBeInTheDocument();
    expect(within(detail()).getAllByText("Probable").length).toBeGreaterThan(0);

    // The detail panel opens with the side-by-side comparison: reference
    // (suresh.jpeg) against the capture (liftCCTV.jpeg), pipeline bboxes and
    // the ArcFace similarity behind the claim.
    const comparison = screen.getByTestId("face.comparison");
    expect(
      within(comparison).getByTestId("face.comparison.reference_image"),
    ).toHaveAttribute("src", "/api/faces/image?file=suresh.jpeg");
    expect(
      within(comparison).getByTestId("face.comparison.capture_image"),
    ).toHaveAttribute("src", "/api/faces/image?file=liftCCTV.jpeg");
    expect(
      within(comparison).getByTestId("face.comparison.similarity"),
    ).toHaveTextContent("53.1%");
    expect(within(comparison).getByText("Reference")).toBeInTheDocument();
    expect(within(comparison).getByText("Capture")).toBeInTheDocument();
  });

  it("offers confirm and reject only for the pending match", async () => {
    await renderLoadedFacePage();

    // First row (confirmed FIR portrait) has no decision buttons.
    expect(screen.queryByTestId("face.confirm_button")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("face_liftCCTV_0"));
    await waitFor(() => {
      expect(screen.getByTestId("face.confirm_button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("face.reject_button")).toBeInTheDocument();
    expect(screen.getByText("Confirm match")).toBeInTheDocument();
    expect(screen.getByText("Reject match")).toBeInTheDocument();
  });

  it("opens the resolved subject entity from the record", async () => {
    await renderLoadedFacePage();

    // The record's entityId is the resolved graph node (the pipeline person
    // id was absorbed during resolution), so the drawer finds the subject
    // instead of landing on "Entity not found." The first row is selected
    // by default after load.
    await userEvent.click(screen.getByTestId("face.open_entity_button"));

    const drawer = await screen.findByTestId("entity_drawer");
    await waitFor(() => {
      expect(
        within(drawer).getByText("RES_da5923c0c1c805e2"),
      ).toBeInTheDocument();
    });
    expect(within(drawer).getByText("Suresh")).toBeInTheDocument();
    expect(
      within(drawer).queryByText("Entity not found."),
    ).not.toBeInTheDocument();
  });

  it("records the investigator decision and clears the alert", async () => {
    await renderLoadedFacePage();

    await userEvent.click(screen.getByText("face_liftCCTV_0"));
    await waitFor(() => {
      expect(screen.getByTestId("face.confirm_button")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("face.confirm_button"));

    await waitFor(() => {
      expect(screen.getByTestId("face.decision_note")).toHaveTextContent(
        "Decision recorded",
      );
    });
    // Status flips to Confirmed (pill + detail field), the decision is
    // attributed, and the pending-match banner disappears.
    await waitFor(() => {
      expect(within(detail()).getAllByText("Confirmed").length).toBeGreaterThan(
        0,
      );
    });
    expect(within(detail()).getByText("Decided by")).toBeInTheDocument();
    expect(within(detail()).getByText(/^Inspector ·/)).toBeInTheDocument();
    expect(screen.queryByTestId("face.alert_banner")).not.toBeInTheDocument();
  });
});
