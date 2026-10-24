import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { insertDerivedKnowledgeItem } from "./knowledge-bit-manual-item.repo.js";

vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_new`) }));

function fakeDb(bit: { knowledgeSourceId: string; approvalState: string } | null, maxOrdinal: number | null) {
  const inserted: Record<string, unknown>[] = [];
  const lockedSources: number[] = [];
  const bitQuery = { from: vi.fn(), where: vi.fn(async () => (bit ? [bit] : [])) };
  const lockQuery = { from: vi.fn(), where: vi.fn(), for: vi.fn(async () => [{ id: "ksrc_1" }]) };
  const maxQuery = { from: vi.fn(), where: vi.fn(async () => [{ maxOrdinal }]) };

  bitQuery.from.mockReturnValue(bitQuery);
  lockQuery.from.mockReturnValue(lockQuery);
  lockQuery.where.mockImplementation(() => {
    lockedSources.push(1);

    return lockQuery;
  });
  maxQuery.from.mockReturnValue(maxQuery);

  const tx = {
    select: vi
      .fn()
      .mockReturnValueOnce(bitQuery)
      .mockReturnValueOnce(lockQuery)
      .mockReturnValueOnce(maxQuery),
    insert: vi.fn().mockReturnValue({
      values: vi.fn(async (row: Record<string, unknown>) => {
        inserted.push(row);
      }),
    }),
  };
  const db = { transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };

  return { db: db as unknown as DbExecutor, inserted, lockedSources, lockQuery };
}

describe("insertDerivedKnowledgeItem", () => {
  it("should add a pending sibling card under the same source with the next ordinal", async () => {
    const { db, inserted, lockQuery } = fakeDb({ knowledgeSourceId: "ksrc_1", approvalState: "approved" }, 4);

    const result = await insertDerivedKnowledgeItem("kb_1", { front: "Q", back: "A", example: "ex" }, db);

    expect(lockQuery.for).toHaveBeenCalledWith("update");
    expect(inserted[0]).toMatchObject({
      knowledgeSourceId: "ksrc_1",
      ordinal: 5,
      body: "Q\nA",
      background: "ex",
      approvalState: "pending",
      origin: "manual",
      isAiGenerated: false,
    });
    expect(inserted[1]).toMatchObject({ kind: "basic", prompt: "Q", answer: "A" });
    expect(result.ok && result.item).toMatchObject({ origin: "manual", variants: [{ prompt: "Q", answer: "A" }] });
  });

  it("should store the AI flag and keep only safe source links", async () => {
    const { db, inserted } = fakeDb({ knowledgeSourceId: "ksrc_1", approvalState: "approved" }, null);

    const result = await insertDerivedKnowledgeItem(
      "kb_1",
      {
        front: "Q",
        back: "A",
        aiGenerated: true,
        sourceLinks: ["https://example.com/ok", "http://localhost/admin", "http://169.254.169.254/latest"],
      },
      db,
    );

    expect(inserted[0]).toMatchObject({ ordinal: 0, isAiGenerated: true, sourceLinks: ["https://example.com/ok"] });
    expect(result.ok && result.item.sourceLinks).toEqual(["https://example.com/ok"]);
  });

  it("should still add a card when the source was already processed", async () => {
    const { db, inserted } = fakeDb({ knowledgeSourceId: "ksrc_done", approvalState: "approved" }, 0);

    const result = await insertDerivedKnowledgeItem("kb_1", { front: "Q", back: "A" }, db);

    expect(result.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ knowledgeSourceId: "ksrc_done", ordinal: 1 });
  });

  it("should report not_found and write nothing for an unknown item", async () => {
    const { db, inserted } = fakeDb(null, null);

    const result = await insertDerivedKnowledgeItem("kb_missing", { front: "Q", back: "A" }, db);

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(inserted).toHaveLength(0);
  });

  it("should reject an item that is not approved and write nothing", async () => {
    const { db, inserted } = fakeDb({ knowledgeSourceId: "ksrc_1", approvalState: "pending" }, null);

    const result = await insertDerivedKnowledgeItem("kb_1", { front: "Q", back: "A" }, db);

    expect(result).toEqual({ ok: false, error: "not_approved" });
    expect(inserted).toHaveLength(0);
  });
});
