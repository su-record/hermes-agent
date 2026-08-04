export type KnowledgeSource = "hermes" | "obsidian";

export interface KnowledgeNode {
  id: string;
  label: string;
  source: KnowledgeSource;
  type: string;
  tags: string[];
  timestamp?: string | null;
  description?: string | null;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  kind: string;
}

export interface KnowledgeDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  count: number;
  message: string;
}

export interface KnowledgeGraphResponse {
  version: number;
  generatedAt: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  counts: { hermes: number; obsidian: number; edges: number };
  diagnostics: KnowledgeDiagnostic[];
}

export interface KnowledgeGraphFilters {
  query: string;
  sources: Set<KnowledgeSource>;
  types: Set<string>;
  tags: Set<string>;
}

export interface PositionedKnowledgeNode extends KnowledgeNode {
  x: number;
  y: number;
}

export interface KanbanTaskSummary {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  created_by: string | null;
  workspace_kind: string | null;
  workspace_path: string | null;
  age?: { created_age_seconds?: number | null };
  result: string | null;
  latest_summary?: string | null;
  diagnostics?: NativeKanbanDiagnostic[];
}

interface NativeKanbanDiagnostic {
  kind: string;
  severity: "warning" | "error" | "critical";
  title: string;
  detail: string;
}

export interface KanbanDiagnostic {
  code: string;
  severity: "info" | "warning" | "error" | "critical";
  taskId: string;
  message: string;
}

const GRAPH_MARGIN_PX = 24;
function matchesAll(node: KnowledgeNode, filters: KnowledgeGraphFilters): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  const text = [node.label, node.description ?? "", ...node.tags]
    .join(" ")
    .toLocaleLowerCase();
  if (query && !text.includes(query)) return false;
  if (filters.sources.size && !filters.sources.has(node.source)) return false;
  if (filters.types.size && !filters.types.has(node.type)) return false;
  return !filters.tags.size || node.tags.some((tag) => filters.tags.has(tag));
}

export function filterKnowledgeGraph(
  graph: KnowledgeGraphResponse,
  filters: KnowledgeGraphFilters,
): Pick<KnowledgeGraphResponse, "nodes" | "edges"> {
  const matches = new Set(graph.nodes.filter((node) => matchesAll(node, filters)).map((node) => node.id));
  const visible = new Set(matches);
  for (const edge of graph.edges) {
    if (matches.has(edge.source) || matches.has(edge.target)) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
  }
  return {
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  };
}

export function layoutKnowledgeGraph(
  nodes: KnowledgeNode[],
  width: number,
  height: number,
): PositionedKnowledgeNode[] {
  const usableWidth = Math.max(width - GRAPH_MARGIN_PX * 2, 1);
  const usableHeight = Math.max(height - GRAPH_MARGIN_PX * 2, 1);
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * (usableWidth / usableHeight))));
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  return nodes.map((node, index) => ({
    ...node,
    x: GRAPH_MARGIN_PX + ((index % columns) + 0.5) * (usableWidth / columns),
    y: GRAPH_MARGIN_PX + (Math.floor(index / columns) + 0.5) * (usableHeight / rows),
  }));
}

function nativeDiagnostics(task: KanbanTaskSummary): KanbanDiagnostic[] {
  return (task.diagnostics ?? []).map((diagnostic) => ({
    code: diagnostic.kind,
    severity: diagnostic.severity,
    taskId: task.id,
    message: `${diagnostic.title}: ${diagnostic.detail}`,
  }));
}

export function diagnoseKanbanTask(task: KanbanTaskSummary): KanbanDiagnostic[] {
  const diagnostics = nativeDiagnostics(task);
  if (task.status === "ready" && !task.assignee && task.created_by?.startsWith("sutory")) {
    diagnostics.push({ code: "human_approval", severity: "info", taskId: task.id, message: "Awaiting human approval" });
  }
  if (task.workspace_kind === "worktree" && !task.workspace_path) {
    diagnostics.push({ code: "workspace_missing", severity: "error", taskId: task.id, message: "Workspace path is missing" });
  }
  if (task.status === "done" && !task.result?.trim() && !task.latest_summary?.trim()) {
    diagnostics.push({ code: "completion_evidence_missing", severity: "warning", taskId: task.id, message: "Completed task has no result evidence" });
  }
  return diagnostics;
}
