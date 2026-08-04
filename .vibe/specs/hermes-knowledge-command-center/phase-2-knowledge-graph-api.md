# Phase 2: Knowledge graph API

## Requirements

| ID | Requirement | Done Criteria |
|---|---|---|
| REQ-HKCC-005 | Read Hermes learning graph and Obsidian wikilinks through one authenticated API | D1, D2 |
| REQ-HKCC-006 | Apply metadata allowlisting and filesystem containment | D3 |
| REQ-HKCC-007 | Report unresolved links and parser limits without failing the whole graph | D4 |

## Done Criteria (deterministic gates)

| # | Criterion | Evidence |
|---|---|---|
| D1 | Authenticated endpoint returns versioned nodes, edges, source counts, and diagnostics | backend contract test |
| D2 | Nodes retain source value `hermes` or `obsidian` and normalized stable IDs | parser/merge tests |
| D3 | Symlinks, traversal, hidden folders, backups, bodies, `resource`, and oversized files are excluded | temp-vault security tests |
| D4 | Broken wikilinks increment diagnostics while valid graph data remains available | parser behavior test |

## Evidence Required

- D1 → authenticated endpoint contract test output
- D2 → graph merge and stable-ID test output
- D3 → temp-vault containment and exclusion test output
- D4 → unresolved-link diagnostic test output

## Constraints

- The endpoint is authenticated and read-only.
- Never expose note bodies, resource URLs, hidden state, backups, or filesystem paths.
- Resolve all vault paths beneath the configured root and reject symlinks.

## API Contract

```text
GET /api/knowledge/graph
Response 200: {
  version: 1,
  generatedAt: ISO-8601,
  nodes: [{id,label,source,type,tags,timestamp,description?}],
  edges: [{source,target,kind}],
  counts: {hermes,obsidian,edges},
  diagnostics: [{code,severity,count,message}]
}
```

No note-body endpoint is introduced.
