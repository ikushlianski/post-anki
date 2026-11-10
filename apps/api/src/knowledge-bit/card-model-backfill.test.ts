import { describe, expect, it } from "vitest";
import {
  countBits,
  parseCardModelBackfillArgs,
  planCardModelBackfill,
  type CardModelBackfillCandidate,
} from "./card-model-backfill.js";

function candidate(overrides: Partial<CardModelBackfillCandidate>): CardModelBackfillCandidate {
  return { bitId: "b", fusionModelIds: [], sourceModelId: null, feedbackModelId: null, ...overrides };
}

describe("parseCardModelBackfillArgs", () => {
  it("should be a dry run unless apply is asked for", () => {
    expect(parseCardModelBackfillArgs([])).toEqual({ apply: false, allowRemote: false, fromFeedback: false });
    expect(parseCardModelBackfillArgs(["--apply", "--from-feedback"]).fromFeedback).toBe(true);
  });
});

describe("planCardModelBackfill", () => {
  it("should trust a single fusion model and a source override, and keep setting-derived guesses apart", () => {
    const plan = planCardModelBackfill([
      candidate({ bitId: "a", fusionModelIds: ["m1"], sourceModelId: "other" }),
      candidate({ bitId: "b", sourceModelId: "m2" }),
      candidate({ bitId: "c", feedbackModelId: "m3" }),
      candidate({ bitId: "d", fusionModelIds: ["m1", "m2"], feedbackModelId: "m3" }),
      candidate({ bitId: "e" }),
    ]);

    expect(plan.reliable.get("m1")).toEqual(["a"]);
    expect(plan.reliable.get("m2")).toEqual(["b"]);
    expect(plan.inferred.get("m3")).toEqual(["c"]);
    expect(plan.skipped).toBe(2);
    expect(countBits(plan.reliable)).toBe(2);
  });
});
