import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import { cardKeySql } from "../knowledge-bit/knowledge-bit-card-key.js";
import {
  bitIdsWithAnyDraft,
  decideRewordedDraft,
  insertRewordedDrafts,
  listPendingRewordedDrafts,
} from "./card-rewording.repo.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `card_rewording_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const pool = new pg.Pool({ connectionString: url.toString() });
const db = drizzle(pool, { schema });
await migrate(db, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});

afterAll(async () => {
  await pool.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

async function seedBit(approvalState: string, withBasic = true): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await db.insert(schema.knowledgeSources).values({ id: sourceId, kind: "prose", rawText: "text", status: "pending" });
  await db
    .insert(schema.knowledgeBits)
    .values({ id: bitId, knowledgeSourceId: sourceId, ordinal: 0, body: "body", approvalState });

  if (withBasic) {
    await db.insert(schema.knowledgeBitQuestionVariants).values({
      id: `kbq_${randomUUID()}`,
      knowledgeBitId: bitId,
      kind: "basic",
      order: 0,
      prompt: `original ${bitId}`,
      answer: "the answer",
      cardKey: "",
    });
  }

  return bitId;
}

const draft = (knowledgeBitId: string, prompt: string) => ({
  knowledgeBitId,
  prompt,
  answer: "the answer",
  angle: "cause" as const,
  modelId: "test-model",
});

describe("card rewording drafts repo (real Postgres)", () => {
  it("should show an approved card's undecided drafts next to its original front", async () => {
    const bitId = await seedBit("approved");

    await insertRewordedDrafts(db, [draft(bitId, "reworded one"), draft(bitId, "reworded two")]);

    const pending = (await listPendingRewordedDrafts(db, 50)).filter((row) => row.knowledgeBitId === bitId);

    expect(pending.map((row) => row.prompt).sort()).toEqual(["reworded one", "reworded two"]);
    expect(pending[0]?.originalPrompt).toBe(`original ${bitId}`);
    expect(pending[0]?.answer).toBe("the answer");
  });

  it("should hide decided drafts and drafts of cards that are no longer approved", async () => {
    const decidedBit = await seedBit("approved");
    const rejectedBit = await seedBit("rejected");

    await insertRewordedDrafts(db, [draft(decidedBit, "decided"), draft(rejectedBit, "orphaned")]);
    await db
      .update(schema.knowledgeBitRewordedDrafts)
      .set({ decision: "rejected", decidedAt: new Date() })
      .where(eq(schema.knowledgeBitRewordedDrafts.knowledgeBitId, decidedBit));

    const prompts = (await listPendingRewordedDrafts(db, 500)).map((row) => row.prompt);

    expect(prompts).not.toContain("decided");
    expect(prompts).not.toContain("orphaned");
  });

  it("should respect the limit", async () => {
    const bitId = await seedBit("approved");

    await insertRewordedDrafts(db, [draft(bitId, "a"), draft(bitId, "b"), draft(bitId, "c")]);

    expect(await listPendingRewordedDrafts(db, 2)).toHaveLength(2);
  });

  it("should report cards with any draft, including decided ones, so they are never regenerated", async () => {
    const withDecided = await seedBit("approved");
    const withPending = await seedBit("approved");
    const without = await seedBit("approved");

    await insertRewordedDrafts(db, [draft(withDecided, "x"), draft(withPending, "y")]);
    await db
      .update(schema.knowledgeBitRewordedDrafts)
      .set({ decision: "approved", decidedAt: new Date() })
      .where(eq(schema.knowledgeBitRewordedDrafts.knowledgeBitId, withDecided));

    const found = await bitIdsWithAnyDraft(db, [withDecided, withPending, without]);

    expect([...found].sort()).toEqual([withDecided, withPending].sort());
    expect(await bitIdsWithAnyDraft(db, [])).toEqual(new Set());
  });

  it("should remove drafts when their card is deleted", async () => {
    const bitId = await seedBit("approved");

    await insertRewordedDrafts(db, [draft(bitId, "gone")]);
    await db.delete(schema.knowledgeBits).where(eq(schema.knowledgeBits.id, bitId));

    expect((await bitIdsWithAnyDraft(db, [bitId])).size).toBe(0);
  });
});

async function seedDraft(approvalState = "approved"): Promise<{ bitId: string; draftId: string }> {
  const bitId = await seedBit(approvalState);

  await db.insert(schema.knowledgeBitSchedules).values({ knowledgeBitId: bitId, cardKey: "" });
  await insertRewordedDrafts(db, [draft(bitId, `reworded ${bitId}`)]);

  const [row] = await db
    .select({ id: schema.knowledgeBitRewordedDrafts.id })
    .from(schema.knowledgeBitRewordedDrafts)
    .where(eq(schema.knowledgeBitRewordedDrafts.knowledgeBitId, bitId));

  return { bitId, draftId: row?.id ?? "" };
}

const rewordedVariants = (bitId: string) =>
  db
    .select({
      id: schema.knowledgeBitQuestionVariants.id,
      order: schema.knowledgeBitQuestionVariants.order,
      prompt: schema.knowledgeBitQuestionVariants.prompt,
      answer: schema.knowledgeBitQuestionVariants.answer,
      supersededAt: schema.knowledgeBitQuestionVariants.supersededAt,
      scheduleKey: sql<string>`${cardKeySql(schema.knowledgeBitQuestionVariants.kind, schema.knowledgeBitQuestionVariants.order)}`,
    })
    .from(schema.knowledgeBitQuestionVariants)
    .where(
      and(
        eq(schema.knowledgeBitQuestionVariants.knowledgeBitId, bitId),
        eq(schema.knowledgeBitQuestionVariants.kind, "reworded"),
      ),
    );

describe("deciding a reworded draft (real Postgres)", () => {
  it("should add an active reworded version on the card's existing schedule when approved", async () => {
    const { bitId, draftId } = await seedDraft();

    const result = await decideRewordedDraft(db, draftId, "approved");
    const variants = await rewordedVariants(bitId);
    const schedules = await db
      .select()
      .from(schema.knowledgeBitSchedules)
      .where(eq(schema.knowledgeBitSchedules.knowledgeBitId, bitId));

    expect(result.status).toBe("ok");
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ prompt: `reworded ${bitId}`, answer: "the answer", supersededAt: null, scheduleKey: "" });
    expect(schedules.map((row) => row.cardKey)).toEqual([""]);
    expect((await listPendingRewordedDrafts(db, 500)).map((row) => row.id)).not.toContain(draftId);
  });

  it("should give each later approved version of the same card the next free slot", async () => {
    const bitId = await seedBit("approved");

    await insertRewordedDrafts(db, [draft(bitId, "first"), draft(bitId, "second")]);

    const drafts = await db
      .select()
      .from(schema.knowledgeBitRewordedDrafts)
      .where(eq(schema.knowledgeBitRewordedDrafts.knowledgeBitId, bitId));

    for (const row of drafts) {
      await decideRewordedDraft(db, row.id, "approved");
    }

    expect((await rewordedVariants(bitId)).map((row) => row.order).sort()).toEqual([0, 1]);
  });

  it("should create nothing when rejected and keep the draft from coming back", async () => {
    const { bitId, draftId } = await seedDraft();

    const result = await decideRewordedDraft(db, draftId, "rejected");

    expect(result).toEqual({ status: "ok", variantId: null });
    expect(await rewordedVariants(bitId)).toHaveLength(0);
    expect((await listPendingRewordedDrafts(db, 500)).map((row) => row.id)).not.toContain(draftId);
    expect((await bitIdsWithAnyDraft(db, [bitId])).has(bitId)).toBe(true);
  });

  it("should refuse a second decision on the same draft", async () => {
    const { bitId, draftId } = await seedDraft();

    await decideRewordedDraft(db, draftId, "approved");

    expect(await decideRewordedDraft(db, draftId, "rejected")).toEqual({ status: "conflict" });
    expect(await decideRewordedDraft(db, draftId, "approved")).toEqual({ status: "conflict" });
    expect(await rewordedVariants(bitId)).toHaveLength(1);
  });

  it("should refuse to decide a draft whose card is no longer approved", async () => {
    const { bitId, draftId } = await seedDraft("rejected");

    expect(await decideRewordedDraft(db, draftId, "approved")).toEqual({ status: "conflict" });
    expect(await rewordedVariants(bitId)).toHaveLength(0);
  });

  it("should report an unknown draft as not found", async () => {
    expect(await decideRewordedDraft(db, "kbrd_missing", "approved")).toEqual({ status: "not_found" });
  });
});
