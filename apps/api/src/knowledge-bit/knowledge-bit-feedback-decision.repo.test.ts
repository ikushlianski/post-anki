import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";

vi.mock("./knowledge-bit-feedback.repo.js", () => ({
  recordKnowledgeBitFeedback: vi.fn(),
}));

const { recordKnowledgeBitFeedback } = await import("./knowledge-bit-feedback.repo.js");
const { recordKnowledgeBitDecision } = await import("./knowledge-bit-feedback-decision.repo.js");

function fakeDb(pendingRows: { id: string }[]) {
  const sets: Record<string, unknown>[] = [];
  const inserts: unknown[] = [];

  const selectBuilder: Record<string, unknown> = {
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(pendingRows).then(resolve),
  };

  for (const name of ["from", "where", "orderBy", "limit"]) {
    selectBuilder[name] = () => selectBuilder;
  }

  const db = {
    select: () => selectBuilder,
    insert: () => ({
      values: (value: unknown) => {
        inserts.push(value);

        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        sets.push(patch);

        return { where: () => Promise.resolve() };
      },
    }),
  } as unknown as DbExecutor;

  return { db, sets, inserts };
}

describe("recordKnowledgeBitDecision", () => {
  beforeEach(() => {
    vi.mocked(recordKnowledgeBitFeedback).mockReset();
  });

  it("should turn a graded pending card into the approved row without adding a second row or losing the rating", async () => {
    const { db, sets, inserts } = fakeDb([{ id: "kbf_pending" }]);

    const id = await recordKnowledgeBitDecision(db, { bitId: "kb_1", verdict: "approved" });

    expect(id).toBe("kbf_pending");
    expect(sets).toEqual([{ verdict: "approved", reasonCode: null }]);
    expect(sets[0]).not.toHaveProperty("rating");
    expect(sets[0]).not.toHaveProperty("note");
    expect(inserts).toEqual([]);
    expect(recordKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it("should turn a graded pending card into the rejected row with the unspecified reason and keep its grade", async () => {
    const { db, sets } = fakeDb([{ id: "kbf_pending" }]);

    const id = await recordKnowledgeBitDecision(db, { bitId: "kb_1", verdict: "rejected" });

    expect(id).toBe("kbf_pending");
    expect(sets).toEqual([{ verdict: "rejected", reasonCode: "unspecified" }]);
    expect(recordKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it("should let the decision's own rating and note replace the pending grade", async () => {
    const { db, sets } = fakeDb([{ id: "kbf_pending" }]);

    await recordKnowledgeBitDecision(db, { bitId: "kb_1", verdict: "approved", rating: 5, note: "great" });

    expect(sets).toEqual([{ verdict: "approved", reasonCode: null, rating: 5, note: "great" }]);
  });

  it("should record a fresh decision row for an ungraded card exactly as before", async () => {
    const { db, sets } = fakeDb([]);
    vi.mocked(recordKnowledgeBitFeedback).mockResolvedValue("kbf_new");

    const id = await recordKnowledgeBitDecision(db, { bitId: "kb_1", verdict: "rejected" });

    expect(id).toBe("kbf_new");
    expect(recordKnowledgeBitFeedback).toHaveBeenCalledWith(db, { bitId: "kb_1", verdict: "rejected" });
    expect(sets).toEqual([]);
  });
});
