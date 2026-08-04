import { useId } from "react";

import {
  layoutKnowledgeGraph,
  type KnowledgeEdge,
  type KnowledgeNode,
} from "@/lib/knowledge-graph";
import { cn } from "@/lib/utils";

const WIDTH = 800;
const HEIGHT = 480;
const MAX_RENDERED_NODES = 250;

export interface KnowledgeGraphProps {
  edges: KnowledgeEdge[];
  nodes: KnowledgeNode[];
  onSelect: (node: KnowledgeNode) => void;
  selectedId: string | null;
}

function nodeShape(node: KnowledgeNode) {
  return node.source === "obsidian" ? "◆" : "●";
}

export function KnowledgeGraph({ edges, nodes, onSelect, selectedId }: KnowledgeGraphProps) {
  const titleId = useId();
  const renderedNodes = nodes.slice(0, MAX_RENDERED_NODES);
  const positioned = layoutKnowledgeGraph(renderedNodes, WIDTH, HEIGHT);
  const byId = new Map(positioned.map((node) => [node.id, node]));

  if (!nodes.length) {
    return (
      <div className="grid min-h-64 place-items-center border border-border bg-background/30 p-6 text-center text-sm text-muted-foreground">
        No knowledge matches these filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {nodes.length > renderedNodes.length ? <p role="status" className="text-xs text-muted-foreground">Showing the first {renderedNodes.length} of {nodes.length} matching nodes. Narrow the filters to inspect the remainder.</p> : null}
      <svg aria-label="Knowledge graph" aria-labelledby={titleId} className="h-auto max-h-[60dvh] min-h-64 w-full border border-border bg-background/30 motion-reduce:transition-none" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <title id={titleId}>Knowledge graph</title>
        {edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          return source && target ? <line key={`${edge.source}:${edge.target}:${edge.kind}`} className="stroke-border" x1={source.x} x2={target.x} y1={source.y} y2={target.y} /> : null;
        })}
        {positioned.map((node) => (
          <g key={node.id} onClick={() => onSelect(node)} role="button" tabIndex={0} aria-label={`${node.label}, ${node.source} ${node.type}`} aria-pressed={selectedId === node.id} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(node);
            }
          }} className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-foreground">
            <circle cx={node.x} cy={node.y} r={22} className="fill-transparent" />
            <circle cx={node.x} cy={node.y} r={selectedId === node.id ? 14 : 11} className={cn("stroke-2", node.source === "obsidian" ? "fill-warning/20 stroke-warning" : "fill-success/20 stroke-success")} />
            <text x={node.x} y={node.y + 28} textAnchor="middle" className="fill-foreground text-[11px]">{node.label.slice(0, 24)}</text>
          </g>
        ))}
      </svg>

      <section aria-label="Connected knowledge list">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Connected knowledge list</h3>
        <ul className="grid gap-1 sm:grid-cols-2">
          {renderedNodes.map((node) => (
            <li key={node.id}>
              <button type="button" aria-pressed={selectedId === node.id} onClick={() => onSelect(node)} className="min-h-11 w-full border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                <span aria-hidden>{nodeShape(node)} </span>{node.label}
                <span className="ml-2 text-xs text-muted-foreground">{node.source} · {node.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
