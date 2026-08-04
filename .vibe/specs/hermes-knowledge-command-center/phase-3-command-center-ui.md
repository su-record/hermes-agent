# Phase 3: Command-center UI

## Requirements

| ID | Requirement | Done Criteria |
|---|---|---|
| REQ-HKCC-008 | Add a thin `/knowledge` route combining agent, Kanban, and graph status | D1 |
| REQ-HKCC-009 | Provide usable graph search, filters, selection, and provenance | D2, D3 |
| REQ-HKCC-010 | Provide accessible responsive states for loading, empty, error, and reduced motion | D4 |

## Done Criteria (deterministic gates)

| # | Criterion | Evidence |
|---|---|---|
| D1 | Route and navigation load without changing `/chat`; health and Kanban summaries remain independently resilient | router/component tests |
| D2 | Search and source/type/tag filters deterministically change visible nodes and edges | pure normalization/filter tests |
| D3 | Selecting a node opens an accessible details panel with provenance and connected nodes | component interaction test |
| D4 | Keyboard navigation, contrast, responsive layout, empty/error states, and reduced-motion behavior pass automated checks and browser QA | Vitest + browser screenshots |

## Evidence Required

- D1 → route and panel isolation test output
- D2 → pure graph filter test output
- D3 → details interaction test output
- D4 → accessibility tests and desktop/mobile browser screenshots

## Constraints

- Preserve the existing application shell and PTY-backed chat.
- Follow `DESIGN.md` semantic tokens and reduced-motion rules.
- A failure in one panel must not disable the remaining panels.

## Scenarios

- Operator opens `/knowledge` and sees gateway health, Kanban diagnostics, and graph counts.
- Operator filters to Obsidian and searches a title; only matching connected subgraph remains.
- One API fails while the other panels remain usable and show a scoped error.
- A reduced-motion user sees a stable graph without continuous animation.
