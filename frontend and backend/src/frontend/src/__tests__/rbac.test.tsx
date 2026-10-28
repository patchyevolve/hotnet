import { decodeToken } from "@/lib/crimenet/identity";
import {
  canCreateCase,
  canViewAudit,
  localEffectiveLevel,
  navItemsForRole,
} from "@/lib/crimenet/rbac";
import { getEffectiveLevel } from "@/lib/crimenet/services";
import { fixtureCase } from "@/test/api-mock";
import {
  ADMIN_DELHI,
  AUDIT_LOGGER_DELHI,
  INSPECTOR_DELHI,
  SUPERVISOR_DELHI,
  SUPERVISOR_MUMBAI,
  makeToken,
  seedToken,
} from "@/test/identity";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/** Section labels the sidebar offers a given role. */
function sidebarLabels(): string[] {
  const sidebar = screen.getByTestId("sidebar");
  return within(sidebar)
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");
}

describe("signed identity and client RBAC rules", () => {
  it("decodes role and station out of the issued token", () => {
    expect(decodeToken(makeToken(SUPERVISOR_MUMBAI))).toMatchObject({
      role: "SUPERVISOR",
      jurisdictionId: "JURISDICTION_MUMBAI_CYBERCRIME",
      displayName: "Supt. Kulkarni",
    });
    expect(decodeToken("not-a-token")).toBeNull();
    expect(decodeToken("header.only")).toBeNull();
    expect(decodeToken(null)).toBeNull();
  });

  it("derives the station baseline for each role", () => {
    const atOwnStation = { station: INSPECTOR_DELHI.jurisdictionId };
    expect(
      localEffectiveLevel(
        { ...INSPECTOR_DELHI, provider: "credential" },
        atOwnStation,
      ),
    ).toBe("WRITE");
    expect(
      localEffectiveLevel(
        { ...INSPECTOR_DELHI, provider: "credential" },
        { station: "JURISDICTION_MUMBAI_CYBERCRIME" },
      ),
    ).toBe("NONE");
    expect(
      localEffectiveLevel(
        { ...AUDIT_LOGGER_DELHI, provider: "credential" },
        atOwnStation,
      ),
    ).toBe("READ");
    expect(
      localEffectiveLevel(
        { ...ADMIN_DELHI, provider: "credential" },
        { station: "JURISDICTION_MUMBAI_CYBERCRIME" },
      ),
    ).toBe("ADMIN");
    expect(localEffectiveLevel(null)).toBe("NONE");
  });

  it("limits sections and actions per role", () => {
    expect(navItemsForRole("ADMIN")).toHaveLength(13);
    expect(navItemsForRole("SUPERVISOR")).toHaveLength(13);
    expect(navItemsForRole("INSPECTOR").map((item) => item.id)).not.toContain(
      "security-audit",
    );
    expect(navItemsForRole("AUDIT_LOGGER").map((item) => item.id)).toEqual([
      "command-center",
      "security-audit",
    ]);

    expect(canCreateCase("SUPERVISOR")).toBe(true);
    expect(canCreateCase("ADMIN")).toBe(true);
    expect(canCreateCase("INSPECTOR")).toBe(false);
    expect(canCreateCase("AUDIT_LOGGER")).toBe(false);

    expect(canViewAudit("AUDIT_LOGGER")).toBe(true);
    expect(canViewAudit("SUPERVISOR")).toBe(true);
    expect(canViewAudit("INSPECTOR")).toBe(false);
  });

  it("asks the server for the effective level and falls back when it cannot", async () => {
    seedToken(AUDIT_LOGGER_DELHI);
    // Fixture case sits in the auditor's own station, and they are not its
    // lead officer: the baseline READ comes back.
    expect(await getEffectiveLevel({ caseId: fixtureCase })).toBe("READ");

    seedToken(SUPERVISOR_MUMBAI);
    // Same case, other station: refused rather than downgraded to a read.
    expect(await getEffectiveLevel({ caseId: fixtureCase })).toBe("NONE");

    // Unreachable/unknown case: the answer is derived from the token instead,
    // which still fails closed cross-station.
    expect(
      await getEffectiveLevel({
        caseId: "CASE_999999",
        station: "JURISDICTION_DELHI_CYBERCRIME",
      }),
    ).toBe("NONE");
    seedToken(AUDIT_LOGGER_DELHI);
    expect(
      await getEffectiveLevel({
        caseId: "CASE_999999",
        station: AUDIT_LOGGER_DELHI.jurisdictionId,
      }),
    ).toBe("READ");
  });
});

