import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { insertSourceItemsForChunk } from "./knowledge-bit-source-items.repo.js";

vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_1`) }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

function fakeDb(selects: unknown[][]) {
  const queue = [...selects];
  const insert = vi.fn();
  const chain: Record<string, unknown> = {};

  for (const name of ["from", "where", "limit"]) {
    chain[name] = () => chain;
  }

  chain.for = () => Promise.resolve(queue.shift() ?? []);
  chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve(queue.shift() ?? []).then(resolve);

  const tx = { select: () => chain, insert };
  const db = { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };

  return { db: db as unknown as DbExecutor, insert };
}

const input = {
  sourceId: "ks_1",
  claimedAt: new Date(),
  firstOrdinal: 0,
  items: [{ kind: "basic" as const, statement: "S", question: "Q", answer: "A", quote: "a verbatim quote" }],
};

describe("insertSourceItemsForChunk after the source is deleted", () => {
  it("should insert nothing when extraction finishes after the source was deleted", async () => {
    const { db, insert } = fakeDb([[], []]);

    await expect(insertSourceItemsForChunk(input, db)).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it("should still report a reclaimed claim when the source exists but belongs to another run", async () => {
    const { db, insert } = fakeDb([[], [{ id: "ks_1" }]]);

    await expect(insertSourceItemsForChunk(input, db)).rejects.toThrow("knowledge_source_reclaimed");
    expect(insert).not.toHaveBeenCalled();
  });
});
