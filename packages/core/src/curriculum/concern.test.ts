import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import { summarizeConcerns } from "./concern";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t",
    label: "g",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    ...overrides,
  };
}

describe("summarizeConcerns", () => {
  it("returns nothing when no gap carries a concern", () => {
    expect(summarizeConcerns([gap({ id: "a" })])).toEqual([]);
  });

  it("accumulates a concern across gaps from different topics", () => {
    const summaries = summarizeConcerns([
      gap({ id: "a", topicId: "t1", concern: "security", state: "open" }),
      gap({ id: "b", topicId: "t2", concern: "security", state: "covered" }),
      gap({ id: "c", topicId: "t3", concern: "security", state: "open" }),
    ]);

    expect(summaries).toEqual([
      { concern: "security", open: 2, covered: 1, total: 3 },
    ]);
  });

  it("ignores skipped gaps in the concern rollup", () => {
    const summaries = summarizeConcerns([
      gap({ id: "a", concern: "cost", state: "skipped" }),
      gap({ id: "b", concern: "cost", state: "open" }),
    ]);

    expect(summaries).toEqual([{ concern: "cost", open: 1, covered: 0, total: 1 }]);
  });

  it("separates distinct concerns", () => {
    const summaries = summarizeConcerns([
      gap({ id: "a", concern: "performance", state: "open" }),
      gap({ id: "b", concern: "reliability", state: "covered" }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.concern === "performance")?.open).toBe(1);
    expect(summaries.find((s) => s.concern === "reliability")?.covered).toBe(1);
  });
});
