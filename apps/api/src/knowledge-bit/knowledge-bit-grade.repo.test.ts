import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";

vi.mock("./knowledge-bit-feedback.repo.js", () => ({
  recordKnowledgeBitFeedback: vi.fn(),
}));

const { recordKnowledgeBitFeedback } = await import("./knowledge-bit-feedback.repo.js");
const { gradeKnowledgeBit } = await import("./knowledge-bit-grade.repo.js");

function fakeDb(selects: unknown[][]) {
  const queue = [...selects];
  const set = vi.fn((_patch: Record<string, unknown>) => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const chain = () => {
    const rows = queue.shift() ?? [];
    const node: Record<string, unknown> = {};

    node.from = () => node;
    node.where = () => node;
    node.orderBy = () => node;
    node.limit = () => Promise.resolve(rows);

    return node;
  };

  const db = {
    select: vi.fn(chain),
    update: vi.fn(() => ({ set })),
  };

  return { db: db as unknown as DbExecutor, set, update: db.update };
}

describe("gradeKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should report an unknown card as not found", async () => {
    const { db } = fakeDb([[]]);

    expect(await gradeKnowledgeBit("missing", { rating: 3 }, db)).toEqual({ status: "not_found" });
    expect(recordKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it("should not grade a manually written card", async () => {
    const { db } = fakeDb([[{ origin: "manual" }]]);

    expect(await gradeKnowledgeBit("kb_1", { rating: 3 }, db)).toEqual({ status: "not_applicable" });
  });

  it("should create a pending record carrying the grade when the card has no decision yet", async () => {
    vi.mocked(recordKnowledgeBitFeedback).mockResolvedValue("kbf_new");

    const { db } = fakeDb([[{ origin: "extracted" }], []]);

    const result = await gradeKnowledgeBit("kb_1", { rating: 5, note: " great " }, db);

    expect(result).toEqual({ status: "ok", feedbackId: "kbf_new" });
    expect(recordKnowledgeBitFeedback).toHaveBeenCalledWith(db, {
      bitId: "kb_1",
      verdict: "pending",
      rating: 5,
      note: "great",
    });
  });

  it("should update the existing record instead of adding another when graded again", async () => {
    const { db, set } = fakeDb([[{ origin: "extracted" }], [{ id: "kbf_old" }]]);

    const result = await gradeKnowledgeBit("kb_1", { rating: 2 }, db);

    expect(result).toEqual({ status: "ok", feedbackId: "kbf_old" });
    expect(set).toHaveBeenCalledWith({ rating: 2, note: null });
    expect(recordKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it.each([
    ["approved", "kbf_approved"],
    ["rejected", "kbf_rejected"],
    ["bulk-approved", "kbf_bulk"],
  ])("should grade an already %s card by updating its latest record without touching the verdict", async (_case, feedbackId) => {
    const { db, set, update } = fakeDb([[{ origin: "extracted" }], [{ id: feedbackId }]]);

    const result = await gradeKnowledgeBit("kb_1", { rating: 4, note: " useful " }, db);

    expect(result).toEqual({ status: "ok", feedbackId });
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ rating: 4, note: "useful" });
    expect(set.mock.calls[0]?.[0]).not.toHaveProperty("verdict");
    expect(recordKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it("should clear the note when a decided card is regraded without one", async () => {
    const { db, set } = fakeDb([[{ origin: "extracted" }], [{ id: "kbf_1" }]]);

    await gradeKnowledgeBit("kb_1", { rating: 1, note: "   " }, db);

    expect(set).toHaveBeenCalledWith({ rating: 1, note: null });
  });
});
