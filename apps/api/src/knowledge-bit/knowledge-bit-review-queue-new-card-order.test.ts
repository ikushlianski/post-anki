import { describe, expect, it, vi } from "vitest";
import { PgDialect, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { NewCardOrder } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { listPickedCards, listPickedNewCards } from "./knowledge-bit-review-queue-cards.repo.js";
import type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";

const fakePicked = pgTable("picked", {
  variantId: text("variant_id"),
  bitCreatedAt: timestamp("bit_created_at"),
  pickRank: text("pick_rank"),
  scheduleBitId: text("schedule_bit_id"),
  cardSubjectId: text("card_subject_id"),
}) as unknown as Picked;

const dialect = new PgDialect();
const NOW = new Date("2026-11-25T10:00:00Z");
const IMPORT_DAY = new Date("2026-11-15T10:00:00Z");
const RECENT = new Date("2026-11-20T10:00:00Z");

const row = (variantId: string, cardSubjectId: string | null, bitCreatedAt: Date) => ({
  variantId,
  knowledgeBitId: `bit-${variantId}`,
  kind: "basic",
  cardKey: "k",
  prompt: "p",
  context: null,
  answer: "a",
  sentence: null,
  background: null,
  body: null,
  reviewCount: null,
  isAiGenerated: false,
  aiSuggestion: null,
  sourceLinks: null,
  subjectId: cardSubjectId,
  cardSubjectId,
  bitCreatedAt,
  easeFactor: null,
  intervalDays: null,
  phase: null,
  learningStep: null,
  lapses: null,
  isNew: true,
});

function fakeDb(batches: ReturnType<typeof row>[][]) {
  const orderBy = vi.fn();
  let call = 0;
  const db = {
    select: () => {
      const rows = batches[call++] ?? [];
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: (...args: SQL[]) => {
          orderBy(...args);

          return chain;
        },
        limit: async () => rows,
        then: (resolve: (value: typeof rows) => void) => resolve(rows),
      };

      return chain;
    },
  } as unknown as DbExecutor;

  return { db, orderBy };
}

const sqlText = (chunk: SQL) => dialect.sqlToQuery(chunk).sql;
const allowance = { remainingFor: () => 100 };
const ids = (cards: { variantId: string }[]) => cards.map((card) => card.variantId);

describe("listPickedNewCards order", () => {
  it("should serve cards added after the bulk import first when the subject is newest-first", async () => {
    const { db, orderBy } = fakeDb([
      [row("imp-a", "english", IMPORT_DAY), row("imp-b", "english", IMPORT_DAY), row("recent", "english", RECENT)],
    ]);
    const cards = await listPickedNewCards(
      fakePicked,
      [{ subjectId: "english", fresh: 3 }],
      allowance,
      10,
      NOW,
      db,
      undefined,
      undefined,
      () => "newest-first",
    );

    expect(ids(cards)).toEqual(["recent", "imp-a", "imp-b"]);
    expect(sqlText(orderBy.mock.calls[0]![0])).toContain("desc");
    expect(sqlText(orderBy.mock.calls[0]![1])).not.toContain("desc");
  });

  it("should keep serving the oldest cards first when the subject is oldest-first", async () => {
    const { db, orderBy } = fakeDb([
      [row("recent", "history", RECENT), row("imp-b", "history", IMPORT_DAY), row("imp-a", "history", IMPORT_DAY)],
    ]);
    const cards = await listPickedNewCards(fakePicked, [{ subjectId: "history", fresh: 3 }], allowance, 10, NOW, db);

    expect(ids(cards)).toEqual(["imp-a", "imp-b", "recent"]);
    expect(sqlText(orderBy.mock.calls[0]![0])).not.toContain("desc");
  });

  it("should order a newest-first subject by its own setting while another subject in the same queue stays oldest-first", async () => {
    const { db, orderBy } = fakeDb([
      [row("en-recent", "english", RECENT), row("en-import", "english", IMPORT_DAY)],
      [row("hist-old", "history", IMPORT_DAY), row("hist-new", "history", RECENT)],
    ]);
    const orderFor = (subjectId: string | null): NewCardOrder =>
      subjectId === "english" ? "newest-first" : "oldest-first";
    const cards = await listPickedNewCards(
      fakePicked,
      [
        { subjectId: "english", fresh: 2 },
        { subjectId: "history", fresh: 2 },
      ],
      allowance,
      10,
      NOW,
      db,
      undefined,
      undefined,
      orderFor,
    );
    const byId = (subject: string) => ids(cards.filter((card) => card.subjectId === subject));

    expect(byId("english")).toEqual(["en-recent", "en-import"]);
    expect(byId("history")).toEqual(["hist-old", "hist-new"]);
    expect(sqlText(orderBy.mock.calls[0]![0])).toContain("desc");
    expect(sqlText(orderBy.mock.calls[1]![0])).not.toContain("desc");
  });

  it("should keep the variant id tiebreak inside a batch sharing one timestamp", async () => {
    const { db } = fakeDb([[row("b", "english", IMPORT_DAY), row("a", "english", IMPORT_DAY)]]);
    const cards = await listPickedNewCards(
      fakePicked,
      [{ subjectId: "english", fresh: 2 }],
      allowance,
      10,
      NOW,
      db,
      undefined,
      undefined,
      () => "newest-first",
    );

    expect(ids(cards)).toEqual(["a", "b"]);
  });

  it("should leave the shuffled path unaffected by the order setting", async () => {
    const orderFor = vi.fn((): NewCardOrder => "newest-first");
    const { db, orderBy } = fakeDb([[]]);

    await listPickedNewCards(
      fakePicked,
      [{ subjectId: "english", fresh: 1 }],
      allowance,
      10,
      NOW,
      db,
      undefined,
      "seed",
      orderFor,
    );

    expect(orderFor).not.toHaveBeenCalled();
    expect(orderBy).not.toHaveBeenCalled();
  });
});

describe("listPickedCards new order", () => {
  it("should sort new cards newest first only when asked", async () => {
    const newest = fakeDb([[]]);
    const oldest = fakeDb([[]]);

    await listPickedCards(fakePicked, "new", 5, NOW, newest.db, undefined, NOW, "newest-first");
    await listPickedCards(fakePicked, "new", 5, NOW, oldest.db);

    expect(sqlText(newest.orderBy.mock.calls[0]![0])).toContain("desc");
    expect(sqlText(oldest.orderBy.mock.calls[0]![0])).not.toContain("desc");
  });
});
