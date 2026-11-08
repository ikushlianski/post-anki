import { describe, expect, it } from "vitest";
import type { StudyOptions } from "@post-anki/shared";
import { collectSubjectAncestorIds, resolveStudyOptions } from "./subject-study-options-resolve";

const APP: StudyOptions = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};

describe("resolveStudyOptions", () => {
  it("should use the parent subject's new-card limit when the child has none", () => {
    const result = resolveStudyOptions(
      [
        { subjectId: "child", options: {} },
        { subjectId: "parent", options: { newCardsPerDay: 7 } },
      ],
      APP,
    );

    expect(result.effective.newCardsPerDay).toBe(7);
    expect(result.sources.newCardsPerDay).toBe("parent");
  });

  it("should let a child override only learning steps while inheriting the rest", () => {
    const result = resolveStudyOptions(
      [
        { subjectId: "child", options: { learningStepsMinutes: [5] } },
        { subjectId: "parent", options: { newCardsPerDay: 7, desiredRetention: 0.85 } },
      ],
      APP,
    );

    expect(result.effective).toEqual({
      newCardsPerDay: 7,
      maxReviewsPerDay: 200,
      learningStepsMinutes: [5],
      relearningStepsMinutes: [10],
      desiredRetention: 0.85,
    });
    expect(result.sources).toEqual({
      newCardsPerDay: "parent",
      maxReviewsPerDay: "app",
      learningStepsMinutes: "child",
      relearningStepsMinutes: "app",
      desiredRetention: "parent",
    });
  });

  it("should use the subject's own review cap before an ancestor's or the app-wide one", () => {
    const result = resolveStudyOptions(
      [
        { subjectId: "child", options: { maxReviewsPerDay: 30 } },
        { subjectId: "parent", options: { maxReviewsPerDay: 80 } },
      ],
      APP,
    );

    expect(result.effective.maxReviewsPerDay).toBe(30);
    expect(result.sources.maxReviewsPerDay).toBe("child");
  });

  it("should inherit the nearest ancestor's review cap when the child has none", () => {
    const result = resolveStudyOptions(
      [
        { subjectId: "child", options: {} },
        { subjectId: "parent", options: { maxReviewsPerDay: 80 } },
      ],
      APP,
    );

    expect(result.effective.maxReviewsPerDay).toBe(80);
    expect(result.sources.maxReviewsPerDay).toBe("parent");
  });

  it("should fall back to the app-wide review cap when nobody in the chain sets one", () => {
    const result = resolveStudyOptions([{ subjectId: "child", options: {} }], APP);

    expect(result.effective.maxReviewsPerDay).toBe(200);
    expect(result.sources.maxReviewsPerDay).toBe("app");
  });

  it("should treat a zero review cap as an explicit override meaning unlimited", () => {
    const result = resolveStudyOptions([{ subjectId: "child", options: { maxReviewsPerDay: 0 } }], APP);

    expect(result.effective.maxReviewsPerDay).toBe(0);
    expect(result.sources.maxReviewsPerDay).toBe("child");
  });

  it("should fall back to app defaults when no subject in the chain sets a value", () => {
    const result = resolveStudyOptions([{ subjectId: "child", options: { newCardsPerDay: null } }], APP);

    expect(result.effective).toEqual(APP);
    expect(result.sources.newCardsPerDay).toBe("app");
  });

  it("should treat an unplaced card as using app defaults", () => {
    expect(resolveStudyOptions([], APP).effective).toEqual(APP);
  });
});

describe("collectSubjectAncestorIds", () => {
  const rows = [
    { id: "root", parentId: null },
    { id: "mid", parentId: "root" },
    { id: "leaf", parentId: "mid" },
  ];

  it("should list the subject first and then each ancestor up to the top", () => {
    expect(collectSubjectAncestorIds("leaf", rows)).toEqual(["leaf", "mid", "root"]);
  });

  it("should stop at a stored cycle instead of looping", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];

    expect(collectSubjectAncestorIds("a", cyclic)).toEqual(["a", "b"]);
  });

  it("should return nothing for an unknown subject", () => {
    expect(collectSubjectAncestorIds("ghost", rows)).toEqual([]);
  });
});
