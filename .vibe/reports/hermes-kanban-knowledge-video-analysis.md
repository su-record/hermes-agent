# Hermes Kanban and Knowledge Command Center Analysis

- Date: 2026-08-05
- Mode: Feature/module analysis (L4)
- Targets: Hermes dashboard, Sutory Kanban integration, Obsidian vault, Cloudflare Pages, two supplied YouTube videos
- Quality score: 100/100 (files, APIs, data models, auth, flow, risks, and next actions covered)

## Executive finding

Hermes already has the correct foundations: a React dashboard, authenticated FastAPI APIs, a native learning graph, a Kanban dashboard plugin, WebSocket deltas, and profile isolation. Sutory also uses the Hermes Kanban CLI rather than duplicating its database. The right implementation is therefore a read-only command-center view that composes existing APIs and adds a constrained Obsidian adapter. It must not read `kanban.db` directly or publish the vault as static files.

The Kanban integration is structurally correct but the live board is not fully healthy. Task `t_0dc6742e` has `workspace_kind=worktree` without a workspace path or board default workdir, failed spawn twice, and is circuit-breaker blocked. Two blocked tasks have been idle for roughly 373 and 138 hours; the oldest ready approval has waited about 14.7 days. Of 132 done tasks, 102 have an empty result, so completion evidence needs a separate dashboard signal rather than treating `done` as sufficient proof.

## Video analysis

### Video 1 — Hermes Agent update

Gemini multimodal analysis identified these demonstrated themes:

- Hermes is operated continuously on a VPS and is presented as a growing personal system rather than a one-off chatbot.
- Model routing is task-sensitive: expensive models for consequential decisions, lower-cost models for repetitive agent work.
- MoA sends one question to several reference models in parallel and uses a synthesizer model. It is recommended for costly or ambiguous decisions, not deterministic tasks.
- `/learn` turns useful external material into reusable skills instead of passive bookmarks.
- `/journey` visualizes accumulated memories and skills over time as a graph. This directly supports reusing Hermes's existing learning graph rather than creating an unrelated graph system.
- The UI demonstrates visible subagent work and configurable presentation. A command center should expose provenance and current work without reproducing the chat surface.

Application:

- MUST distinguish Hermes learning nodes from Obsidian note nodes while allowing cross-source filtering.
- MUST show provenance, timestamps, and evidence status.
- SHOULD expose model/provider and agent/profile status without changing models from this page.
- SHOULD make learning growth visible through time and source filters.
- COULD add MoA-backed analysis later, but not in the initial read-only dashboard because it adds cost and mutation semantics.

### Video 2 — Hermes Kanban team workflow

The video exceeded Gemini's 1,048,576-token single-request limit, so it was analyzed in native 30-minute video segments. The demonstrated system uses a board with Todo, Scheduled, Ready, In Progress, Blocked, Review, and Done columns; parent/child tasks are coordinated by a dispatcher; and recurring collection/production work is registered by cron rather than manually recreated. The final section explicitly argues that manually entering repeated tasks defeats the purpose of the system.

Application:

- MUST use Hermes's canonical Kanban plugin API and event stream.
- MUST visualize parent/child progress, dispatcher diagnostics, workspace validity, blocked reason, age, and completion evidence.
- MUST distinguish intentional human approval cards (`ready`, no assignee) from dispatcher failures.
- SHOULD show scheduled/cron provenance so recurring jobs are not mistaken for manually stalled cards.
- SHOULD provide SLA warnings for old ready/blocked work.
- MUST keep the first release read-only; board mutations need a separate approval-aware feature.

Limitations: the videos do not establish Cloudflare security architecture or Obsidian publication rules. Those decisions come from the inspected server and code, not from the videos.

## Current architecture and evidence

### Dashboard and APIs

- `web/` uses Vite, React 19, TypeScript, React Router, Tailwind, and existing graph libraries.
- `hermes_cli/web_server.py` serves the SPA and authenticated API surface.
- Existing Hermes learning graph: `GET /api/learning/graph` in `hermes_cli/web_server.py:3484` and `agent/learning_graph.py`.
- Existing Kanban board API: `plugins/kanban/dashboard/plugin_api.py:378-508`.
- Kanban task detail: `plugins/kanban/dashboard/plugin_api.py:517-587`.
- Kanban WebSocket authentication and event flow: `plugins/kanban/dashboard/plugin_api.py:14-94`.
- Web REST calls attach the selected management profile through `web/src/lib/api.ts`.

### Kanban correctness

- Sutory's wrapper delegates to `hermes --profile <spine> kanban`: `/home/ubuntu/repos/sutory/core/kanban.py:1-5,46-63`.
- The spine profile is configured in `/home/ubuntu/repos/sutory/config/profiles.yaml:7-12`.
- Canonical states and workspace kinds are defined in `hermes_cli/kanban_db.py:102-135`.
- Dependency promotion and sticky blocking are implemented in `hermes_cli/kanban_db.py:3691-3810,5496-5557`.
- Sutory approvals intentionally use ready/unassigned human approval cards: `/home/ubuntu/repos/sutory/workflows/approval.py:245-298`.
- `workflows/sprint.py:23-40` currently converts Kanban read errors into an empty board, which hides operational failure.
- `workflows/approval.py:272-275` skips individual task read failures, which can silently omit an approval card.

### Obsidian data

- Vault: `/home/ubuntu/sutory/wiki` with 394 Markdown files, 392 frontmatter documents, and 393 files containing wikilinks.
- Common allowlisted fields: `type`, `title`, `description`, `tags`, `timestamp`.
- Links use `[[wikilink]]`; unresolved links are permitted by the vault and must be represented as diagnostics rather than unsafe paths.
- `.obsidian`, `.git`, `.backup-pre-okf`, `raw`, `log.md`, note bodies, and `resource` URLs must never be shipped as Pages assets.

### Cloudflare

- Wrangler deployment history indicates working authentication.
- Existing Pages projects include `nan2026` and `sutory`; neither should be overwritten.
- Static Pages cannot access a loopback FastAPI server. A live command center requires a new Pages project plus a same-origin Pages Function proxy to a Cloudflare Tunnel-protected Hermes API, or serving the existing dashboard directly through Tunnel. Browser-held backend service tokens are forbidden.

## Recommended implementation

1. Repair the live Kanban workspace mapping and surface error/SLA/evidence diagnostics.
2. Add a read-only Obsidian graph adapter with explicit path containment, symlink rejection, file/count/size limits, and metadata allowlisting.
3. Add a thin `/knowledge` command-center route that composes system health, Kanban, Hermes learning graph, and Obsidian graph without recreating chat.
4. Deliver privately through a new Cloudflare project and Access policy; proxy API requests server-side, keep service credentials out of the bundle, and deploy only after explicit approval.

## Rejected approaches

- Direct browser access to `kanban.db`: bypasses plugin authorization, profile/board routing, diagnostics, and event semantics.
- Copying the Obsidian vault into static assets: leaks note bodies, backups, resource URLs, and future private notes.
- A second chat UI in React: violates the existing PTY/TUI ownership boundary in `AGENTS.md`.
- Reusing `sutory.pages.dev`: risks overwriting an unrelated production project.
