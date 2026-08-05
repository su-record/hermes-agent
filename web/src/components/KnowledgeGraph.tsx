import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
} from "react-force-graph-2d";
import { Maximize2, RotateCcw } from "lucide-react";

import {
  buildInteractiveGraph,
  type InteractiveKnowledgeNode,
  type KnowledgeEdge,
  type KnowledgeNode,
  type SemanticNodeGroup,
} from "@/lib/knowledge-graph";

const GRAPH_HEIGHT = 520;
const GROUP_COLORS: Record<SemanticNodeGroup, string> = {
  research: "#22c55e",
  harvest: "#f59e0b",
  operations: "#ef4444",
  mail: "#a855f7",
  media: "#06b6d4",
  note: "#60a5fa",
  other: "#94a3b8",
};

export interface KnowledgeGraphProps {
  edges: KnowledgeEdge[];
  nodes: KnowledgeNode[];
  onSelect: (node: KnowledgeNode) => void;
  selectedId: string | null;
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setWidth(Math.max(280, Math.floor(element.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function GraphLegend({ groups }: { groups: SemanticNodeGroup[] }) {
  return (
    <div aria-label="Node type legend" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Node type legend</span>
      {groups.map((group) => (
        <span className="flex items-center gap-1.5" key={group}>
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] }} />
          {group}
        </span>
      ))}
    </div>
  );
}

interface KnowledgeListProps {
  nodes: InteractiveKnowledgeNode[];
  onSelect: (node: KnowledgeNode) => void;
  selectedId: string | null;
}

function KnowledgeList({ nodes, onSelect, selectedId }: KnowledgeListProps) {
  return (
    <section aria-label="Connected knowledge list">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Connected knowledge list</h3>
      <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
        {nodes.map((node) => (
          <li key={node.id}>
            <button type="button" aria-pressed={selectedId === node.id} onClick={() => onSelect(node)} className="min-h-11 w-full border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <span style={{ color: GROUP_COLORS[node.group] }} aria-hidden>● </span>{node.label}
              <span className="ml-2 text-xs text-muted-foreground">{node.type}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KnowledgeGraph({ edges, nodes, onSelect, selectedId }: KnowledgeGraphProps) {
  const graphRef = useRef<ForceGraphMethods<InteractiveKnowledgeNode> | undefined>(undefined);
  const { ref: containerRef, width } = useContainerWidth();
  const reducedMotion = useReducedMotion();
  const graph = useMemo(() => buildInteractiveGraph(nodes, edges), [edges, nodes]);
  const groups = useMemo(() => [...new Set(graph.nodes.map((node) => node.group))], [graph.nodes]);

  if (!nodes.length) return <div className="grid min-h-64 place-items-center border border-border bg-background/30 p-6 text-center text-sm text-muted-foreground">No knowledge matches these filters.</div>;
  const duration = reducedMotion ? 0 : 300;
  const fit = () => graphRef.current?.zoomToFit(duration, 36);
  const reset = () => { graphRef.current?.centerAt(0, 0, duration); graphRef.current?.zoom(1, duration); };

  return (
    <div className="grid gap-4">
      {graph.truncated ? <p role="status" className="text-xs text-muted-foreground">Showing 400 of {nodes.length} nodes. Narrow the filters to inspect the remainder.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><GraphLegend groups={groups} /><div className="flex gap-2"><button type="button" aria-label="Fit graph to view" onClick={fit} className="min-h-11 min-w-11 border border-border p-2 text-muted-foreground hover:text-foreground"><Maximize2 className="h-4 w-4" /></button><button type="button" aria-label="Reset graph view" onClick={reset} className="min-h-11 min-w-11 border border-border p-2 text-muted-foreground hover:text-foreground"><RotateCcw className="h-4 w-4" /></button></div></div>
      <div ref={containerRef} role="application" aria-label="Interactive knowledge graph. Drag the canvas to pan, use the mouse wheel to zoom, and drag nodes to reposition them." className="min-h-80 w-full overflow-hidden border border-border bg-background/30">
        <ForceGraph2D<InteractiveKnowledgeNode>
          ref={graphRef}
          graphData={graph}
          width={width}
          height={GRAPH_HEIGHT}
          nodeId="id"
          nodeLabel={(node) => `${node.label} · ${node.type}${node.tags.length ? ` · ${node.tags.join(", ")}` : ""}`}
          nodeColor={(node) => GROUP_COLORS[node.group]}
          nodeVal={(node) => selectedId === node.id ? 8 : 4}
          linkWidth={0.75}
          enablePanInteraction
          enableZoomInteraction
          enableNodeDrag
          minZoom={0.25}
          maxZoom={8}
          warmupTicks={reducedMotion ? 0 : 40}
          cooldownTicks={reducedMotion ? 0 : 120}
          onNodeClick={(node: NodeObject<InteractiveKnowledgeNode>) => onSelect(node)}
          onEngineStop={() => fit()}
        />
      </div>
      <KnowledgeList nodes={graph.nodes} onSelect={onSelect} selectedId={selectedId} />
    </div>
  );
}
