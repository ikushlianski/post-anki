import { describe, expect, it, vi } from "vitest";
import { runCardKeyBackfill, type CardKeyBackfillClient, type UnkeyedVariant } from "./card-key-backfill.js";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";

function fakeClient(rows: UnkeyedVariant[]) {
  const setKeys = vi.fn(async () => undefined);
  const listUnkeyed = vi.fn(async (afterId: string | null, limit: number) =>
    rows.filter((row) => afterId === null || row.id > afterId).slice(0, limit),
  );

  return { client: { listUnkeyed, setKeys } satisfies CardKeyBackfillClient, setKeys };
}

const rows = ["a", "b", "c"].map((id) => ({ id, prompt: `Q ${id}?`, answer: "A" }));

describe("runCardKeyBackfill", () => {
  it("should count the cards that need a key without writing on a dry run", async () => {
    const { client, setKeys } = fakeClient(rows);

    expect(await runCardKeyBackfill(client, { apply: false, batchSize: 2 })).toBe(3);
    expect(setKeys).not.toHaveBeenCalled();
  });

  it("should write the same key the duplicate gate computes, in batches", async () => {
    const { client, setKeys } = fakeClient(rows);

    await runCardKeyBackfill(client, { apply: true, batchSize: 2 });

    expect(setKeys).toHaveBeenCalledTimes(2);
    expect(setKeys).toHaveBeenNthCalledWith(1, [
      { id: "a", cardKey: cardTextKey("Q a?", "A") },
      { id: "b", cardKey: cardTextKey("Q b?", "A") },
    ]);
  });
});
