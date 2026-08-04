# Phase 4: Cloudflare delivery

## Requirements

| ID | Requirement | Done Criteria |
|---|---|---|
| REQ-HKCC-011 | Package the static UI for a new Cloudflare Pages project | D1 |
| REQ-HKCC-012 | Proxy live API requests server-side to a Tunnel origin without browser-visible secrets | D2, D3 |
| REQ-HKCC-013 | Keep deployment and Access/DNS changes approval-gated | D4 |

## Done Criteria (deterministic gates)

| # | Criterion | Evidence |
|---|---|---|
| D1 | Wrangler dry-run/config validation targets a new project and correct build directory | command exit 0 |
| D2 | Pages Function proxy allowlists methods/paths, applies timeouts, and strips unsafe headers | function tests |
| D3 | Built JS and source maps contain no service token, vault path, or backend secret | artifact scan |
| D4 | No deploy command runs until user confirms the exact project, hostname, and Access policy preview | deployment ledger/approval record |

## Evidence Required

- D1 → Wrangler configuration validation output
- D2 → Pages Function proxy test output
- D3 → production artifact secret scan output
- D4 → deployment remains absent until an exact preview is approved

## Constraints

- Use a new Pages project and never overwrite an existing project.
- Keep Tunnel and service-token values in server-side secrets only.
- Permit only allowlisted read endpoints and approved WebSocket upgrades.

## API Contract

```text
GET /api/* -> Pages Function -> Access-protected Hermes Tunnel origin
Allowed methods: GET, WebSocket upgrade only where explicitly supported
Denied: mutation methods and non-allowlisted paths
Errors: sanitized 502/504 JSON without origin details
```
