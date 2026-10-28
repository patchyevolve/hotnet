import { DEMO_PASSWORD } from "@/test/api-mock";
import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * Sign-in is the credential gate: the form posts to `/api/auth/login`, the
 * issued token lands in storage, and the shell that follows renders whatever
 * role that token carries. It is the one route outside `AppShell`, so it is
 * also the one route where a missing `RoleProvider` would break.
 */
describe("sign in", () => {
  it("exchanges credentials for a token and opens the shell as that identity", async () => {
    const user = userEvent.setup();
    renderApp("/signin");

    expect(await screen.findByText("Sign in to CrimeNet")).toBeInTheDocument();
    // Bare: no shell chrome around the card.
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("top_bar")).not.toBeInTheDocument();
    // The role picker is gone — role comes from the token.
    expect(
      screen.queryByTestId("signin.role_supervisor"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId("signin.credential_input"),
      "supervisor@crimenet.local",
    );
    await user.type(screen.getByTestId("signin.password_input"), DEMO_PASSWORD);

    const submit = screen.getByTestId("signin.submit_button");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    // Signed in: the shell mounts and the identity comes from the stored token.
    expect(await screen.findByTestId("sidebar")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("top_bar.identity")).toHaveTextContent(
        "Supt. Verma",
      );
    });
    expect(localStorage.getItem("crimenet.token")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Role: Supervisor")).toBeInTheDocument();
    });
  });

  it("reports a rejected credential without leaving the form", async () => {
    const user = userEvent.setup();
    renderApp("/signin");
    await screen.findByText("Sign in to CrimeNet");

    await user.type(
      screen.getByTestId("signin.credential_input"),
      "inspector@crimenet.local",
    );
    await user.type(
      screen.getByTestId("signin.password_input"),
      "not-the-password",
    );

    const submit = screen.getByTestId("signin.submit_button");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByTestId("signin.error")).toHaveTextContent(
      "Invalid badge/email or password.",
    );
    // Still on sign-in: no token was issued, no shell mounted.
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(localStorage.getItem("crimenet.token")).toBeNull();
  });
});
