# Project Guidance

## User Preferences

- Dark-first navy/ink theme using OKLCH tokens with Okabe-Ito colorblind-safe semantic colors for risk and severity
- Professional law-enforcement intelligence-workstation aesthetic: high information density, subtle borders, clean typography, restrained gradients, subtle animations, strong visual hierarchy, accessible contrast
- Avoid excessive neon, glowing effects and sci-fi styling
- Reuse existing shadcn/ui components, utilities and design tokens; avoid unnecessary dependencies
- Frontend prototype with a centralized typed mock-data layer and a service abstraction so real APIs can be swapped in later
- Consistent fictional demo data across every screen
- Optimize for a smooth 2-3 minute demo flow

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The project is a Vite 5 + React 19 SPA with Tailwind CSS v3.4 (tailwind.config.js, not v4 CSS-first @theme) and 46 pre-installed shadcn/ui components; there is no Next.js.
- TanStack Router works with createRootRoute/createRoute/createRouter + RouterProvider; declare the Register interface in App.tsx for typed Link/navigate.
- The i18n UiStrings interface is the single source of truth for label keys: adding a key requires edits in three places (interface, en, hi) or tsc reports TS2339 at every call site. Module-level label maps bypass getStrings and stay English — resolve them at render time.
- biome noShadowRestrictedNames rejects importing lucide's Map icon; alias it to MapIcon. biome useKeyWithClickEvents needs onKeyDown plus role=presentation on backdrop click handlers.
- Mounting one component on both a list route and a detail route while hardcoding useParams({ from: detailRoute }) breaks the list route at runtime; use useParams({ strict: false }) or separate components.
- Criteria that enumerate exact metric values, tab sets, sections and flows require those literal values in source; computed or derived substitutes do not satisfy them.
- Vitest 3 + @testing-library/react 16 + jsdom is the test setup; the root test script is pnpm --dir src/frontend test. Tests must await loaded content rather than asserting against loading skeletons.
