import { describe, it, expect } from "vitest";
import type { Topic } from "@post-anki/shared";
import { domainNodeProgress, isAncestor } from "./domain-map-progress";

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

  // SCENARIO 5 (.planning/domain-node-merge/scenarios.md) —
  // domainNodeProgress() stays correct against a tree shape equivalent to
  // what mergeDomainNodes produces: a target with its own pre-existing
  // child sitting alongside the source's former children after re-parenting
  // (including one intentionally same-named pair, per spec.md's Decision
  // #2 — no dedup on merge). The merged tree here is deliberately shallow
  // (3 levels) so this is a real pass against domainNodeProgress()'s own
  // MAX_DEPTH = 6 cap, not a cap-driven false pass.
  it("averages correctly across a post-merge tree shape with a same-named sibling pair (merged-shape rollup)", () => {
    const nodes = [
      { id: "target", parentId: null },
      // Target's own pre-existing child, untouched by the merge.
      { id: "existing-child", parentId: "target" },
      // Two of the source's former children, re-parented directly onto the
      // target by the merge — "Existing Child" duplicates the name above,
      // proving no dedup/merge-by-name happened, just as Decision #2
      // requires.
      { id: "reparented-child-same-name", parentId: "target" },
      { id: "reparented-child-with-grandchild", parentId: "target" },
      { id: "reparented-grandchild", parentId: "reparented-child-with-grandchild" },
    ]

    const curriculumTopics = [
      { domainNodeId: "existing-child", topics: topics([100], "existing") },
      { domainNodeId: "reparented-child-same-name", topics: topics([0], "dup") },
      { domainNodeId: "reparented-grandchild", topics: topics([50, 50], "grand") },
    ]

    // Flattened: [100, 0, 50, 50] -> average 50, not a naive per-branch
    // average (which would give a different number).
    expect(domainNodeProgress("target", nodes, curriculumTopics).percent).toBe(50)
  })

  // decouple-curricula-from-domain-nodes (issue #84), SCENARIO 9 — the fix
  // the plan's own grill-plan review caught: a curriculum confirmed against
  // two nodes that share a common ancestor must contribute its topics to
  // that ancestor's rollup ONCE, not once per mapped descendant. Without a
  // topic-id dedup, this ancestor's subtree walk sees both {domainNodeId,
  // topics} entries and flattens both full topic lists together unchanged —
  // double-counting the same curriculum's topics.
  it("dedups a curriculum's topics by id before rolling up an ancestor shared by two of its mapped nodes", () => {
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "docker", parentId: "frontend" },
      { id: "kubernetes", parentId: "frontend" },
    ]

    // One curriculum ("Container Fundamentals") confirmed against BOTH
    // "docker" and "kubernetes" — its own three topics appear identically
    // in both entries, since domainNodeProgress's call shape is one
    // {domainNodeId, topics} entry per confirmed mapping, and the mapping
    // is many-to-many for the same curriculum.
    const sharedTopics = topics([100, 50, 0], "shared")
    const curriculumTopics = [
      { domainNodeId: "docker", topics: sharedTopics },
      { domainNodeId: "kubernetes", topics: sharedTopics },
    ]

    // Deduped by topic id: exactly [100, 50, 0] once -> average 50. A
    // double-counted flatten would instead average
    // [100,50,0,100,50,0] -> still 50 by coincidence on percent, so this
    // assertion checks topicsIncluded directly, which a double-count would
    // report as 6, not 3.
    const result = domainNodeProgress("frontend", nodes, curriculumTopics)

    expect(result.topicsIncluded).toBe(3)
    expect(result.percent).toBe(50)
  })
})

