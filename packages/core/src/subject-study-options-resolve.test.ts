import { describe, expect, it } from "vitest";
import type { StudyOptions } from "@post-anki/shared";
import { collectSubjectAncestorIds, resolveStudyOptions } from "./subject-study-options-resolve";

const APP: StudyOptions = {
  newCardsPerDay: 20,
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
      learningStepsMinutes: [5],
      relearningStepsMinutes: [10],
      desiredRetention: 0.85,
    });
    expect(result.sources).toEqual({
      newCardsPerDay: "parent",
      learningStepsMinutes: "child",
      relearningStepsMinutes: "app",
      desiredRetention: "parent",
    });
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
