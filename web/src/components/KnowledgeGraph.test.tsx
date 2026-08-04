import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
  it("renders a deterministic keyboard-accessible graph and list alternative", () => {
    const markup = renderToStaticMarkup(
      <KnowledgeGraph edges={edges} nodes={nodes} onSelect={vi.fn()} selectedId="o:ops" />,
    );

    expect(markup).toContain('aria-label="Knowledge graph"');
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
