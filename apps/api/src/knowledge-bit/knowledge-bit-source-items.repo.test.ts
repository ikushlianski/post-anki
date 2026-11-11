import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { getTriageEnabled } from "../admin-settings/admin-settings.repo.js";
import { supersedeOtherVariantsIn } from "./knowledge-bit-triage.repo.js";
import { insertSourceItemsForChunk } from "./knowledge-bit-source-items.repo.js";

vi.mock("./knowledge-bit-duplicate-gate.js", () => ({
  findExistingCardKeys: vi.fn(async () => new Set<string>()),
  dropDuplicateCards: vi.fn(async (_db: unknown, lessons: unknown[]) => ({ lessons, skippedCards: 0 })),
}));
vi.mock("../admin-settings/admin-settings.repo.js", () => ({ getTriageEnabled: vi.fn(async () => true) }));
vi.mock("./knowledge-bit-triage.repo.js", () => ({ supersedeOtherVariantsIn: vi.fn(async () => []) }));
vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_1`) }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

function fakeDb(sourceUrl: string | null, kind = "general") {
  const bitRows: Record<string, unknown>[] = [];
  const selectChain = { from: vi.fn(), where: vi.fn(), for: vi.fn(), orderBy: vi.fn() };

  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.for.mockResolvedValue([{ id: "ks_1", sourceUrl, kind }]);
  selectChain.orderBy.mockResolvedValue([{ id: "kbqv_1" }, { id: "kbqv_2" }]);

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

  it("should mark a web-enriched item as AI-generated and link it to the pages it used", async () => {
    const { db, bitRows } = fakeDb("https://example.com/article");
    const webSources = ["https://example.com/deal-qualification"];

    await insertSourceItemsForChunk({ ...input, items: [{ ...input.items[0]!, webSources }] }, db);

    expect(bitRows[0]).toMatchObject({ isAiGenerated: true, sourceLinks: webSources });
  });

  it("should keep the article link and mark the item human-made when no web source was used", async () => {
    const { db, bitRows } = fakeDb("https://example.com/article");

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ isAiGenerated: false, sourceLinks: ["https://example.com/article"] });
  });
});

describe("insertSourceItemsForChunk triage setting", () => {
  it("should save new cards as approved and decided when triage is off", async () => {
    vi.mocked(getTriageEnabled).mockResolvedValueOnce(false);
    const { db, bitRows } = fakeDb(null);

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ approvalState: "approved", decidedAt: expect.any(Date) });
  });

  it("should send new cards to triage when triage is on", async () => {
    const { db, bitRows } = fakeDb(null);

    await insertSourceItemsForChunk(input, db);

    expect(bitRows[0]).toMatchObject({ approvalState: "pending" });
    expect(bitRows[0]).not.toHaveProperty("decidedAt");
  });

  it("should keep only the first variant of an auto-approved phrase card", async () => {
    vi.mocked(getTriageEnabled).mockResolvedValueOnce(false);
    const { db } = fakeDb(null, "phrase");

    await insertSourceItemsForChunk(input, db);

    expect(supersedeOtherVariantsIn).toHaveBeenCalledWith(expect.anything(), "kb_1", ["kbqv_1"]);
  });

  it("should leave every variant of a phrase card alone when triage is on", async () => {
    vi.mocked(supersedeOtherVariantsIn).mockClear();
    const { db } = fakeDb(null, "phrase");

    await insertSourceItemsForChunk(input, db);

    expect(supersedeOtherVariantsIn).not.toHaveBeenCalled();
  });

  it("should keep a validator-flagged card pending for a human look even when triage is off", async () => {
    vi.mocked(getTriageEnabled).mockResolvedValueOnce(false);
    const { db, bitRows } = fakeDb(null);
    const flaggedLesson = { ...input.items[0]!, statement: "Flagged" };

    await insertSourceItemsForChunk(
      { ...input, items: [], flagged: [{ lesson: flaggedLesson, reason: "non_native_phrase" } as never] },
      db,
    );

    expect(bitRows[0]).toMatchObject({ approvalState: "pending", reviewFlag: "non_native_phrase" });
    expect(bitRows[0]).not.toHaveProperty("decidedAt");
  });
});
