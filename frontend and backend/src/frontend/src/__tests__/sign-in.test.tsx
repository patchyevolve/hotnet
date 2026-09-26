import { renderApp } from "@/test/render-app";
import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

configure({ testIdAttribute: "data-ocid" });

/**
 * The identity picker is the one route that renders outside `AppShell`, so it
 * is the one route where a missing `RoleProvider` breaks — `SignInPage` reads
 * `language` for its copy and writes `role` back once the session is issued.
 * No other test navigates here, because every other harness seeds a token and
 * the router then never lands on `/signin`.
 */
describe("sign in", () => {
  it("renders the bare identity picker and carries the chosen role into the shell", async () => {
    const user = userEvent.setup();
    renderApp("/signin");

    expect(await screen.findByText("Sign in to CrimeNet")).toBeInTheDocument();
    // Bare: no shell chrome around the card.
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("top_bar")).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId("signin.display_name_input"),
      "Insp. Rao",
    );
    await user.click(screen.getByTestId("signin.role_supervisor"));

    const submit = screen.getByTestId("signin.submit_button");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    // Signed in: the shell mounts and the role picked above is the one the
    // switcher reports — the provider instance survived the navigation.
    expect(await screen.findByTestId("sidebar")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("role_switcher.trigger")).toHaveTextContent(
        "Supervisor",
      );
    });
  });
});
