export type DomainNodeSourceKind = "static_taxonomy" | "dynamic" | "empty";

export interface DomainNodeSourceRef {
  source: "static_taxonomy" | "ai_generated";
}

// Decides which of the two placement paths a subject uses (architecture.md
// "Proposed" step 3): "static_taxonomy" routes new curricula through the
// on-demand AI-mapping trigger (this ticket); "empty"/"dynamic" both fall
// through to today's unmodified resolveDomainPlacement flow — the
// distinction between them matters only for gating (an empty tree skips
// placement entirely, same as today), not for which mechanism runs.
export function resolveDomainNodeSource(
  nodes: DomainNodeSourceRef[],
): DomainNodeSourceKind {
  if (nodes.length === 0) {
    return "empty";
  }

  return nodes.some((node) => node.source === "static_taxonomy")
    ? "static_taxonomy"
    : "dynamic";
}
