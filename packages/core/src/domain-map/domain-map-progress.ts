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

  const topics = curriculumTopics
    .filter((entry) => subtreeIds.has(entry.domainNodeId))
    .flatMap((entry) => entry.topics);

  return moduleProgress(topics);
}
