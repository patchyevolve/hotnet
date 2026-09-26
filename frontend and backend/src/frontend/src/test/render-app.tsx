import { AppShell } from "@/components/crimenet/AppShell";
import { RoleProvider } from "@/lib/crimenet/role-context";
import { getToken } from "@/lib/crimenet/services";
import { AiInvestigatorPage } from "@/pages/AiInvestigatorPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { CaseWorkbenchPage } from "@/pages/CaseWorkbenchPage";
import { CasesPage } from "@/pages/CasesPage";
import { CdrPage } from "@/pages/CdrPage";
import { CommandCenterPage } from "@/pages/CommandCenterPage";
import { EntityListPage } from "@/pages/EntityListPage";
import { EntityPage } from "@/pages/EntityPage";
import { EvidencePage } from "@/pages/EvidencePage";
import { FacePage } from "@/pages/FacePage";
import { MapPage } from "@/pages/MapPage";
import { MoneyTrailPage } from "@/pages/MoneyTrailPage";
import { NetworkPage } from "@/pages/NetworkPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { SignInPage } from "@/pages/SignInPage";
import { UploadPage } from "@/pages/UploadPage";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Test-only router harness.
 *
 * Mirrors the route table in `src/App.tsx` so component/integration tests can
 * render the real pages inside the real shell at a chosen initial URL. The
 * production `App` builds a module-level router bound to `window.location`,
 * which cannot be re-pointed per test; this harness uses memory history so each
 * test starts at a deterministic route without touching production code.
 */
/**
 * Mirrors `RootLayout` in `src/App.tsx`, including the detail that the sign-in
 * branch still needs the role provider: `SignInPage` reads `language` and
 * writes `role`, so it must not render outside the context.
 */
function RootLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bare = pathname === "/signin";
  return (
    <RoleProvider>
      {bare ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
    </RoleProvider>
  );
}

function buildRouter(initialPath: string) {
  const rootRoute = createRootRoute({
    beforeLoad: ({ location }) => {
      if (location.pathname !== "/signin" && !getToken()) {
        throw redirect({ to: "/signin" });
      }
    },
    component: RootLayout,
    notFoundComponent: NotFoundPage,
  });

  const routes = [
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: CommandCenterPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/cases",
      component: CasesPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/cases/$caseId",
      component: CaseWorkbenchPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/network",
      component: NetworkPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/entities",
      component: EntityListPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/entities/$entityId",
      component: EntityPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/cdr",
      component: CdrPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/money-trail",
      component: MoneyTrailPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/map",
      component: MapPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/ai-investigator",
      component: AiInvestigatorPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/evidence",
      component: EvidencePage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/security",
      component: SecurityPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/face",
      component: FacePage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/signin",
      component: SignInPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/intake",
      component: UploadPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/analytics",
      component: AnalyticsPage,
    }),
  ];

  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return router;
}

/** Render the full app shell at `initialPath` and return the router. */
export function renderApp(initialPath = "/") {
  if (initialPath !== "/signin" && !localStorage.getItem("crimenet.token")) {
    localStorage.setItem("crimenet.token", "test-token");
  }
  const router = buildRouter(initialPath);
  const result = render(<RouterProvider router={router} />);
  return { router, ...result };
}

/** Render an arbitrary element wrapped in the role provider (no router). */
export function renderWithRole(ui: ReactElement) {
  return render(<RoleProvider>{ui}</RoleProvider>);
}
