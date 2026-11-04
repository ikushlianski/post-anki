import { describe, expect, it } from "vitest";
import { currentForMetric, isTargetMet, mergeActivity, rollUpProgress } from "./study-goal-progress.js";

const tree = [
  { id: "db", name: "db", parentId: null },
  { id: "pg", name: "pg", parentId: "db" },
  { id: "pg-index", name: "pg-index", parentId: "pg" },
  { id: "other", name: "other", parentId: null },
];

describe("study goal progress", () => {
  it("should roll a nested sub-subject's activity up to every ancestor", () => {
    const direct = mergeActivity(
      new Map([
        ["pg", { reviews: 5, newCards: 2 }],
        ["pg-index", { reviews: 3, newCards: 1 }],
        ["other", { reviews: 40, newCards: 9 }],
      ]),
      new Map([["pg-index", 2]]),
    );

    expect(rollUpProgress("db", tree, direct)).toEqual({ reviews: 8, newCards: 3, notes: 2 });
    expect(rollUpProgress("pg", tree, direct)).toEqual({ reviews: 8, newCards: 3, notes: 2 });
    expect(rollUpProgress("other", tree, direct)).toEqual({ reviews: 40, newCards: 9, notes: 0 });
  });

  it("should count notes for a subject that has no reviews", () => {
    const direct = mergeActivity(new Map(), new Map([["pg", 4]]));

    expect(rollUpProgress("db", tree, direct).notes).toBe(4);
  });

  it("should read the number that matches the priority's chosen metric", () => {
    const progress = { reviews: 7, newCards: 3, notes: 1 };

    expect(currentForMetric("reviews", progress)).toBe(7);
    expect(currentForMetric("new_cards", progress)).toBe(3);
    expect(currentForMetric("notes", progress)).toBe(1);
    expect(currentForMetric("none", progress)).toBeNull();
  });

  it("should mark a priority met when the target is reached or it was ticked by hand", () => {
    expect(isTargetMet(200, 200, null)).toBe(true);
    expect(isTargetMet(199, 200, null)).toBe(false);
    expect(isTargetMet(null, null, null)).toBe(false);
    expect(isTargetMet(null, null, new Date())).toBe(true);
  });
});
