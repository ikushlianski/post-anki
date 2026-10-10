import { describe, it, expect } from "vitest";
import {
  buildSubjectPathLabel,
  collectSubjectSubtreeIds,
  listValidMoveTargets,
  wouldCreateSubjectCycle,
  type SubjectHierarchyRow,
} from "./subject-hierarchy";

const TREE: SubjectHierarchyRow[] = [
  { id: "prog", name: "Programming", parentId: null },
  { id: "web", name: "Web", parentId: "prog" },
  { id: "react", name: "React", parentId: "web" },
  { id: "hooks", name: "Hooks", parentId: "react" },
  { id: "databases", name: "Databases", parentId: "prog" },
  { id: "business", name: "Business", parentId: null },
];

describe("collectSubjectSubtreeIds", () => {
  it("should include descendants at any depth under the root", () => {
    expect(collectSubjectSubtreeIds("prog", TREE).sort()).toEqual(
      ["prog", "web", "react", "hooks", "databases"].sort(),
    );
  });

  it("should exclude siblings and ancestors of the root", () => {
    const subtree = collectSubjectSubtreeIds("web", TREE);

    expect(subtree).not.toContain("prog");
    expect(subtree).not.toContain("databases");
    expect(subtree).not.toContain("business");
  });

  it("should terminate on a malformed stored cycle", () => {
    const cyclic: SubjectHierarchyRow[] = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];

    expect(collectSubjectSubtreeIds("a", cyclic).sort()).toEqual(["a", "b"]);
  });
});

describe("wouldCreateSubjectCycle", () => {
  it("should reject a subject becoming its own parent", () => {
    expect(wouldCreateSubjectCycle("web", "web", TREE)).toBe(true);
  });

  it("should reject a subject moving under one of its own descendants", () => {
    expect(wouldCreateSubjectCycle("prog", "hooks", TREE)).toBe(true);
  });

  it("should allow moving under a sibling branch or to top level", () => {
    expect(wouldCreateSubjectCycle("web", "business", TREE)).toBe(false);
    expect(wouldCreateSubjectCycle("web", null, TREE)).toBe(false);
  });

  it("should terminate and return false when the stored parent chain is already cyclic", () => {
    const cyclic: SubjectHierarchyRow[] = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
      { id: "c", name: "C", parentId: null },
    ];

    expect(wouldCreateSubjectCycle("c", "a", cyclic)).toBe(false);
  });
});

describe("listValidMoveTargets", () => {
  it("should exclude the subject itself and all of its descendants", () => {
    const ids = listValidMoveTargets("web", TREE).map((row) => row.id);

    expect(ids).not.toContain("web");
    expect(ids).not.toContain("react");
    expect(ids).not.toContain("hooks");
    expect(ids).toContain("prog");
    expect(ids).toContain("databases");
    expect(ids).toContain("business");
  });
});

describe("buildSubjectPathLabel", () => {
  it("should join ancestor names from root to the subject", () => {
    expect(buildSubjectPathLabel("hooks", TREE)).toBe("Programming › Web › React › Hooks");
  });

  it("should return only the name for a top-level subject", () => {
    expect(buildSubjectPathLabel("business", TREE)).toBe("Business");
  });

  it("should return an empty label for an unknown id", () => {
    expect(buildSubjectPathLabel("missing", TREE)).toBe("");
  });
});
