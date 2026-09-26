import { AppShell } from "@/components/crimenet/AppShell";
import { RoleProvider } from "@/lib/crimenet/role-context";
import { getToken, setUnauthorizedHandler } from "@/lib/crimenet/services";
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
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

/**
 * The sign-in route renders bare; everything else needs a session and gets the
 * shell. A missing token redirects before any page mounts, so no screen ever
 * fetches without an identity attached.
 *
 * `RoleProvider` wraps both branches. The sign-in page reads `language` and
 * writes `role` back after the session is issued, and the provider has to be
 * the *same instance* across that navigation so the chosen role survives the
 * redirect — hence it sits above the bare/shell split rather than inside it.
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

const rootRoute = createRootRoute({
  beforeLoad: ({ location }) => {
    if (location.pathname !== "/signin" && !getToken()) {
      throw redirect({ to: "/signin" });
    }
  },
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const commandCenterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CommandCenterPage,
});

const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cases",
  component: CasesPage,
});

const caseWorkbenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cases/$caseId",
  component: CaseWorkbenchPage,
});

const networkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/network",
  component: NetworkPage,
});

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entities",
  component: EntityListPage,
});

const entityDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entities/$entityId",
  component: EntityPage,
});

const cdrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cdr",
  component: CdrPage,
});

const moneyTrailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/money-trail",
  component: MoneyTrailPage,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: MapPage,
});

const aiInvestigatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ai-investigator",
  component: AiInvestigatorPage,
});

const evidenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/evidence",
  component: EvidencePage,
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/security",
  component: SecurityPage,
});

const faceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/face",
  component: FacePage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  component: SignInPage,
});

const intakeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/intake",
  component: UploadPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

const routeTree = rootRoute.addChildren([
  commandCenterRoute,
  casesRoute,
  caseWorkbenchRoute,
  networkRoute,
  entitiesRoute,
  entityDetailRoute,
  cdrRoute,
  moneyTrailRoute,
  mapRoute,
  aiInvestigatorRoute,
  evidenceRoute,
  securityRoute,
  faceRoute,
  signInRoute,
  intakeRoute,
  analyticsRoute,
]);

const router = createRouter({ routeTree });

// A stored token can stop verifying (signing secret rotated server-side, or
// the 12h TTL ran out). The service layer drops the token; this sends the
// investigator back to sign-in so their next write does not fail again.
setUnauthorizedHandler(() => {
  void router.navigate({ to: "/signin" });
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
