# Phase 1: Kanban integrity

## Requirements

| ID | Requirement | Done Criteria |
|---|---|---|
| REQ-HKCC-001 | Dashboard consumes the native Kanban plugin API and event model | D1 |
| REQ-HKCC-002 | Operational diagnostics distinguish approvals, dispatcher failures, stale work, and missing completion evidence | D2, D3 |
| REQ-HKCC-003 | Confirmed Sutory silent-failure paths become observable | D4 |
| REQ-HKCC-004 | Live task `t_0dc6742e` receives a valid workspace mapping and is safely recoverable | D5 |

## Done Criteria (deterministic gates)

| # | Criterion | Evidence |
|---|---|---|
| D1 | Board/task adapters use plugin endpoints and WebSocket deltas, never SQLite | API client tests and code location |
| D2 | Ready/unassigned cards render as human approvals, not dispatcher failures | fixture-based UI test |
| D3 | Missing workspace, stale blocked/ready age, and empty completion evidence produce distinct diagnostics | pure diagnostic tests |
| D4 | Sutory sprint and approval reads surface structured errors rather than presenting an empty/complete view | Sutory regression tests |
| D5 | After explicit approval, the affected task has a valid workspace and dispatcher diagnostics no longer report missing workspace | CLI readback; no automatic completion |

## Evidence Required

- D1 → API adapter test output and changed code location
- D2 → human-approval fixture test output
- D3 → diagnostic normalization test output
- D4 → Sutory regression test output
- D5 → approval-gated CLI readback showing workspace validity

## Constraints

- Use the Kanban plugin API; never read SQLite from the dashboard.
- Keep the UI read-only and preserve board/profile isolation.
- Do not mutate live task state until the external-change gate.

## Scenarios

- A ready unassigned approval is labeled “Awaiting human approval”.
- A worktree task without a path is labeled “Workspace missing” with task ID and remediation guidance.
- A failed Kanban read produces an error state, never an empty board.
- Workspace remediation preserves task history and does not mark the task done.

## API Contract

Existing contracts are consumed unchanged: `GET /api/plugins/kanban/board`, `GET /api/plugins/kanban/tasks/{id}`, and the plugin event WebSocket. New frontend normalization returns `{tasks, diagnostics, latestEventId}` without dropping server diagnostics.
