import { describe, it, expect } from "vitest";
import type { Topic } from "@post-anki/shared";
import { domainNodeProgress } from "./domain-map-progress";

// SCENARIO 2 (.planning/seed-knowledge-map/scenarios.md) — domainNodeProgress()
// is the pure rollup deriver: walk a node's subtree via parentId, collect
// every topic from every curriculum attached anywhere in that subtree, and
// delegate to the existing, unmodified moduleProgress() for the actual
// averaging. RED right now because packages/core/src/domain-map/ doesn't
// exist yet — the import above fails to resolve.

function topic(overrides: Partial<Topic> & { id: string; maturity: number }): Topic {
  const { maturity, ...rest } = overrides;

  return {
    moduleId: "mod-1",
    title: "T",
    order: 1,
    priority: 0,
    included: true,
    selfGrade: null,
    depth: "working",
    learningStatus: "not_started",
    questions: [],
    progress: {
      status: maturity >= 80 ? "mastered" : maturity > 0 ? "in_progress" : "not_started",
      maturity,
      attempts: maturity > 0 ? 1 : 0,
      lastInteractedAt: null,
    },
    ...rest,
  };
}

function topics(maturities: number[], prefix: string): Topic[] {
  return maturities.map((maturity, index) => topic({ id: `${prefix}-${index}`, maturity }));
}

describe("domainNodeProgress", () => {
  it("reduces to the curriculum's own progress for a leaf node with one attached curriculum", () => {
    const nodes = [{ id: "next-js", parentId: "meta-frameworks" }, { id: "meta-frameworks", parentId: null }];
    const curriculumTopics = [{ domainNodeId: "next-js", topics: topics([80, 40, 0], "leaf") }];

    const result = domainNodeProgress("next-js", nodes, curriculumTopics);

    expect(result.percent).toBe(40);
  });

  it("weights every topic in a deep subtree equally regardless of branch — not a naive per-branch average", () => {
    // Deliberately even case first: two branches, [100,100] and [0,0] — a
    // naive per-branch average and the flattened-topic average coincide
    // here (both give 50), so this case alone can't distinguish them.
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "meta-frameworks", parentId: "frontend" },
      { id: "next-js", parentId: "meta-frameworks" },
      { id: "app-router", parentId: "next-js" },
    ]
    const curriculumTopics = [
      { domainNodeId: "next-js", topics: topics([100, 100], "shallow") },
      { domainNodeId: "app-router", topics: topics([0, 0], "deep") },
    ]

    expect(domainNodeProgress("frontend", nodes, curriculumTopics).percent).toBe(50)
  })

  it("distinguishes the flattened-topic rule from a naive per-branch average on uneven branch sizes", () => {
    // [100] vs [0,0,0] — flattened: 1 of 4 topics fully mature -> 25.
    // A naive per-branch average would instead compute (100 + 0) / 2 = 50.
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "branch-a", parentId: "frontend" },
      { id: "branch-b", parentId: "frontend" },
    ]
    const curriculumTopics = [
      { domainNodeId: "branch-a", topics: topics([100], "a") },
      { domainNodeId: "branch-b", topics: topics([0, 0, 0], "b") },
    ]

    expect(domainNodeProgress("frontend", nodes, curriculumTopics).percent).toBe(25)
  })

  it("returns exactly 0 for a node with zero topics anywhere in its subtree", () => {
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "meta-frameworks", parentId: "frontend" },
      { id: "nuxt-js", parentId: "meta-frameworks" },
    ]

    expect(domainNodeProgress("nuxt-js", nodes, []).percent).toBe(0)
  })

  it("is stable across repeated calls with identical input — no time-decay input exists to vary", () => {
    const nodes = [{ id: "next-js", parentId: null }]
    const curriculumTopics = [{ domainNodeId: "next-js", topics: topics([80, 40, 0], "stable") }]

    const first = domainNodeProgress("next-js", nodes, curriculumTopics)
    const second = domainNodeProgress("next-js", nodes, curriculumTopics)

    expect(first).toEqual(second)
  })

  it("does not infinite-loop on a cyclic nodes array — returns within the depth cap instead of hanging", () => {
    const nodes = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]

    const result = domainNodeProgress("a", nodes, [])

    expect(result).toEqual({ topicsIncluded: 0, topicsMastered: 0, percent: 0 })
  })
})
