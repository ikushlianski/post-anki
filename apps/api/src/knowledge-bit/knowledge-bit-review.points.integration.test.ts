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

const dbName = `kb_review_points_${randomUUID().replace(/-/g, "_")}`;
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
const { rebuildReviewPoints } = await import("../gamification/rebuild-review-points.js");
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

async function countLedgerRows(knowledgeBitId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total FROM review_point_events WHERE knowledge_bit_id = $1`,
    [knowledgeBitId],
  );

  return rows[0].total;
}

async function sumLive(knowledgeBitId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT coalesce(sum(points), 0)::int AS total FROM review_point_events WHERE knowledge_bit_id = $1 AND voided_at IS NULL`,
    [knowledgeBitId],
  );

  return rows[0].total;
}

describe("review points through grading and undo (real Postgres)", () => {
  it("should award one point for any graded review and write exactly one ledger row", async () => {
    const bit = await seedBit();
    const variantId = await seedVariant(bit);

    for (const [i, g] of (["again", "good", "easy"] as const).entries()) {
      const outcome = await recordKnowledgeBitReview(
        { variantId, grade: g, durationMs: 300 },
        new Date(`2026-10-10T1${i}:00:00Z`),
      );

      expect(outcome).toMatchObject({ ok: true, points: { awarded: 1, reason: "awarded" } });
    }

    expect(await countLedgerRows(bit)).toBe(3);
    expect(await sumLive(bit)).toBe(3);
  });

  it("should return identical points and add no ledger row when the same requestId is retried", async () => {
    const bit = await seedBit();
    const variantId = await seedVariant(bit);
    const requestId = randomUUID();

    const first = await recordKnowledgeBitReview({ variantId, grade: "good", requestId }, new Date("2026-10-12T00:00:00Z"));
    const retried = await recordKnowledgeBitReview({ variantId, grade: "good", requestId }, new Date("2026-10-12T00:00:09Z"));

    expect(retried).toEqual(first);
    expect(await countLedgerRows(bit)).toBe(1);
  });

  it("should take the point back when the review is undone and pay once after a regrade", async () => {
    const bit = await seedBit();
    const variantId = await seedVariant(bit);
    const graded = await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-13T00:00:00Z"));

    if (!graded.ok) {
      throw new Error("grade failed");
    }

    await undoKnowledgeBitReview(graded.reviewId);

    expect(await sumLive(bit)).toBe(0);

    await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-13T00:01:00Z"));

    expect(await sumLive(bit)).toBe(1);
    expect(await countLedgerRows(bit)).toBe(2);
  });

  it("should record the card's subject on the ledger row at award time", async () => {
    const bit = await seedBit();
    const variantId = await seedVariant(bit);
    const subjectId = `sub_${randomUUID()}`;

    await client.query(`INSERT INTO subjects (id, name) VALUES ($1, 'Biology')`, [subjectId]);
    await client.query(`INSERT INTO knowledge_sources (id, kind, subject_id) SELECT knowledge_source_id, 'text', $1 FROM knowledge_bits WHERE id = $2`, [subjectId, bit]);
    await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-14T00:00:00Z"));

    const { rows } = await client.query(`SELECT subject_id, event_type FROM review_point_events WHERE knowledge_bit_id = $1`, [bit]);

    expect(rows).toEqual([{ subject_id: subjectId, event_type: "review" }]);
  });

  it("should rebuild missing ledger rows from history once, and a second run changes nothing", async () => {
    const bit = await seedBit();
    const variantId = await seedVariant(bit);

    await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-15T00:00:00Z"));
    await recordKnowledgeBitReview({ variantId, grade: "good" }, new Date("2026-10-16T00:00:00Z"));
    await client.query(`DELETE FROM review_point_events WHERE knowledge_bit_id = $1`, [bit]);

    await rebuildReviewPoints();
    const afterFirst = await sumLive(bit);
    await rebuildReviewPoints();

    expect(afterFirst).toBe(2);
    expect(await sumLive(bit)).toBe(afterFirst);
    expect(await countLedgerRows(bit)).toBe(2);
  });
});
