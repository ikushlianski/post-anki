import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import {
  applyGapVerdicts,
  gapMaturity,
  progressFromGaps,
  openGaps,
  inScopeGaps,
  nextGapToProbe,
} from "./gap";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "top-1",
    label: "some sub-skill",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    ...overrides,
  };
}

describe("applyGapVerdicts", () => {
  it("checks off a gap the learner demonstrably covered", () => {
    const gaps = [gap({ id: "g1" })];

    const result = applyGapVerdicts(gaps, [{ gapId: "g1", covered: true }], "now");

    expect(result[0]!.state).toBe("covered");
    expect(result[0]!.lastEvaluatedAt).toBe("now");
  });

  it("can cover several gaps at once when one answer ranges wider than asked", () => {
    const gaps = [gap({ id: "g1" }), gap({ id: "g2" }), gap({ id: "g3" })];

    const result = applyGapVerdicts(
      gaps,
      [
        { gapId: "g1", covered: true },
        { gapId: "g2", covered: true },
      ],
      "now",
    );

    expect(result.map((g) => g.state)).toEqual(["covered", "covered", "open"]);
  });

  it("leaves a gap untouched when the evaluator returned no verdict on it", () => {
    const gaps = [gap({ id: "g1", state: "covered", lastEvaluatedAt: "earlier" })];

    const result = applyGapVerdicts(gaps, [], "now");

    expect(result[0]!.state).toBe("covered");
    expect(result[0]!.lastEvaluatedAt).toBe("earlier");
  });

  it("reopens a gap the learner turned out not to actually know", () => {
    const gaps = [gap({ id: "g1", state: "covered", lastEvaluatedAt: "earlier" })];

    const result = applyGapVerdicts(gaps, [{ gapId: "g1", covered: false }], "now");

    expect(result[0]!.state).toBe("open");
  });

  it("never resurrects a gap the learner chose to skip, even if probed", () => {
    const gaps = [gap({ id: "g1", state: "skipped" })];

    const result = applyGapVerdicts(gaps, [{ gapId: "g1", covered: true }], "now");

    expect(result[0]!.state).toBe("skipped");
  });
});

describe("inScopeGaps", () => {
  it("excludes gaps deeper than the chosen depth ceiling", () => {
    const gaps = [
      gap({ id: "a", depth: "awareness" }),
      gap({ id: "b", depth: "working" }),
      gap({ id: "c", depth: "deep" }),
    ];

    expect(inScopeGaps(gaps, "working").map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("excludes gaps the learner explicitly skipped as too detailed", () => {
    const gaps = [
      gap({ id: "keep", state: "open" }),
      gap({ id: "drop", state: "skipped" }),
    ];

    expect(inScopeGaps(gaps, "deep").map((g) => g.id)).toEqual(["keep"]);
  });

  it("includes everything in-scope when the learner wants deep mastery", () => {
    const gaps = [
      gap({ id: "a", depth: "awareness" }),
      gap({ id: "c", depth: "deep" }),
    ];

    expect(inScopeGaps(gaps, "deep")).toHaveLength(2);
  });
});

describe("gapMaturity", () => {
  it("treats a topic with no in-scope gaps as unmeasured", () => {
    expect(gapMaturity([], "working")).toBe(0);
  });

  it("is the share of in-scope gaps the learner has covered", () => {
    const gaps = [
      gap({ id: "a", state: "covered" }),
      gap({ id: "b", state: "covered" }),
      gap({ id: "c", state: "open" }),
      gap({ id: "d", state: "open" }),
    ];

    expect(gapMaturity(gaps, "working")).toBe(50);
  });

  it("does not count a skipped gap against the learner", () => {
    const gaps = [
      gap({ id: "a", state: "covered" }),
      gap({ id: "skip", state: "skipped" }),
    ];

    expect(gapMaturity(gaps, "working")).toBe(100);
  });

  it("does not count an unanswered deeper gap against a shallower goal", () => {
    const gaps = [
      gap({ id: "a", depth: "working", state: "covered" }),
      gap({ id: "deep", depth: "deep", state: "open" }),
    ];

    expect(gapMaturity(gaps, "working")).toBe(100);
  });
});

describe("progressFromGaps", () => {
  it("masters a topic once every in-scope gap is covered", () => {
    const gaps = [
      gap({ id: "a", state: "covered", lastEvaluatedAt: "t" }),
      gap({ id: "b", state: "covered", lastEvaluatedAt: "t" }),
    ];

    expect(progressFromGaps(gaps, "working", 3, "now").status).toBe("mastered");
  });

  it("keeps a topic in progress while in-scope gaps remain open", () => {
    const gaps = [
      gap({ id: "a", state: "covered", lastEvaluatedAt: "t" }),
      gap({ id: "b", state: "open" }),
    ];

    const progress = progressFromGaps(gaps, "working", 1, "now");

    expect(progress.status).toBe("in_progress");
    expect(progress.maturity).toBe(50);
  });

  it("can master a shallow goal while deeper gaps stay open", () => {
    const gaps = [
      gap({ id: "a", depth: "working", state: "covered", lastEvaluatedAt: "t" }),
      gap({ id: "deep", depth: "deep", state: "open" }),
    ];

    expect(progressFromGaps(gaps, "working", 2, "now").status).toBe("mastered");
  });
});

describe("openGaps", () => {
  it("returns only the in-scope gaps still worth probing", () => {
    const gaps = [
      gap({ id: "a", state: "covered" }),
      gap({ id: "b", state: "open" }),
      gap({ id: "deep", depth: "deep", state: "open" }),
      gap({ id: "skip", state: "skipped" }),
    ];

    expect(openGaps(gaps, "working").map((g) => g.id)).toEqual(["b"]);
  });
});

describe("nextGapToProbe", () => {
  it("prioritises a gap the learner flagged as wanted", () => {
    const gaps = [
      gap({ id: "ordinary", depth: "awareness", wanted: false }),
      gap({ id: "hot", depth: "deep", wanted: true }),
    ];

    expect(nextGapToProbe(gaps, "deep")!.id).toBe("hot");
  });

  it("falls back to the shallowest open gap when nothing is flagged", () => {
    const gaps = [
      gap({ id: "deep", depth: "deep" }),
      gap({ id: "shallow", depth: "awareness" }),
    ];

    expect(nextGapToProbe(gaps, "deep")!.id).toBe("shallow");
  });

  it("returns null when there is nothing left in scope to probe", () => {
    const gaps = [gap({ id: "done", state: "covered" })];

    expect(nextGapToProbe(gaps, "working")).toBeNull();
  });
});
