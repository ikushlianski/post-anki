import { describe, expect, it, vi } from "vitest";
import { selectMiningBatch, subjectSubtreeIds } from "./card-synthesis-mining-selection.js";
import type {
  MiningCandidateBit,
  MiningSelectionStore,
  SubjectNode,
} from "./card-synthesis-mining-selection.repo.js";

const NODES: SubjectNode[] = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
  { id: "grand", parentId: "child" },
  { id: "other", parentId: null },
];

function bits(count: number): MiningCandidateBit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    body: `body ${i}`,
    createdAt: new Date(2026, 0, i + 1),
    embedding: [1, 0],
  }));
}

function store(available: Record<string, MiningCandidateBit[]>): MiningSelectionStore {
  return {
    listSubjects: vi.fn(async () => NODES),
    listUnexaminedEmbeddedBits: vi.fn(async (subjectIds: string[], limit: number) => {
      const key = [...subjectIds].sort().join(",");

      return (available[key] ?? []).slice(0, limit);
    }),
  };
}

describe("subjectSubtreeIds", () => {
  it("should include the subject and all its descendants only", () => {
    expect(subjectSubtreeIds("root", NODES).sort()).toEqual(["child", "grand", "root"]);
  });
});

describe("selectMiningBatch", () => {
  it("should do nothing and not touch the database when the allow-list is empty", async () => {
    const s = store({});

    expect(await selectMiningBatch({ allowedSubjectIds: [] }, s)).toBeNull();
    expect(s.listSubjects).not.toHaveBeenCalled();
    expect(s.listUnexaminedEmbeddedBits).not.toHaveBeenCalled();
  });

  it("should query the whole subtree of the allowed subject and return its cards in store order", async () => {
    const s = store({ "child,grand,root": bits(6) });
    const batch = await selectMiningBatch({ allowedSubjectIds: ["root"] }, s);

    expect(batch?.subjectId).toBe("root");
    expect(batch?.bits.map((b) => b.id)).toEqual(["b0", "b1", "b2", "b3", "b4", "b5"]);
  });

  it("should ask the store for at most 60 cards by default", async () => {
    const s = store({ "child,grand,root": bits(100) });
    const batch = await selectMiningBatch({ allowedSubjectIds: ["root"] }, s);

    expect(s.listUnexaminedEmbeddedBits).toHaveBeenCalledWith(expect.any(Array), 60);
    expect(batch?.bits).toHaveLength(60);
  });

  it("should move to the next allowed subject when the first has fewer than 5 unexamined cards", async () => {
    const s = store({ "child,grand,root": bits(4), other: bits(5) });
    const batch = await selectMiningBatch({ allowedSubjectIds: ["root", "other"] }, s);

    expect(batch?.subjectId).toBe("other");
  });

  it("should use only one subject per day even when several have cards", async () => {
    const s = store({ "child,grand,root": bits(5), other: bits(5) });
    const batch = await selectMiningBatch({ allowedSubjectIds: ["root", "other"] }, s);

    expect(batch?.subjectId).toBe("root");
    expect(s.listUnexaminedEmbeddedBits).toHaveBeenCalledTimes(1);
  });

  it("should skip allow-listed subjects that no longer exist", async () => {
    const s = store({ other: bits(5) });
    const batch = await selectMiningBatch({ allowedSubjectIds: ["gone", "other"] }, s);

    expect(batch?.subjectId).toBe("other");
  });

  it("should return nothing when no subject has enough unexamined cards", async () => {
    const s = store({ other: bits(2) });

    expect(await selectMiningBatch({ allowedSubjectIds: ["other"] }, s)).toBeNull();
  });
});
