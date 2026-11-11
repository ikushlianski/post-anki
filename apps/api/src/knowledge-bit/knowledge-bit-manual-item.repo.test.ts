import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { getTriageEnabled } from "../admin-settings/admin-settings.repo.js";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";
import { findExistingCardKeys } from "./knowledge-bit-duplicate-gate.js";
import { insertManualKnowledgeItem } from "./knowledge-bit-manual-item.repo.js";

vi.mock("./knowledge-bit-duplicate-gate.js", () => ({
  findExistingCardKeys: vi.fn(async () => new Set<string>()),
  dropDuplicateCards: vi.fn(async (_db: unknown, lessons: unknown[]) => ({ lessons, skippedCards: 0 })),
}));
vi.mock("../admin-settings/admin-settings.repo.js", () => ({ getTriageEnabled: vi.fn(async () => true) }));
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

  it("should store a cloze note as plain body with one variant per gap number", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { note: "{{c1::A}} and {{c2::B}}" }, db);

    expect(inserted[0]).toMatchObject({ body: "A and B", origin: "manual" });
    expect(result.ok && result.item.variants.map((variant) => variant.answer)).toEqual(["A", "B"]);
  });

  it("should refuse an unclosed cloze note before writing anything", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { note: "{{c1::A" }, db);

    expect(result).toEqual({ ok: false, error: "invalid_cloze", reason: "unclosed" });
    expect(inserted).toEqual([]);
  });

  it("should default to not AI generated with no links when neither is given", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { front: "Q", back: "A" }, db);

    expect(inserted[0]).toMatchObject({ isAiGenerated: false, sourceLinks: null });
    expect(result.ok && result.item).toMatchObject({ isAiGenerated: false, sourceLinks: [] });
  });
});

describe("insertManualKnowledgeItem triage setting", () => {
  it("should save a typed card as approved when triage is off", async () => {
    vi.mocked(getTriageEnabled).mockResolvedValueOnce(false);
    const { db, inserted } = fakeDb();

    await insertManualKnowledgeItem("ksrc_1", { front: "Q", back: "A" }, db);

    expect(inserted[0]).toMatchObject({ approvalState: "approved", decidedAt: expect.any(Date) });
  });

  it("should save a typed card as pending when triage is on", async () => {
    const { db, inserted } = fakeDb();

    await insertManualKnowledgeItem("ksrc_1", { front: "Q", back: "A" }, db);

    expect(inserted[0]).toMatchObject({ approvalState: "pending" });
  });

  it("should refuse a typed card whose question and answer already exist", async () => {
    vi.mocked(findExistingCardKeys).mockResolvedValueOnce(new Set([cardTextKey("Q", "A")]));
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { front: "q?", back: "A." }, db);

    expect(result).toEqual({ ok: false, error: "duplicate_card" });
    expect(inserted).toHaveLength(0);
  });

  it("should keep a typed card that reuses an answer under a new question", async () => {
    const { db, inserted } = fakeDb();

    const result = await insertManualKnowledgeItem("ksrc_1", { front: "Other question", back: "A" }, db);

    expect(result.ok).toBe(true);
    expect(inserted.length).toBeGreaterThan(0);
  });
});
