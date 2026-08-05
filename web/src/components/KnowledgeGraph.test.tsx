import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-force-graph-2d", () => ({
  default: () => <canvas aria-label="Interactive knowledge graph canvas" />,
}));

import { KnowledgeGraph } from "./KnowledgeGraph";
import type { KnowledgeEdge, KnowledgeNode } from "@/lib/knowledge-graph";

const nodes: KnowledgeNode[] = [
  { id: "h:memory", label: "Agent memory", source: "hermes", type: "memory", tags: [] },
  { id: "o:ops", label: "Operations", source: "obsidian", type: "note", tags: ["ops"] },
];
const edges: KnowledgeEdge[] = [
  { source: "h:memory", target: "o:ops", kind: "related" },
];

describe("KnowledgeGraph", () => {
  it("renders interactive controls, a semantic legend, and list alternative", () => {
    const markup = renderToStaticMarkup(
      <KnowledgeGraph edges={edges} nodes={nodes} onSelect={vi.fn()} selectedId="o:ops" />,
    );

    expect(markup).toContain('aria-label="Fit graph to view"');
    expect(markup).toContain('aria-label="Reset graph view"');
    expect(markup).toContain("Node type legend");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Connected knowledge list");
    expect(markup).toContain("Operations");
  });

  it("renders a stable empty state", () => {
    const markup = renderToStaticMarkup(
      <KnowledgeGraph edges={[]} nodes={[]} onSelect={vi.fn()} selectedId={null} />,
    );
    expect(markup).toContain("No knowledge matches these filters");
  });
});
