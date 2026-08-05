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

export type SemanticNodeGroup =
  | "research"
  | "harvest"
  | "operations"
  | "mail"
  | "media"
  | "note"
  | "other";

export interface InteractiveKnowledgeNode extends KnowledgeNode {
  group: SemanticNodeGroup;
}

export interface InteractiveKnowledgeLink extends KnowledgeEdge {
  source: string;
  target: string;
}

const MAX_INTERACTIVE_NODES = 400;

export function semanticNodeGroup(node: KnowledgeNode): SemanticNodeGroup {
  const tags = new Set(node.tags.map((tag) => tag.toLocaleLowerCase()));
  const type = node.type.toLocaleLowerCase();
  if (type === "mail-note" || tags.has("mail")) return "mail";
  if (["incident", "retro", "devlog"].includes(type) || tags.has("autofix")) return "operations";
  if (["youtube", "web"].includes(type)) return "media";
  if (["research-brief", "publication"].includes(type) || tags.has("research")) return "research";
  if (type === "harvest") return "harvest";
  if (["note", "reference"].includes(type)) return "note";
  return "other";
}

export function buildInteractiveGraph(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const boundedNodes = nodes.slice(0, MAX_INTERACTIVE_NODES);
  const ids = new Set(boundedNodes.map((node) => node.id));
  return {
    nodes: boundedNodes.map((node) => ({ ...node, group: semanticNodeGroup(node) })),
    links: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    truncated: Math.max(0, nodes.length - boundedNodes.length),
  };
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
  const centerX = GRAPH_MARGIN_PX + usableWidth / 2;
  const centerY = GRAPH_MARGIN_PX + usableHeight / 2;
  const maxRadius = Math.max(1, Math.min(usableWidth, usableHeight) / 2);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((node, index) => ({
    ...node,
    x: centerX + Math.cos(index * goldenAngle) * maxRadius * Math.sqrt(index / Math.max(nodes.length, 1)),
    y: centerY + Math.sin(index * goldenAngle) * maxRadius * Math.sqrt(index / Math.max(nodes.length, 1)),
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
