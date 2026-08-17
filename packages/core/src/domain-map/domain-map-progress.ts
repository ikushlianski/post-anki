import type { ModuleProgress, Topic } from "@post-anki/shared";
import { moduleProgress } from "../curriculum/progress";

const MAX_DEPTH = 6;

export interface DomainNodeRef {
  id: string;
  parentId: string | null;
}

export interface DomainNodeCurriculumTopics {
  domainNodeId: string;
  topics: Topic[];
}

// Walks nodeId down through every descendant (via parentId), cycle-safe via
// a visited set and depth-capped at MAX_DEPTH as a defensive bound (v1 never
// creates cycles, but this must not infinite-loop if that invariant is ever
// violated). Collects every topic from every curriculum attached anywhere in
// that subtree, flattens them into one list, and delegates the actual
// averaging to the existing, unmodified moduleProgress() — one unified rule
// for both "leaf with one curriculum" and "grouping node with many
// descendant curricula", per spec.md's decision against two special-cased
// branches.
export function domainNodeProgress(
  nodeId: string,
  nodes: DomainNodeRef[],
  curriculumTopics: DomainNodeCurriculumTopics[],
): ModuleProgress {
  const subtreeIds = new Set<string>();
  let frontier = [nodeId];
  let depth = 0;

  while (frontier.length > 0 && depth <= MAX_DEPTH) {
    const nextFrontier: string[] = [];

    for (const id of frontier) {
      if (subtreeIds.has(id)) {
        continue;
      }

      subtreeIds.add(id);

      const children = nodes.filter((node) => node.parentId === id);

      for (const child of children) {
        if (!subtreeIds.has(child.id)) {
          nextFrontier.push(child.id);
        }
      }
    }

    frontier = nextFrontier;
    depth += 1;
  }

  // decouple-curricula-from-domain-nodes (issue #84), SCENARIO 9 — curricula
  // now map many-to-many onto domain nodes, so a single curriculum confirmed
  // against two nodes that share this ancestor produces two
  // {domainNodeId, topics} entries here, both landing in the subtree walk
  // above with the SAME topic rows. Dedup by topic.id before handing the
  // flattened list to moduleProgress(), or the shared ancestor's
  // topicsIncluded/topicsMastered double-counts that curriculum's topics
  // once per mapped descendant instead of once overall.
  const seenTopicIds = new Set<string>();
  const topics = curriculumTopics
    .filter((entry) => subtreeIds.has(entry.domainNodeId))
    .flatMap((entry) => entry.topics)
    .filter((topic) => {
      if (seenTopicIds.has(topic.id)) {
        return false;
      }

      seenTopicIds.add(topic.id);

      return true;
    });

  return moduleProgress(topics);
}

// domain-node-merge (issue #61) — the cycle guard for the first write path
// in this codebase that re-parents an existing domain_nodes row. Walks
// nodeId's parentId chain UPWARD (mirrors domain-placement.orchestrator.ts's
// pathFor() shape, not domainNodeProgress()'s descendant-BFS shape above),
// checking whether candidateAncestorId appears anywhere in that chain.
//
// Deliberately NOT domainNodeProgress()'s MAX_DEPTH cap: that cap is a
// defensive bound for a rollup, where stopping early just slightly
// under-counts a very deep subtree — low stakes. This is a
// correctness-critical, write-blocking check; stopping before reaching a
// real ancestor would false-negative ("no cycle") and let a malformed merge
// through, corrupting the tree. Termination is instead guaranteed by the
// visited-Set alone (stop when a node id has already been seen, or the
// chain runs out), correct even against a tree that's already unexpectedly
// deep or already cyclic above nodeId.
//
// Permissive on a dangling parentId (a hop that doesn't resolve to any row
// in `nodes`) — returns false rather than throwing. A merge's cycle guard
// should not fail because of unrelated pre-existing data corruption
// elsewhere in the tree; its job is narrowly "does this merge introduce a
// cycle," not "is the whole tree healthy."
export function isAncestor(
  candidateAncestorId: string,
  nodeId: string,
  nodes: DomainNodeRef[],
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  let currentId: string | null = nodeId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);

    const current = byId.get(currentId);

    if (!current) {
      return false;
    }

    if (current.parentId === candidateAncestorId) {
      return true;
    }

    currentId = current.parentId;
  }

  return false;
}
