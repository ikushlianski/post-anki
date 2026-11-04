import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `kb_review_rehearsal_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");
const { undoKnowledgeBitReview } = await import("./knowledge-bit-review-undo.orchestrator.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function seedBit(approvalState: "approved" | "pending" = "approved"): Promise<string> {
  const knowledgeBitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'TCP uses a three-way handshake.', $3)`,
    [knowledgeBitId, `ks_${randomUUID()}`, approvalState],
  );

  return knowledgeBitId;
}

async function seedVariant(knowledgeBitId: string, kind = "wh_question"): Promise<string> {
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, $3, 0, 'Why a handshake?', 'To agree on sequence numbers.')`,
    [variantId, knowledgeBitId, kind],
  );

  return variantId;
}

async function readScheduleRow(knowledgeBitId: string) {
  const { rows } = await client.query(
    `SELECT * FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1 AND card_key = ''`,
    [knowledgeBitId],
  );

  return rows[0] as Record<string, unknown> | undefined;
}

async function countRows(table: string, column: string, value: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [value]);

  return (rows[0] as { n: number }).n;
}

async function seedTwoWordings(): Promise<{ knowledgeBitId: string; whId: string; blankId: string }> {
  const knowledgeBitId = await seedBit();
  const whId = await seedVariant(knowledgeBitId, "wh_question");
  const blankId = await seedVariant(knowledgeBitId, "fill_in_the_blank");

  return { knowledgeBitId, whId, blankId };
}

describe("rehearsal review (real Postgres)", () => {
  it("should leave the schedule row byte-for-byte unchanged and log only an attempt", async () => {
    const { knowledgeBitId, whId, blankId } = await seedTwoWordings();

    await recordKnowledgeBitReview({ variantId: whId, grade: "good" }, new Date("2026-10-10T12:00:00.000Z"));

    const before = await readScheduleRow(knowledgeBitId);
    const outcome = await recordKnowledgeBitReview(
      { variantId: blankId, grade: "again", rehearsal: true },
      new Date("2026-10-10T12:05:00.000Z"),
    );

    expect(outcome).toMatchObject({ ok: true, followUp: null, points: { awarded: 0 } });
    expect(await readScheduleRow(knowledgeBitId)).toEqual(before);
    expect(await countRows("knowledge_bit_reviews", "knowledge_bit_id", knowledgeBitId)).toBe(1);
    expect(await countRows("knowledge_bit_variant_attempts", "variant_id", blankId)).toBe(1);
  });

  it("should write no schedule at all when the bit was never graded", async () => {
    const { knowledgeBitId, whId } = await seedTwoWordings();

    await recordKnowledgeBitReview({ variantId: whId, grade: "easy", rehearsal: true });

    expect(await readScheduleRow(knowledgeBitId)).toBeUndefined();
    expect(await countRows("knowledge_bit_reviews", "knowledge_bit_id", knowledgeBitId)).toBe(0);
  });

  it("should record one attempt when the same rehearsal request is replayed", async () => {
    const { whId } = await seedTwoWordings();
    const input = { variantId: whId, grade: "good" as const, rehearsal: true, requestId: randomUUID() };

    await recordKnowledgeBitReview(input);
    await recordKnowledgeBitReview(input);

    expect(await countRows("knowledge_bit_variant_attempts", "variant_id", whId)).toBe(1);
  });

  it("should offer the other wording as follow-up after a real good grade and none after again", async () => {
    const { whId, blankId } = await seedTwoWordings();

    const good = await recordKnowledgeBitReview({ variantId: whId, grade: "good" });
    const again = await recordKnowledgeBitReview({ variantId: whId, grade: "again" });

    expect(good).toMatchObject({ ok: true, followUp: { variantId: blankId, cardKey: "" } });
    expect(again).toMatchObject({ ok: true });
    expect(again.ok && again.followUp).toBeNull();
  });

  it("should offer no follow-up for a bit with a single wording", async () => {
    const knowledgeBitId = await seedBit();
    const variantId = await seedVariant(knowledgeBitId);

    const outcome = await recordKnowledgeBitReview({ variantId, grade: "good" });

    expect(outcome.ok && outcome.followUp).toBeNull();
  });

  it("should not find a rehearsal when undo is asked for it", async () => {
    const { whId } = await seedTwoWordings();
    const outcome = await recordKnowledgeBitReview({ variantId: whId, grade: "good", rehearsal: true });

    expect(outcome.ok).toBe(true);

    if (outcome.ok) {
      expect(await undoKnowledgeBitReview(outcome.reviewId)).toEqual({ ok: false, error: "review_not_found" });
    }
  });
});
