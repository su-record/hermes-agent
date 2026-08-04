import { describe, expect, it } from "vitest";

import {
  diagnoseKanbanTask,
  filterKnowledgeGraph,
  layoutKnowledgeGraph,
  type KanbanTaskSummary,
  type KnowledgeGraphResponse,
} from "./knowledge-graph";

const graph: KnowledgeGraphResponse = {
  version: 1,
  generatedAt: "2026-08-05T00:00:00Z",
  counts: { hermes: 1, obsidian: 2, edges: 2 },
  diagnostics: [],
  nodes: [
    { id: "h:memory", label: "Agent memory", source: "hermes", type: "memory", tags: [] },
    { id: "o:kanban", label: "Kanban operations", source: "obsidian", type: "concept", tags: ["ops"] },
    { id: "o:private", label: "Private note", source: "obsidian", type: "concept", tags: ["private"] },
  ],
  edges: [
    { source: "h:memory", target: "o:kanban", kind: "related" },
    { source: "o:kanban", target: "o:private", kind: "wikilink" },
  ],
};

describe("filterKnowledgeGraph", () => {
  it("keeps matching nodes and their direct context", () => {
    const result = filterKnowledgeGraph(graph, {
      query: "kanban",
      sources: new Set(["obsidian"]),
      types: new Set(),
      tags: new Set(),
    });

    expect(result.nodes.map((node) => node.id)).toEqual([
      "h:memory",
      "o:kanban",
      "o:private",
    ]);
    expect(result.edges).toHaveLength(2);
  });

  it("returns a stable bounded layout", () => {
    const first = layoutKnowledgeGraph(graph.nodes, 800, 480);
    const second = layoutKnowledgeGraph(graph.nodes, 800, 480);

    expect(first).toEqual(second);
    expect(first.every((node) => node.x >= 24 && node.x <= 776)).toBe(true);
    expect(first.every((node) => node.y >= 24 && node.y <= 456)).toBe(true);
  });
});

describe("diagnoseKanbanTask", () => {
  it("distinguishes human approval from dispatcher failure", () => {
    const approval: KanbanTaskSummary = {
      id: "t_approval",
      title: "Approve magazine",
      status: "ready",
      assignee: null,
      created_by: "sutory-magazine",
      workspace_kind: null,
      workspace_path: null,
      age: { created_age_seconds: 3_600 },
      result: null,
    };

    expect(diagnoseKanbanTask(approval)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "human_approval" })]),
    );
  });

  it("reports missing workspace and missing completion evidence separately", () => {
    const task: KanbanTaskSummary = {
      id: "t_broken",
      title: "Build dashboard",
      status: "done",
      assignee: "vica",
      created_by: "operator",
      workspace_kind: "worktree",
      workspace_path: null,
      age: { created_age_seconds: 345_600 },
      result: null,
    };

    const codes = diagnoseKanbanTask(task).map(
      (diagnostic) => diagnostic.code,
    );
    expect(codes).toContain("workspace_missing");
    expect(codes).toContain("completion_evidence_missing");
  });

  it("preserves native server diagnostics and uses server age", () => {
    const task: KanbanTaskSummary = {
      id: "t_stale",
      title: "Recover worker",
      status: "blocked",
      assignee: "vica",
      created_by: "operator",
      workspace_kind: "scratch",
      workspace_path: null,
      age: { created_age_seconds: 172_800 },
      result: null,
      diagnostics: [
        {
          kind: "repeated_crashes",
          severity: "critical",
          title: "Worker crash loop",
          detail: "The worker crashed repeatedly.",
        },
        {
          kind: "stuck_in_blocked",
          severity: "warning",
          title: "Task is stale",
          detail: "The blocked transition exceeded its review window.",
        },
      ],
    };

    const diagnostics = diagnoseKanbanTask(task);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "repeated_crashes", severity: "critical" }),
      expect.objectContaining({ code: "stuck_in_blocked" }),
    ]));
    expect(diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "workspace_missing" }),
    ]));
  });

  it("accepts the latest run summary as completion evidence", () => {
    const task: KanbanTaskSummary = {
      id: "t_done",
      title: "Finished by worker",
      status: "done",
      assignee: "vica",
      created_by: "operator",
      workspace_kind: "scratch",
      workspace_path: null,
      result: null,
      latest_summary: "Tests passed and artifacts were produced.",
    };

    expect(diagnoseKanbanTask(task)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "completion_evidence_missing" }),
    ]));
  });
});
