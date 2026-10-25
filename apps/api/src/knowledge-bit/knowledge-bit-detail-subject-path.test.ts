import { describe, expect, it } from "vitest";
import { deriveSubjectPath, type SubjectNode } from "./knowledge-bit-detail-subject-path.js";

const tree: SubjectNode[] = [
  { id: "s1", name: "Programming", parentId: null },
  { id: "s2", name: "Databases", parentId: "s1" },
  { id: "s3", name: "Indexes", parentId: "s2" },
];

describe("deriveSubjectPath", () => {
  it("should list names from the top-level subject down to the piece's subject", () => {
    expect(deriveSubjectPath("s3", tree)).toEqual(["Programming", "Databases", "Indexes"]);
  });

  it("should give a single name for a top-level subject", () => {
    expect(deriveSubjectPath("s1", tree)).toEqual(["Programming"]);
  });

  it("should give an empty path for a piece with no subject", () => {
    expect(deriveSubjectPath(null, tree)).toEqual([]);
  });

  it("should give an empty path when the subject no longer exists", () => {
    expect(deriveSubjectPath("gone", tree)).toEqual([]);
  });

  it("should stop instead of looping when subjects point at each other", () => {
    const loop: SubjectNode[] = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];

    expect(deriveSubjectPath("a", loop)).toEqual(["B", "A"]);
  });

  it("should keep the known part when a parent is missing", () => {
    const orphan: SubjectNode[] = [{ id: "x", name: "X", parentId: "missing" }];

    expect(deriveSubjectPath("x", orphan)).toEqual(["X"]);
  });
});
