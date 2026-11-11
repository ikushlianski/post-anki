import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { dropDuplicateCards } from "./knowledge-bit-duplicate-gate.js";
import { cardTextKey } from "./knowledge-bit-card-text-key.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

vi.mock("../shared/id.js", () => ({ newId: vi.fn((prefix: string) => `${prefix}_1`) }));

function fakeDb(existingKeys: string[]) {
  const where = vi.fn(async (_condition: unknown) => existingKeys.map((key) => ({ cardKey: key })));
  const select = vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where }) }) }));

  return { db: { select } as unknown as DbExecutor, select, where };
}

function lesson(question: string, answer: string): LessonDraft {
  return {
    statement: `${question} ${answer}`,
    quote: "q",
    example: null,
    cards: [{ kind: "basic", statement: "s", question, answer, quote: "q" }],
  };
}

describe("dropDuplicateCards", () => {
  it("should skip a card whose question and answer already exist", async () => {
    const { db } = fakeDb([cardTextKey("Capital of France?", "Paris")]);

    const result = await dropDuplicateCards(db, [lesson("Capital of France?", "Paris")]);

    expect(result.lessons).toEqual([null]);
    expect(result.skippedCards).toBe(1);
  });

  it("should keep a card that shares the answer but asks a different question", async () => {
    const { db } = fakeDb([cardTextKey("Capital of France?", "Paris")]);

    const result = await dropDuplicateCards(db, [lesson("Where is the Louvre?", "Paris")]);

    expect(result.lessons[0]).not.toBeNull();
    expect(result.skippedCards).toBe(0);
  });

  it("should collapse identical cards inside one batch to a single card", async () => {
    const { db } = fakeDb([]);

    const result = await dropDuplicateCards(db, [lesson("Q one?", "A"), lesson("q one", "a!")]);

    expect(result.lessons.map((entry) => entry !== null)).toEqual([true, false]);
    expect(result.skippedCards).toBe(1);
  });

  it("should look cards up with one query per batch", async () => {
    const { db, select } = fakeDb([]);

    await dropDuplicateCards(db, [lesson("A?", "1"), lesson("B?", "2"), lesson("C?", "3")]);

    expect(select).toHaveBeenCalledTimes(1);
  });

  it("should keep a regenerated card whose only twin was superseded by the regeneration", async () => {
    const { db, where } = fakeDb([]);

    const result = await dropDuplicateCards(db, [lesson("Capital of France?", "Paris")]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0] as never);

    expect(result.lessons[0]).not.toBeNull();
    expect(query.sql).toContain('"superseded_at" is null');
    expect(query.params).toEqual(expect.arrayContaining(["rejected", "superseded"]));
  });
});
