import { describe, it, expect } from "vitest";
import { resolveNoteTaxonomySubtree } from "./note-taxonomy";

describe("resolveNoteTaxonomySubtree", () => {
  it("includes a note attached under a descendant of the filtered node", () => {
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "react", parentId: "frontend" },
      { id: "hooks", parentId: "react" },
    ];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["hooks"] }];

    const result = resolveNoteTaxonomySubtree("frontend", nodes, candidates);

    expect(result).toEqual(["note-1"]);
  });

  it("excludes a note attached under an unrelated area", () => {
    const nodes = [
      { id: "frontend", parentId: null },
      { id: "react", parentId: "frontend" },
      { id: "backend", parentId: null },
      { id: "node", parentId: "backend" },
    ];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["node"] }];

    const result = resolveNoteTaxonomySubtree("frontend", nodes, candidates);

    expect(result).toEqual([]);
  });

  it("includes a note attached directly to the filtered node itself", () => {
    const nodes = [{ id: "react", parentId: null }];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["react"] }];

    const result = resolveNoteTaxonomySubtree("react", nodes, candidates);

    expect(result).toEqual(["note-1"]);
  });

  it("terminates against a cyclic tree instead of infinite-looping", () => {
    const nodes = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["a"] }];

    const result = resolveNoteTaxonomySubtree("a", nodes, candidates);

    expect(result).toEqual(["note-1"]);
  });

  it("terminates against a tree deeper than MAX_DEPTH without throwing", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
    }));
    const candidates = [{ noteId: "note-deep", domainNodeIds: ["n19"] }];

    expect(() => resolveNoteTaxonomySubtree("n0", nodes, candidates)).not.toThrow();
  });

  it("returns an empty list when the filter node id matches no candidate", () => {
    const nodes = [{ id: "react", parentId: null }];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["other"] }];

    const result = resolveNoteTaxonomySubtree("react", nodes, candidates);

    expect(result).toEqual([]);
  });

  it("returns an empty list when the filter node id is not in nodes at all", () => {
    const nodes = [{ id: "react", parentId: null }];
    const candidates = [{ noteId: "note-1", domainNodeIds: ["react"] }];

    const result = resolveNoteTaxonomySubtree("missing", nodes, candidates);

    expect(result).toEqual([]);
  });
});
