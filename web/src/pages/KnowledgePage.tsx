import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Database, RefreshCw } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";

import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { usePageHeader } from "@/contexts/usePageHeader";
import { api, type KanbanBoardResponse, type StatusResponse } from "@/lib/api";
import {
  diagnoseKanbanTask,
  filterKnowledgeGraph,
  type KanbanDiagnostic,
  type KnowledgeGraphFilters,
  type KnowledgeGraphResponse,
  type KnowledgeNode,
  type KnowledgeSource,
} from "@/lib/knowledge-graph";

interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const emptyResource = <T,>(): Resource<T> => ({ data: null, error: null, loading: true });

function useCommandCenterData() {
  const [status, setStatus] = useState<Resource<StatusResponse>>(emptyResource);
  const [board, setBoard] = useState<Resource<KanbanBoardResponse>>(emptyResource);
  const [graph, setGraph] = useState<Resource<KnowledgeGraphResponse>>(emptyResource);
  const [revision, setRevision] = useState(0);
  const [boardRevision, setBoardRevision] = useState(0);
  const refreshBoard = useCallback(() => setBoardRevision((value) => value + 1), []);
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
    refreshBoard();
  }, [refreshBoard]);

  useEffect(() => {
    let active = true;
    const load = <T,>(promise: Promise<T>, setter: (value: Resource<T>) => void) => {
      setter(emptyResource());
      promise.then((data) => active && setter({ data, error: null, loading: false }))
        .catch((error: unknown) => active && setter({ data: null, error: error instanceof Error ? error.message : "Request failed", loading: false }));
    };
    load(api.getStatus(), setStatus);
    load(api.getKnowledgeGraph(), setGraph);
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    let active = true;
    setBoard(emptyResource());
    api.getKanbanBoard()
      .then((data) => active && setBoard({ data, error: null, loading: false }))
      .catch((error: unknown) => active && setBoard({ data: null, error: error instanceof Error ? error.message : "Request failed", loading: false }));
    return () => { active = false; };
  }, [boardRevision]);

  return { status, board, graph, refresh, refreshBoard };
}

function useKanbanEvents(latestEventId: number | undefined, refresh: () => void) {
  useEffect(() => {
    if (latestEventId === undefined) return undefined;
    let socket: WebSocket | null = null;
    let active = true;
    const poll = window.setInterval(refresh, 30_000);
    if (import.meta.env.VITE_KNOWLEDGE_ONLY === "1") {
      return () => window.clearInterval(poll);
    }
    api.buildWsUrl("/api/plugins/kanban/events", { since: String(latestEventId) })
      .then((url) => {
        if (!active) return;
        socket = new WebSocket(url);
        socket.addEventListener("message", refresh);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      window.clearInterval(poll);
      socket?.close();
    };
  }, [latestEventId, refresh]);
}

function SummaryCard({ children, error, label, loading, value }: { children?: React.ReactNode; error: string | null; label: string; loading: boolean; value: React.ReactNode }) {
  return (
    <section className="min-w-64 flex-1 rounded-lg border border-border bg-card p-4" aria-label={label}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? <Spinner className="mt-3" /> : error ? <p role="alert" className="mt-2 text-sm text-destructive">Unavailable: {error}</p> : <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>}
      {children}
    </section>
  );
}

function GraphFilters({ filters, graph, onChange }: { filters: KnowledgeGraphFilters; graph: KnowledgeGraphResponse; onChange: (filters: KnowledgeGraphFilters) => void }) {
  const types = [...new Set(graph.nodes.map((node) => node.type))].sort();
  const tags = [...new Set(graph.nodes.flatMap((node) => node.tags))].sort();
  const toggleSource = (source: KnowledgeSource) => {
    const sources = new Set(filters.sources);
    if (sources.has(source)) sources.delete(source);
    else sources.add(source);
    onChange({ ...filters, sources });
  };
  const setSingle = (key: "types" | "tags", value: string) => onChange({ ...filters, [key]: new Set(value ? [value] : []) });

  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">Graph filters</summary>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">Search title, description, or tag<input value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} type="search" className="min-h-11 border border-border bg-background px-3 text-sm text-foreground" /></label>
        <fieldset className="flex gap-4"><legend className="mb-1 text-xs text-muted-foreground">Sources</legend>{(["hermes", "obsidian"] as const).map((source) => <label key={source} className="flex min-h-11 items-center gap-2 text-sm"><input checked={filters.sources.has(source)} onChange={() => toggleSource(source)} type="checkbox" />{source}</label>)}</fieldset>
        <label className="grid gap-1 text-xs text-muted-foreground">Type<select value={[...filters.types][0] ?? ""} onChange={(event) => setSingle("types", event.target.value)} className="min-h-11 border border-border bg-background px-2 text-sm text-foreground"><option value="">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Tag<select value={[...filters.tags][0] ?? ""} onChange={(event) => setSingle("tags", event.target.value)} className="min-h-11 border border-border bg-background px-2 text-sm text-foreground"><option value="">All tags</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
      </div>
    </details>
  );
}

