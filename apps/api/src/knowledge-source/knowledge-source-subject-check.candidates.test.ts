import { describe, expect, it } from "vitest";
import {
  buildCandidateSamples,
  scopeCandidatesToParent,
  shortlistCandidates,
  trimToChars,
  type SubjectCheckCandidate,
} from "./knowledge-source-subject-check.candidates.js";

function candidate(id: string, embedding: number[] | null, label = id): SubjectCheckCandidate {
  return { id, label, description: null, kind: "other", embedding, samples: [] };
}

function numbered(count: number, embedding: (index: number) => number[] | null): SubjectCheckCandidate[] {
  return Array.from({ length: count }, (_, index) =>
    candidate(`s${String(index).padStart(2, "0")}`, embedding(index)),
  );
}

describe("shortlistCandidates", () => {
  it("should offer every leaf, ordered by name, when fifteen or fewer exist", () => {
    const result = shortlistCandidates([candidate("b", [1, 0]), candidate("a", null)], [1, 0]);

    expect(result.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("should keep only the fifteen nearest subjects when more than fifteen leaves exist", () => {
    const leaves = numbered(20, (index) => [index, 20 - index]);
    const result = shortlistCandidates(leaves, [20, 0]);

    expect(result).toHaveLength(15);
    expect(result[0]?.id).toBe("s19");
    expect(result.map((entry) => entry.id)).not.toContain("s00");
  });

  it("should fill the remaining slots with subjects that have no embedding", () => {
    const leaves = [
      ...numbered(10, (index) => [index + 1, 1]),
      ...Array.from({ length: 10 }, (_, index) => candidate(`z${index}`, null)),
    ];
    const result = shortlistCandidates(leaves, [1, 0]);

    expect(result).toHaveLength(15);
    expect(result.filter((entry) => entry.embedding !== null)).toHaveLength(10);
    expect(result.filter((entry) => entry.embedding === null)).toHaveLength(5);
  });

  it("should keep three slots for subjects without an embedding when many embedded ones compete", () => {
    const leaves = [
      ...numbered(20, (index) => [index + 1, 1]),
      ...Array.from({ length: 5 }, (_, index) => candidate(`z${index}`, null)),
    ];
    const result = shortlistCandidates(leaves, [1, 0]);

    expect(result).toHaveLength(15);
    expect(result.filter((entry) => entry.embedding === null).map((entry) => entry.id)).toEqual(["z0", "z1", "z2"]);
  });

  it("should still reserve slots for subjects without an embedding when the text could not be embedded", () => {
    const leaves = [...numbered(20, () => [1, 0]), candidate("zz_new", null)];
    const result = shortlistCandidates(leaves, null);

    expect(result).toHaveLength(15);
    expect(result.map((entry) => entry.id)).toContain("zz_new");
  });

  it("should fall back to name order when the text could not be embedded", () => {
    const leaves = numbered(20, () => [1, 0]);
    const result = shortlistCandidates(leaves, null);

    expect(result.map((entry) => entry.id)).toEqual(leaves.slice(0, 15).map((entry) => entry.id));
  });

  it("should treat an embedding of a different length as missing instead of failing", () => {
    const leaves = [...numbered(15, () => [1, 0]), candidate("odd", [1, 0, 0])];

    expect(shortlistCandidates(leaves, [1, 0])).toHaveLength(15);
  });
});

describe("scopeCandidatesToParent", () => {
  const hierarchy = [
    { id: "biz", name: "Business", parentId: null },
    { id: "pricing", name: "Pricing", parentId: "biz" },
    { id: "sales", name: "Sales", parentId: "biz" },
    { id: "polish", name: "Polish", parentId: null },
  ];
  const leaves = [candidate("pricing", null), candidate("sales", null), candidate("polish", null)];

  it("should only offer sub-subjects of a preselected parent", () => {
    expect(scopeCandidatesToParent(leaves, hierarchy, "biz").map((entry) => entry.id)).toEqual(["pricing", "sales"]);
  });

  it("should offer everything when no parent is preselected", () => {
    expect(scopeCandidatesToParent(leaves, hierarchy, undefined)).toHaveLength(3);
  });
});

describe("candidate text trimming", () => {
  it("should cut a long description to the requested length", () => {
    expect(trimToChars("x".repeat(300), 120)).toHaveLength(120);
  });

  it("should treat blank text as missing", () => {
    expect(trimToChars("  \n ", 120)).toBeNull();
    expect(trimToChars(null, 120)).toBeNull();
  });

  it("should keep at most two sample statements of at most one hundred characters", () => {
    const samples = buildCandidateSamples(["a".repeat(150), "b", "c"]);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toHaveLength(100);
  });
});
