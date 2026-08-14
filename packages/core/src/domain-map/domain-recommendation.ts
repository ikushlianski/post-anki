import type { DomainNodeTreeItem } from "@post-anki/shared";
import { domainMasteryStatus } from "./domain-mastery-status";

// deepen-widen-recommendations (issue #90) — the structural recommender's
// pure candidate computation, no LLM call (spec.md's Decision 1: the
// issue's own body already specifies the rule structurally). Consumes
// exactly the shape `getDomainMapForSubject()` already returns —
// `percent`/`curricula`/`kind` precomputed on every node — so this module
// has no I/O of its own.

export const WELL_MASTERED_THRESHOLD = 80;
export const MAX_RECOMMENDATIONS_PER_AXIS = 5;

export type DomainRecommendationAxis = "deepen" | "widen";

export interface DomainRecommendationCandidate {
  domainNodeId: string;
  sourceNodeId: string;
  axis: DomainRecommendationAxis;
  reason: string;
}

function flattenTree(nodes: DomainNodeTreeItem[]): DomainNodeTreeItem[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

// Every placeholder is a real name/percent pulled from the tree, never a
// free-text model output — this is what makes Done-when's "grounded in real
// taxonomy structure (not free-associated)" a provable property of this
// function, not a hope about model behavior.
export function buildDeepenReason(parent: DomainNodeTreeItem, child: DomainNodeTreeItem): string {
  return `You've mastered "${parent.name}" (${parent.percent}%) — "${child.name}" is the next step within it.`;
}

export function buildWidenReason(
  activeRoot: DomainNodeTreeItem,
  candidateRoot: DomainNodeTreeItem,
): string {
  return `"${activeRoot.name}" is actively being studied while "${candidateRoot.name}", a sibling knowledge domain, hasn't been started yet.`;
}

// A taxonomy child of a node the learner has already mastered. Walks EVERY
// node in the tree as a potential parent (not just roots) — for each parent
// at or above WELL_MASTERED_THRESHOLD, each direct child that is both a
// full gap (percent === 0, via domainMasteryStatus) and has no curriculum
// mapped anywhere is a candidate. Nodes with kind === "area" are excluded on
// either side of the pair (spec.md's Decision 8) — Areas are a fixed,
// purpose-built structure layered on top of the taxonomy, not part of the
// hierarchy this rule reasons over.
export function computeDeepenCandidates(
  tree: DomainNodeTreeItem[],
): DomainRecommendationCandidate[] {
  const pairs: { parent: DomainNodeTreeItem; child: DomainNodeTreeItem }[] = [];

  for (const parent of flattenTree(tree)) {
    if (parent.kind === "area" || parent.percent < WELL_MASTERED_THRESHOLD) {
      continue;
    }

    for (const child of parent.children) {
      if (child.kind === "area") {
        continue;
      }

      if (domainMasteryStatus(child.percent) !== "gap" || child.curricula.length > 0) {
        continue;
      }

      pairs.push({ parent, child });
    }
  }

  return pairs
    .slice()
    .sort((a, b) => b.parent.percent - a.parent.percent)
    .slice(0, MAX_RECOMMENDATIONS_PER_AXIS)
    .map(({ parent, child }) => ({
      domainNodeId: child.id,
      sourceNodeId: parent.id,
      axis: "deepen" as const,
      reason: buildDeepenReason(parent, child),
    }));
}

// A top-level sibling domain with zero coverage while another root is
// actively being studied. Scoped to root-level nodes only (parentId ===
// null, the literal 15 "domains" — spec.md's Decision 9), which keeps
// deepen (descend within a branch) and widen (branch into an unrelated
// top-level area) non-overlapping notions of "adjacent". `tree` is already
// the root-level array `getDomainMapForSubject()` returns, in stable order.
export function computeWidenCandidates(
  tree: DomainNodeTreeItem[],
): DomainRecommendationCandidate[] {
  const roots = tree.filter((root) => root.kind !== "area");
  const activeRoots = roots.filter((root) => root.curricula.length > 0);

  if (activeRoots.length === 0) {
    return [];
  }

  // The single most-covered active root, first-encountered wins a tie —
  // deterministic against the tree's own stable order.
  const sourceRoot = activeRoots.reduce((best, candidate) =>
    candidate.percent > best.percent ? candidate : best,
  );

  return roots
    .filter((root) => root.curricula.length === 0 && domainMasteryStatus(root.percent) === "gap")
    .slice(0, MAX_RECOMMENDATIONS_PER_AXIS)
    .map((candidateRoot) => ({
      domainNodeId: candidateRoot.id,
      sourceNodeId: sourceRoot.id,
      axis: "widen" as const,
      reason: buildWidenReason(sourceRoot, candidateRoot),
    }));
}