describe("role-scoped navigation", () => {
  it("offers the full workstation to an administrator", async () => {
    seedToken(ADMIN_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.page");

    const labels = sidebarLabels();
    expect(labels).toHaveLength(13);
    expect(labels.join("|")).toContain("Security & Audit");
  });

  it("offers the full workstation to a supervisor", async () => {
    seedToken(SUPERVISOR_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.page");

    expect(sidebarLabels()).toHaveLength(13);
  });

  it("keeps audit oversight out of an inspector's sidebar", async () => {
    seedToken(INSPECTOR_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.page");

    const labels = sidebarLabels();
    expect(labels).toHaveLength(12);
    expect(labels.join("|")).not.toContain("Security & Audit");
    expect(labels.join("|")).toContain("Cases");
  });

  it("limits an audit logger to overview and audit sections", async () => {
    seedToken(AUDIT_LOGGER_DELHI);
    renderApp("/");
    await screen.findByTestId("command_center.page");

    const labels = sidebarLabels();
    expect(labels).toHaveLength(2);
    expect(labels.join("|")).toContain("Command Center");
    expect(labels.join("|")).toContain("Security & Audit");
    expect(labels.join("|")).not.toContain("Cases");
  });
});

describe("audit page guard", () => {
  it("refuses an inspector with the 403 page instead of the audit table", async () => {
    seedToken(INSPECTOR_DELHI);
    renderApp("/security");

    expect(await screen.findByTestId("forbidden.page")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Security & Audit", level: 1 }),
    ).not.toBeInTheDocument();
  });

  it("lets an audit logger open the audit trail", async () => {
    seedToken(AUDIT_LOGGER_DELHI);
    renderApp("/security");

    expect(
      await screen.findByRole("heading", {
        name: "Security & Audit",
        level: 1,
      }),
    ).toBeInTheDocument();
  });
});

describe("case intake guard", () => {
  it("shows the register form to a supervisor", async () => {
    seedToken(SUPERVISOR_DELHI);
    renderApp("/intake");

    // The form is rendered for them (it stays disabled until FIR + title).
    expect(
      await screen.findByTestId("intake.register_button"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("intake.fir_input")).toBeInTheDocument();
    // Supervisors only register inside their own station.
    expect(screen.getByTestId("intake.station_note")).toBeInTheDocument();
    expect(
      screen.queryByTestId("intake.create_restricted"),
    ).not.toBeInTheDocument();
  });

  it("tells an inspector registration is not theirs to perform", async () => {
    seedToken(INSPECTOR_DELHI);
    renderApp("/intake");

    expect(
      await screen.findByTestId("intake.create_restricted"),
    ).toHaveTextContent(
      "Case registration is limited to supervisors and administrators.",
    );
    expect(
      screen.queryByTestId("intake.register_button"),
    ).not.toBeInTheDocument();
  });
});

describe("case detail guard", () => {
  it("opens a same-station case for the lead inspector", async () => {
    seedToken(INSPECTOR_DELHI);
    renderApp(`/cases/${fixtureCase}`);

    expect(
      await screen.findByRole("heading", { name: "UPI fraud ring", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Read-only access")).not.toBeInTheDocument();
  });

  it("marks the case read-only for the auditor", async () => {
    seedToken(AUDIT_LOGGER_DELHI);
    renderApp(`/cases/${fixtureCase}`);

    expect(
      await screen.findByRole("heading", { name: "UPI fraud ring", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Read-only access")).toBeInTheDocument();
  });

  it("refuses a cross-station case with the 403 panel", async () => {
    seedToken(SUPERVISOR_MUMBAI);
    renderApp(`/cases/${fixtureCase}`);

    expect(await screen.findByTestId("forbidden.page")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "UPI fraud ring", level: 1 }),
    ).not.toBeInTheDocument();
  });
});

describe("case registry station scope", () => {
  it("shows another station's registry as empty to a cross-station supervisor", async () => {
    seedToken(SUPERVISOR_MUMBAI);
    renderApp("/cases");

    expect(await screen.findByTestId("cases.page")).toBeInTheDocument();
    expect(screen.queryByText(fixtureCase)).not.toBeInTheDocument();
    expect(screen.queryByText("UPI fraud ring")).not.toBeInTheDocument();
  });
});

describe("face decision guard", () => {
  it("offers confirm/reject to an inspector", async () => {
    const user = userEvent.setup();
    seedToken(INSPECTOR_DELHI);
    renderApp("/face");
    await screen.findByTestId("face.page");

    await user.click(await screen.findByText("face_liftCCTV_0"));
    await waitFor(() => {
      expect(screen.getByTestId("face.confirm_button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("face.reject_button")).toBeInTheDocument();
  });

  it("shows the auditor a read-only note instead of decision buttons", async () => {
    const user = userEvent.setup();
    seedToken(AUDIT_LOGGER_DELHI);
    renderApp("/face");
    await screen.findByTestId("face.page");

    await user.click(await screen.findByText("face_liftCCTV_0"));
    await waitFor(() => {
      expect(screen.getByTestId("face.read_only_note")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("face.confirm_button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("face.reject_button")).not.toBeInTheDocument();
  });
});