describe("isAncestor", () => {
  // spec.md's "Cycle-guard design" — isAncestor(candidateAncestorId, nodeId,
  // nodes) walks nodeId's parentId chain UPWARD (mirrors pathFor()'s shape
  // in domain-placement.orchestrator.ts), checking whether
  // candidateAncestorId appears in that chain. Deliberately NOT
  // domainNodeProgress()'s depth-capped descendant walk — see the CHAIN_
  // DEPTH = 9 test below, which is the concrete regression test for that
  // exact mistake.

  it("returns true for a direct parent/child pair", () => {
    const nodes = [
      { id: "child", parentId: "parent" },
      { id: "parent", parentId: null },
    ]

    expect(isAncestor("parent", "child", nodes)).toBe(true)
  })

  it("returns true for an indirect, multi-hop ancestor", () => {
    const nodes = [
      { id: "leaf", parentId: "mid" },
      { id: "mid", parentId: "root" },
      { id: "root", parentId: null },
    ]

    expect(isAncestor("root", "leaf", nodes)).toBe(true)
  })

  it("returns false for a sibling (shares a parent, is not an ancestor)", () => {
    const nodes = [
      { id: "a", parentId: "parent" },
      { id: "b", parentId: "parent" },
      { id: "parent", parentId: null },
    ]

    expect(isAncestor("a", "b", nodes)).toBe(false)
  })

  it("returns false for a node in a completely unrelated branch", () => {
    const nodes = [
      { id: "a", parentId: null },
      { id: "b", parentId: null },
    ]

    expect(isAncestor("a", "b", nodes)).toBe(false)
  })

  // A node is not its own ancestor. withMergeLock already rejects
  // targetId === sourceId as self_merge before isAncestor would ever run
  // for a real merge call, so this case is only reachable at the
  // pure-function level — kept so a future simplification doesn't quietly
  // remove the guard's own self-safety.
  it("returns false for a node checked against itself", () => {
    const nodes = [
      { id: "x", parentId: "parent" },
      { id: "parent", parentId: null },
    ]

    expect(isAncestor("x", "x", nodes)).toBe(false)
  })

  // Permissive-by-design: a dangling parentId (pointing at a row that
  // doesn't exist in `nodes`) terminates the walk and returns false rather
  // than throwing — spec.md's explicit call that a merge should not fail
  // because of unrelated pre-existing data corruption elsewhere in the tree.
  it("returns false, not a throw, when a hop's parentId is unresolvable (dangling pointer)", () => {
    const nodes = [{ id: "orphan", parentId: "ghost-parent-that-does-not-exist" }]

    expect(() => isAncestor("anything", "orphan", nodes)).not.toThrow()
    expect(isAncestor("anything", "orphan", nodes)).toBe(false)
  })

  // Proves the visited-Set guarantees termination even against an
  // already-corrupted (cyclic) tree, when the candidate being asked about
  // is NOT actually in the walked chain — the walk must give up rather
  // than loop forever. This exact cyclic shape can never be constructed via
  // the real API (this item's own guard prevents it) — exercised here at
  // the pure-function level only, per spec.md's Definition of Done.
  it("terminates instead of looping forever on a pre-corrupted 2-node cycle", () => {
    const nodes = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]

    expect(() => isAncestor("unrelated", "a", nodes)).not.toThrow()
    expect(isAncestor("unrelated", "a", nodes)).toBe(false)
  })

  // The concrete regression test for the depth-cap mistake spec.md
  // explicitly warns against: reusing domainNodeProgress()'s MAX_DEPTH = 6
  // cap here would silently let a cycle 7+ levels up through undetected.
  // CHAIN_DEPTH = 9 is deliberately past that cap.
  it("finds an ancestor 9 levels up — proves no depth cap applies (unlike domainNodeProgress's MAX_DEPTH = 6)", () => {
    const CHAIN_DEPTH = 9;
    const nodes: { id: string; parentId: string | null }[] = [{ id: "n0", parentId: null }];

    for (let i = 1; i <= CHAIN_DEPTH; i += 1) {
      nodes.push({ id: `n${i}`, parentId: `n${i - 1}` });
    }

    expect(isAncestor("n0", `n${CHAIN_DEPTH}`, nodes)).toBe(true);
  });

  // The argument-order regression test. Chain: B (root) -> C -> A (B is
  // A's grandparent). isAncestor(B, A) and isAncestor(A, B) must produce
  // DIFFERENT, correct answers — a transposed call in mergeDomainNodes
  // (isAncestor(targetId, sourceId) instead of isAncestor(sourceId,
  // targetId)) would silently invert both the reject-a-cycle case and the
  // allow-a-safe-merge case at once, so this single test's two assertions
  // together are what catches that specific implementation bug.
  it("is NOT interchangeable when arguments are swapped — isAncestor(a,b) and isAncestor(b,a) differ", () => {
    const nodes = [
      { id: "grandparent-b", parentId: null },
      { id: "parent-c", parentId: "grandparent-b" },
      { id: "grandchild-a", parentId: "parent-c" },
    ];

    expect(isAncestor("grandparent-b", "grandchild-a", nodes)).toBe(true);
    expect(isAncestor("grandchild-a", "grandparent-b", nodes)).toBe(false);
  });
})
