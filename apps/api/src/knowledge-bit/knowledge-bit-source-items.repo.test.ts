import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { insertSourceItemsForChunk } from "./knowledge-bit-source-items.repo.js";

vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_1`) }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

function fakeDb(sourceUrl: string | null) {
  const bitRows: Record<string, unknown>[] = [];
  const selectChain = { from: vi.fn(), where: vi.fn(), for: vi.fn() };

  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.for.mockResolvedValue([{ id: "ks_1", sourceUrl }]);

  const tx = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue({
      values: vi.fn((rows: Record<string, unknown>[]) => {
        bitRows.push(...rows);

        return {
          onConflictDoNothing: () => ({
            returning: async () => rows.map((row) => ({ id: row.id, ordinal: row.ordinal })),
          }),
          then: (resolve: () => void) => resolve(),
        };
      }),
    }),
  };
  const db = { transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };

  return { db: db as unknown as DbExecutor, bitRows };
}

const input = {
  sourceId: "ks_1",
  claimedAt: new Date(),
  firstOrdinal: 0,
  items: [{ statement: "S", quote: "a verbatim quote", example: null, cards: [{ kind: "basic" as const, statement: "S", question: "Q", answer: "A", quote: "a verbatim quote" }] }],
};

describe("insertSourceItemsForChunk source links", () => {
  it("should link every item extracted from an imported article back to that article", async () => {
    const { db, bitRows } = fakeDb("https://example.com/article");

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ sourceLinks: ["https://example.com/article"] });
  });

  it("should add no link to items extracted from pasted text", async () => {
    const { db, bitRows } = fakeDb(null);

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ sourceLinks: null });
  });

  it("should not link to a stored address that fails the safe-url check", async () => {
    const { db, bitRows } = fakeDb("http://169.254.169.254/latest");

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ sourceLinks: null });
  });
});
