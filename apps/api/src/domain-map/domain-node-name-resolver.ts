import { normalizeTagName } from "@post-anki/core";

// Extracted from domain-placement.orchestrator.ts's own resolveParentNodePath
// (spec.md's Decisions #9) — both the placement orchestrator and the
// domain-priority-review orchestrator face the identical problem: an agent
// returns a node path as NAMES, never ids, and the first element is always a
// generic root-label marker of the agent's own choosing (see
// sibling-discovery.agent.ts's contract). Resolve case-insensitively, one
// level at a time, never hallucinating an id for an unmatched segment.
//
// This preserves the exact original algorithm: the FIRST segment is
// attempted as a real match too (against a null parentId) before falling
// back to "treat it as the root marker and skip it" — so a coincidental
// real top-level node sharing the agent's chosen root label still resolves
// correctly, matching domain-placement.orchestrator.ts's pre-extraction
// behavior byte for byte.

export interface NamedNode {
  id: string;
  parentId: string | null;
  name: string;
}

export interface ResolvedNodePath {
  // The deepest node id successfully matched (null if nothing matched at
  // all, including the root-marker-skip case with no further segments).
  nodeId: string | null;
  // True only when EVERY segment resolved to a real node — i.e. the path
  // fully identifies an existing node, not just an ancestor of one.
  // domain-placement.orchestrator.ts ignores this (it only ever wants a
  // parent, matched or not); domain-priority-review.orchestrator.ts uses it
  // to decide whether to drop an unresolvable suggestion.
  fullyResolved: boolean;
}

export function resolveNodePathByName(
  nodes: NamedNode[],
  path: string[] | null,
): ResolvedNodePath {
  if (!path || path.length === 0) {
    return { nodeId: null, fullyResolved: false };
  }

  let currentParentId: string | null = null;
  let sawFirstSegment = false;

  for (const segment of path) {
    const normalizedSegment = normalizeTagName(segment);
    const match = nodes.find(
      (node) =>
        node.parentId === currentParentId && normalizeTagName(node.name) === normalizedSegment,
    );

    if (!match) {
      // The very first segment may be the agent's own generic root label,
      // never a real node — skip it silently rather than treating it as an
      // unresolved segment. Any later unmatched segment stops resolution.
      if (!sawFirstSegment) {
        sawFirstSegment = true;
        continue;
      }

      return { nodeId: currentParentId, fullyResolved: false };
    }

    sawFirstSegment = true;
    currentParentId = match.id;
  }

  return { nodeId: currentParentId, fullyResolved: true };
}
