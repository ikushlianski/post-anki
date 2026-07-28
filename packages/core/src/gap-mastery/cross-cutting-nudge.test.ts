import { describe, it, expect } from "vitest";
import { detectCrossCuttingGaps, type CrossCuttingGapCandidate } from "./cross-cutting-nudge";

function gap(overrides: Partial<CrossCuttingGapCandidate> = {}): CrossCuttingGapCandidate {
  return {
    label: "Race condition",
    subjectId: "subj-a",
    hasMasteryTracking: true,
    trackedStatus: "struggling",
    ...overrides,
  };
}

describe("detectCrossCuttingGaps", () => {
  it("surfaces a label recurring as mastery-tracked practicing/struggling gaps across 3+ distinct subjects", () => {
    const gaps = [
      gap({ subjectId: "subj-a" }),
      gap({ subjectId: "subj-b", trackedStatus: "practicing" }),
      gap({ subjectId: "subj-c" }),
    ];

    const result = detectCrossCuttingGaps(gaps);

    expect(result).toEqual([
      {
        label: "Race condition",
        subjectIds: ["subj-a", "subj-b", "subj-c"],
        subjectNames: ["subj-a", "subj-b", "subj-c"],
      },
    ]);
  });

  it("matches labels case-insensitively and ignoring whitespace when grouping", () => {
    const gaps = [
      gap({ subjectId: "subj-a", label: "race condition" }),
      gap({ subjectId: "subj-b", label: "  Race Condition  " }),
      gap({ subjectId: "subj-c", label: "RACE CONDITION" }),
    ];

    expect(detectCrossCuttingGaps(gaps)).toHaveLength(1);
  });

  it("does not surface a label seen in only 2 distinct mastery-tracked subjects", () => {
    const gaps = [gap({ subjectId: "subj-a" }), gap({ subjectId: "subj-b" })];

    expect(detectCrossCuttingGaps(gaps)).toEqual([]);
  });

  it("excludes a gap with no mastery tracking at all from the count, even if 3+ such gaps share the label", () => {
    const gaps = [
      gap({ subjectId: "subj-a" }),
      gap({ subjectId: "subj-b" }),
      gap({ subjectId: "subj-d", hasMasteryTracking: false, trackedStatus: null }),
    ];

    const result = detectCrossCuttingGaps(gaps);

    expect(result).toEqual([]);
  });

  it("excludes an already-mastered gap from the recurrence count", () => {
    const gaps = [
      gap({ subjectId: "subj-a" }),
      gap({ subjectId: "subj-b" }),
      gap({ subjectId: "subj-c", trackedStatus: "mastered" }),
    ];

    expect(detectCrossCuttingGaps(gaps)).toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(detectCrossCuttingGaps([])).toEqual([]);
  });
});
