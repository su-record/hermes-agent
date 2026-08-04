<!-- design-md-version: 1 -->
<!-- generated-by: vibe.design --from=code -->

# DESIGN.md — Hermes Dashboard Visual Quality SSOT

## Visual Theme

Calm mission control: a dark teal operational canvas, warm cream information hierarchy, and restrained emerald status accents. Dense data remains scannable through clear grouping and provenance rather than decorative effects.

## Color Palette

- Foreground Base: `#FFFFFF`
- Midground Base: `#FFE6CB`
- Background Base: `#041C1C`
- Series Output / Active: `#34D399`
- Success: `#4ADE80`
- Warning: `#FFBD38`
- Destructive: `#FB2C36`
- Transparent: `#0000`

Runtime themes may derive surfaces with `color-mix` from the three base tokens. Feature code uses existing semantic Tailwind tokens such as `background`, `card`, `border`, `muted`, `foreground`, `success`, `warning`, and `destructive`; it does not introduce literal feature colors.

## Typography

- Interface: `var(--theme-font-sans)`, default system UI stack
- Display: `var(--theme-font-display)`
- Operational data: `var(--theme-font-mono)`
- Terminal: `JetBrains Mono`, bundled in `web/public/fonts-terminal`
- Base: 15px / 1.55; headings use the existing Nous Typography component hierarchy
- Labels and timestamps use tabular or monospace numerals where alignment matters

## Components

- Reuse `@nous-research/ui` Button, Typography, SelectionSwitcher, Spinner, and dialog primitives.
- Cards use `bg-card`, `border-border`, `rounded-lg`, and the project spacing scale.
- Status chips combine a text label and icon; color is never the sole state signal.
- Diagnostic rows show severity, task ID, cause, age, and a read-only remediation hint.
- Graph nodes use source shape plus semantic color: Hermes and Obsidian remain distinguishable in monochrome.
- Details open in a keyboard-accessible side panel without obscuring the graph context.

## Layout

- Existing application sidebar and page-header shell remain unchanged.
- Content uses a responsive 12-column grid with 16px mobile and 24px desktop gaps.
- Top row: agent/gateway health, Kanban health, knowledge counts.
- Main row: graph occupies 8 columns; filters and selected-node detail occupy 4 columns.
- Kanban diagnostics span the content width below the graph.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.

## Depth

- Default surfaces are flat with borders; nested panels use tonal `color-mix`, not arbitrary shadows.
- Popovers and dialogs use the existing Nous elevation behavior.
- Graph selection may use one subtle ring; continuous glow and bloom are prohibited.
- z-index follows the existing application primitives; feature components must not invent global layers.

## Do's & Don'ts

**DO**

- Preserve the LENS_0 theme and runtime theme overrides.
- Keep each data source and diagnostic provenance visible.
- Provide loading, empty, partial-error, stale, and offline states independently per panel.
- Pair motion with a reduced-motion static layout.
- Keep interactive targets at least 44×44px on touch layouts.

**DON'T**

- Rebuild chat, terminal, navigation, or theme infrastructure.
- Use raw hex colors in feature components.
- Hide backend errors behind empty graphs or boards.
- Animate the graph indefinitely when reduced motion is requested.
- use color alone for severity, source, or selection.

## Responsive

- Breakpoints follow Tailwind defaults: 640, 768, 1024, 1280, and 1536px.
- At widths below 1024px, graph and detail stack vertically.
- At widths below 768px, summary cards become a single horizontal scroll row and the graph uses a bounded 60dvh canvas.
- Filters collapse into a labeled disclosure; selected-node detail remains reachable after the graph.
- Keyboard and screen-reader order follows health → graph controls → graph/list alternative → diagnostics.

## Agent Prompt Guide

Extend the existing Hermes dashboard rather than creating a new visual language. Compose Nous primitives and semantic Tailwind tokens, keep route roots thin, colocate pure graph normalization and diagnostics outside components, and preserve partial functionality when one API fails. Every graph interaction needs a textual/list equivalent and reduced-motion behavior.