function NodeDetails({ graph, node }: { graph: KnowledgeGraphResponse; node: KnowledgeNode | null }) {
  if (!node) return <aside className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Select a node to inspect provenance and connections.</aside>;
  const neighborIds = new Set(graph.edges.flatMap((edge) => edge.source === node.id ? [edge.target] : edge.target === node.id ? [edge.source] : []));
  const neighbors = graph.nodes.filter((candidate) => neighborIds.has(candidate.id));
  return (
    <aside aria-label="Selected knowledge details" aria-live="polite" className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{node.source} provenance · {node.type}</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{node.label}</h2>
      {node.description && <p className="mt-2 text-sm text-muted-foreground">{node.description}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Tags: {node.tags.join(", ") || "none"}</p>
      <h3 className="mt-4 text-sm font-medium">Connected nodes</h3>
      <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">{neighbors.length ? neighbors.map((neighbor) => <li key={neighbor.id}>{neighbor.label}</li>) : <li>None</li>}</ul>
    </aside>
  );
}

function KanbanDiagnostics({ board }: { board: Resource<KanbanBoardResponse> }) {
  if (board.loading) return <Spinner />;
  if (board.error) return <p role="alert" className="text-sm text-destructive">Kanban unavailable: {board.error}</p>;
  const tasks = board.data?.columns.flatMap((column) => column.tasks) ?? [];
  const diagnostics: KanbanDiagnostic[] = tasks.flatMap((task) =>
    diagnoseKanbanTask(task),
  );
  return diagnostics.length ? <ul className="grid gap-2">{diagnostics.map((item, index) => <li key={`${item.taskId}:${item.code}:${index}`} className="flex gap-2 border border-border bg-background/30 p-3 text-sm"><AlertTriangle aria-hidden className={item.severity === "critical" || item.severity === "error" ? "mt-0.5 h-4 w-4 shrink-0 text-destructive" : "mt-0.5 h-4 w-4 shrink-0 text-warning"} /><span><strong>{item.severity.toUpperCase()} · {item.taskId}</strong> · {item.message}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No operational diagnostics detected.</p>;
}

export default function KnowledgePage() {
  const { setTitle } = usePageHeader();
  const { board, graph, refresh, refreshBoard, status } = useCommandCenterData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<KnowledgeGraphFilters>({ query: "", sources: new Set(), types: new Set(), tags: new Set() });
  useLayoutEffect(() => { setTitle("Hermes + Obsidian"); return () => setTitle(null); }, [setTitle]);
  useKanbanEvents(board.data?.latest_event_id, refreshBoard);
  const visible = useMemo(() => graph.data ? filterKnowledgeGraph(graph.data, filters) : { nodes: [], edges: [] }, [filters, graph.data]);
  const selected = visible.nodes.find((node) => node.id === selectedId) ?? null;
  const tasks = board.data?.columns.flatMap((column) => column.tasks) ?? [];

  return (
    <div className="grid gap-6 p-4 sm:p-6" aria-label="Knowledge command center">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Hermes + Obsidian</h1><p className="text-sm text-muted-foreground">Hermes operations and the connected Obsidian vault graph in one view.</p></div><Button ghost onClick={refresh} aria-label="Refresh command center"><RefreshCw className="h-4 w-4" /></Button></div>
      <div className="flex gap-4 overflow-x-auto pb-1"><SummaryCard label="Gateway health" loading={status.loading} error={status.error} value={status.data?.gateway_running ? "Running" : "Stopped"}><Bot className="mt-2 h-4 w-4 text-muted-foreground" /></SummaryCard><SummaryCard label="Kanban tasks" loading={board.loading} error={board.error} value={tasks.length} /><SummaryCard label="Knowledge nodes" loading={graph.loading} error={graph.error} value={graph.data?.nodes.length ?? 0}><Database className="mt-2 h-4 w-4 text-muted-foreground" /></SummaryCard></div>
      <section className="grid gap-4 lg:grid-cols-12" aria-label="Knowledge explorer">
        <div className="lg:col-span-8 rounded-lg border border-border bg-card p-4">{graph.loading ? <div className="grid min-h-64 place-items-center" aria-busy="true"><Spinner /></div> : graph.error ? <p role="alert" className="min-h-64 p-4 text-destructive">Knowledge graph unavailable: {graph.error}</p> : graph.data ? <KnowledgeGraph nodes={visible.nodes} edges={visible.edges} selectedId={selectedId} onSelect={(node) => setSelectedId(node.id)} /> : null}</div>
        <div className="grid content-start gap-4 lg:col-span-4">{graph.data && <GraphFilters graph={graph.data} filters={filters} onChange={setFilters} />}{graph.data && <NodeDetails graph={graph.data} node={selected} />}</div>
      </section>
      {graph.data?.diagnostics.length ? <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="graph-diagnostics-title"><h2 id="graph-diagnostics-title" className="mb-3 text-lg font-semibold">Graph diagnostics</h2><ul className="grid gap-2 text-sm text-muted-foreground">{graph.data.diagnostics.map((item) => <li key={item.code}><strong>{item.severity.toUpperCase()} · {item.count}</strong> · {item.message}</li>)}</ul></section> : null}
      <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="kanban-diagnostics-title"><h2 id="kanban-diagnostics-title" className="mb-3 text-lg font-semibold">Kanban diagnostics</h2><KanbanDiagnostics board={board} /></section>
    </div>
  );
}
