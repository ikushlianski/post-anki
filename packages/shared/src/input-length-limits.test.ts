import { describe, expect, it } from "vitest";
import { addNodeCommentInput } from "./node-feedback";
import { captureLearningListItemInput } from "./learning-list";
import { addSourcesInput, createCurriculumInput } from "./curriculum";
import { updateSubjectInput } from "./subject";
import { sourceDraftSchema } from "./source";

describe("input length limits", () => {
  it("should reject renaming a subject to a name longer than when creating one", () => {
    expect(updateSubjectInput.safeParse({ name: "a".repeat(121) }).success).toBe(false);
    expect(updateSubjectInput.safeParse({ name: "a".repeat(120) }).success).toBe(true);
  });

  it("should trim a subject chat instruction and reject one over the limit", () => {
    expect(updateSubjectInput.parse({ chatInstructions: "  hi  " }).chatInstructions).toBe("hi");
    expect(updateSubjectInput.safeParse({ chatInstructions: "a".repeat(1_501) }).success).toBe(false);
    expect(updateSubjectInput.safeParse({ chatInstructions: null }).success).toBe(true);
  });

  it("should reject a runaway node comment", () => {
    expect(addNodeCommentInput.safeParse({ nodeId: "n", comment: "a".repeat(5_001) }).success).toBe(false);
    expect(addNodeCommentInput.safeParse({ nodeId: "n", comment: "fine" }).success).toBe(true);
  });

  it("should reject an absurdly long learning link url or description", () => {
    const base = { url: "https://x.test/a", subjectId: "s" };

    expect(captureLearningListItemInput.safeParse({ ...base, url: "a".repeat(2_001) }).success).toBe(false);
    expect(captureLearningListItemInput.safeParse({ ...base, pastedDescription: "a".repeat(5_001) }).success).toBe(
      false,
    );
    expect(captureLearningListItemInput.safeParse(base).success).toBe(true);
  });

  it("should reject course pasted material over 100k and accept up to it", () => {
    const base = { subjectId: "s", name: "Course" };

    expect(createCurriculumInput.safeParse({ ...base, pastedMaterial: "a".repeat(100_001) }).success).toBe(false);
    expect(createCurriculumInput.safeParse({ ...base, pastedMaterial: "a".repeat(100_000) }).success).toBe(true);
  });

  it("should cap how many sources one request adds and the size of each", () => {
    const draft = { kind: "link", value: "https://x.test" };

    expect(addSourcesInput.safeParse({ curriculumId: "c", sources: Array(51).fill(draft) }).success).toBe(false);
    expect(addSourcesInput.safeParse({ curriculumId: "c", sources: Array(50).fill(draft) }).success).toBe(true);
    expect(sourceDraftSchema.safeParse({ ...draft, title: "a".repeat(301) }).success).toBe(false);
  });
});
