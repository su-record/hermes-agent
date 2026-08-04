# SPEC: Hermes Knowledge Command Center

- **Created**: 2026-08-05
- **Status**: APPROVED — 2026-08-05
- **Stakes**: production — exposes live agent operations and private knowledge through a public-edge deployment
- **Tech Stack**: Hermes FastAPI + React 19/Vite/TypeScript + Kanban plugin API + Obsidian Markdown + Cloudflare Pages/Functions/Access

## 1. Overview / Goal

Create a private web command center that combines Hermes agent health, the native Kanban board, the Hermes learning journey, and a sanitized Obsidian knowledge graph. Repair confirmed Kanban operational integrity gaps and deliver the UI through a new Cloudflare project without exposing vault content or backend credentials.

### Context Sources

- `.vibe/reports/hermes-kanban-knowledge-video-analysis.md`
- YouTube `rIoJ-iHNIGY` and `qaGbNkFXiP8`, analyzed with Sutory Gemini video ingestion
- `AGENTS.md`, `web/`, `hermes_cli/web_server.py`, `plugins/kanban/dashboard/plugin_api.py`
- `/home/ubuntu/repos/sutory/core/kanban.py`, approval and sprint workflows
- `/home/ubuntu/sutory/wiki` observed vault structure
- Observed Cloudflare Wrangler deployment history and existing Pages project names

### Assumptions

- The site is private and gated by Cloudflare Access.
- First release is read-only; no Kanban mutations or note editing from the browser.
- A new Pages project name, `hermes-knowledge`, is used unless the user requests another name.
- The live API is reached through a Cloudflare Tunnel origin and proxied server-side; its hostname is supplied at deployment time.
- Obsidian graph exposes allowlisted metadata only, not note bodies or resource URLs.

### Constraints

- Preserve profile and board isolation; use Hermes APIs, never direct SQLite access.
- Do not change or recreate the PTY-backed chat experience.
- Do not copy the vault, `.obsidian`, `.git`, backups, raw notes, or secrets into web assets.
- Keep backend tokens and Cloudflare service credentials server-side.
- No external deployment, Access-policy mutation, Kanban state mutation, or DNS/tunnel creation before explicit confirmation.
- Preserve unrelated dirty files already present in the Hermes and Sutory worktrees.

### Rejected Alternatives (Traps)

- Static snapshot-only dashboard — cannot represent live agent/Kanban state and silently becomes stale.
- Direct cross-origin browser calls to the server — exposes backend auth material and complicates CORS/session boundaries.
- Direct SQLite reads — bypass Kanban board isolation and native diagnostics.
- Publishing raw Markdown — exposes private content and expands the attack surface to Markdown rendering.
- Adding a new core model tool — the capability belongs at the dashboard/API edge and would inflate every model request.

## 2. Phase index

| Phase | File | Outcome |
|---|---|---|
| 1 | `phase-1-kanban-integrity.md` | Repair and expose operational Kanban integrity |
| 2 | `phase-2-knowledge-graph-api.md` | Read-only, sanitized Obsidian + Hermes graph API |
| 3 | `phase-3-command-center-ui.md` | Unified dashboard UI with diagnostics and graph exploration |
| 4 | `phase-4-cloudflare-delivery.md` | Private Pages/Functions delivery, deployment approval-gated |

## 3. Global Done Criteria

| # | Criterion | Verified by |
|---|---|---|
| D1 | All phase scenarios pass with no live network dependency in tests | Hermes test runner + Vitest exit 0 |
| D2 | Web typecheck, lint, tests, and production build pass | `npm run check`, `npm run lint`, `npm run build` in `web/` |
| D3 | No vault body, resource URL, backup path, or credential appears in built assets/fixtures | deterministic artifact scan test |
| D4 | Existing Hermes and Sutory tests covering changed paths pass | project-native test commands exit 0 |
| D5 | Changed code has zero P1 findings and the Vibe ledger records `verifyPassed=true` | review + `vibe.verify` evidence |

### Evidence Required

- Test command outputs and build output
- Contract tests for every new API
- Browser screenshots for desktop and mobile layout
- Sanitized graph fixture demonstrating exclusions and unresolved-link diagnostics
- Cloudflare dry-run/config validation; real deployment URL only after approval

### Human Taste (Non-Blocking)

- The page should feel like a calm mission-control surface, not a dense database admin panel.
- Graph motion must remain legible and optional; reduced-motion users get an equivalent static experience.

## 4. Out of Scope

- Browser-based note editing, Kanban mutation, agent chat replacement, MoA invocation, public anonymous access, automatic publication of every Obsidian note, and overwriting existing Cloudflare Pages projects.

## 5. Verification

- Implement and verify phase-by-phase.
- Presence of API contracts requires contract drift verification.
- Final deployment remains a separate external-state confirmation after all local gates pass.
