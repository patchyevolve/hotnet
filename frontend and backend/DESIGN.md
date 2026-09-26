# Design Brief

## Direction

**Situation Room** — a dark navy/ink intelligence workstation for Indian law-enforcement analysts: dense, instrumented, calm under pressure.

## Tone

Institutional and precise — a command console, not a consumer dashboard. Restraint is the aesthetic: hairline borders, monospace data, tabular figures, and severity color used only where it carries meaning.

## Differentiation

Every surface reads like an instrument panel: a faint 32px command grid, hairline dividers instead of shadows, and Okabe-Ito severity color that stays legible for colorblind analysts.

## Color Palette

| Token            | OKLCH               | Hex       | Role                                    |
| ---------------- | ------------------- | --------- | --------------------------------------- |
| background       | `0.16 0.02 250`     | `#141C26` | Deep ink app canvas                     |
| card             | `0.205 0.022 250`   | `#1D2733` | Elevated panel / card surface           |
| popover          | `0.235 0.024 250`   | `#232E3C` | Raised overlays, menus, tooltips        |
| sidebar          | `0.135 0.02 250`    | `#0F161F` | Nav rail, one step darker than canvas   |
| foreground       | `0.95 0.008 250`    | `#E9EDF2` | Primary text (AA+ on all surfaces)      |
| muted-foreground | `0.66 0.014 250`    | `#8C99A8` | Secondary text, labels, metadata        |
| border           | `0.29 0.016 250`    | `#313C4A` | 1px hairlines, dividers, panel edges    |
| primary          | `0.58 0.13 250`     | `#2E6EA8` | Primary actions, active nav, links      |
| accent           | `0.30 0.028 250`    | `#2E3A49` | Hover fill, selected row background     |
| risk-critical    | `0.60 0.181 43`     | `#D55E00` | Vermillion — highest severity           |
| risk-high        | `0.75 0.163 78`     | `#E69F00` | Orange — high severity                  |
| risk-medium      | `0.90 0.16 100`     | `#F0E442` | Yellow — medium severity                |
| risk-low         | `0.62 0.13 165`     | `#009E73` | Bluish green — low severity / cleared   |
| info             | `0.76 0.105 235`    | `#56B4E9` | Sky blue — informational, neutral state |
| accent-blue      | `0.55 0.14 250`     | `#0072B2` | Charts, links, selected graph nodes     |
| neutral-purple   | `0.68 0.13 350`     | `#CC79A7` | Secondary categorical series            |
| chart-1..5       | blue, green, orange, purple, sky | — | Categorical chart series      |

## Typography

- Display: **Space Grotesk** (`--font-display`) — page titles, panel headers, metric figures
- Body: **Figtree** (`--font-body`) — UI labels, table cells, body copy
- Mono: **Geist Mono** (`--font-mono`) — IDs, hashes, FIR numbers, phone numbers, account numbers
- Scale: page title `text-xl font-semibold tracking-tight`, panel header `text-[13px] font-semibold`, metric `.metric-value` (28px tabular), label `.label-caps` (11px uppercase tracked), body `text-sm`, dense table `text-[13px]`

## Elevation & Depth

Depth comes from layered surface lightness (sidebar 0.135 → background 0.16 → card 0.205 → popover 0.235) plus 1px borders — no heavy shadows, no glow; only `shadow-subtle` on floating overlays.

## Structural Zones

| Zone          | Background                    | Border                       | Notes                                                       |
| ------------- | ----------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Top bar       | `bg-card`                     | `border-b border-border`     | Logo, global search, role switcher, profile                 |
| Sidebar       | `bg-sidebar`                  | `border-r border-sidebar-border` | 11 nav items; active = `bg-sidebar-accent` + left accent bar |
| Content area  | `bg-background` + `.bg-grid`  | —                            | Panels on `bg-card`; alternate zones `bg-muted/20`           |
| Status strip  | `bg-sidebar`                  | `border-t border-sidebar-border` | System health + pulse-dot indicator at sidebar foot      |

## Spacing & Rhythm

Dense 4px base unit: panel padding `p-3`/`p-4`, panel gaps `gap-3`, section gaps `gap-6`, table rows `h-9`, micro-spacing `gap-1.5` for label/value stacks; content max-width is full-bleed to maximize analyst information density.

## Component Patterns

- Buttons: 6px radius, `bg-primary` filled for primary / `border-border` ghost for secondary, hover = `bg-accent`, no glow
- Cards: `.panel` — `bg-card`, 1px `border-border`, 6px radius, no shadow; header via `.panel-header`
- Badges: pill `rounded-full`, tinted `bg-risk-*/15` with `text-risk-*` text; severity always paired with a label, never color alone

## Motion

- Entrance: `.animate-fade-in-up` — 280ms, 4px rise, staggered 40ms across metric cards
- Hover: `.transition-smooth` — 200ms `cubic-bezier(0.4,0,0.2,1)` on background/border/color only
- Decorative: `pulse-dot` for live status, `dash-flow` for animated network-graph edges; all disabled under `prefers-reduced-motion`

## Constraints

- No neon, no glow, no sci-fi chrome; severity color is semantic, never decorative
- No full-page gradients — depth from layered surfaces and hairlines only
- Minimum AA contrast for all text; severity never communicated by color alone
- Monospace + tabular numerals for every identifier and metric figure
- 6px radius ceiling on panels; pills only for status badges

## Signature Detail

The **instrumented hairline grid**: a 32px faint command grid behind the canvas, with panels floating as crisp bordered tiles — a deliberate departure from shadow-heavy dark dashboards.
