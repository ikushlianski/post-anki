import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { insertManualKnowledgeItem } from "./knowledge-bit-manual-item.repo.js";

vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_1`) }));

function fakeDb() {
  const inserted: Record<string, unknown>[] = [];
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
  };

  selectChain.from.mockReturnValue(selectChain);
  selectChain.where
    .mockReturnValueOnce(selectChain)
    .mockResolvedValueOnce([{ maxOrdinal: null }]);
  selectChain.for.mockResolvedValue([{ id: "ksrc_1", status: "bits_detected", processedAt: null }]);

  const tx = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue({
      values: vi.fn(async (row: Record<string, unknown>) => {
        inserted.push(row);
      }),
    }),
  };
  const db = { transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };

  return { db: db as unknown as DbExecutor, inserted };
}

describe("insertManualKnowledgeItem AI label and source links", () => {
  it("should store an item drafted from web research with the AI flag and its links", async () => {
    const { db, inserted } = fakeDb();
    const sourceLinks = ["https://example.com/a", "https://example.org/b"];

    const result = await insertManualKnowledgeItem(
      "ksrc_1",
      { front: "Q", back: "A", aiGenerated: true, sourceLinks },
      db,
    );

    expect(inserted[0]).toMatchObject({ isAiGenerated: true, sourceLinks });
    expect(result.ok && result.item).toMatchObject({ isAiGenerated: true, sourceLinks });
  });

  it("should drop a source link that points at a private or unsafe address", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem(
      "ksrc_1",
      {
        front: "Q",
        back: "A",
        aiGenerated: true,
        sourceLinks: ["http://localhost/admin", "http://169.254.169.254/latest", "https://example.com/ok"],
      },
      db,
    );

    expect(inserted[0]).toMatchObject({ sourceLinks: ["https://example.com/ok"] });
    expect(result.ok && result.item.sourceLinks).toEqual(["https://example.com/ok"]);
  });

  it("should default to not AI generated with no links when neither is given", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { front: "Q", back: "A" }, db);

    expect(inserted[0]).toMatchObject({ isAiGenerated: false, sourceLinks: null });
    expect(result.ok && result.item).toMatchObject({ isAiGenerated: false, sourceLinks: [] });
  });
});
