import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb, getDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `kb_queue_day_skip_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
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

const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");
const { readNewRemainingToday } = await import("./knowledge-bit-review-queue-counts.repo.js");
const { getSubjectReviewDueCounts } = await import("./subject-review-due-counts.repo.js");

let client: pg.Client;

const NOW = new Date();
const CLOCK = { tz: "UTC", now: NOW };
const DAY_KEY = NOW.toISOString().slice(0, 10);
const DUE_AT = new Date(NOW.getTime() - 3_600_000);

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name) VALUES ('kept', 'Kept'), ('skipped', 'Skipped')`);
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('skipped_child', 'Child', 'skipped')`);
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

async function seedCard(subjectId: string, kind: "due" | "new"): Promise<string> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.')`,
    [variantId, bitId],
  );

  if (kind === "due") {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, card_key, ease_factor, interval_days, due_at, last_reviewed_at, review_count, phase)
       VALUES ($1, '', 2.5, 3, $2, $2, 1, 'review')`,
      [bitId, DUE_AT],
    );
  }

  return variantId;
}

async function setSkip(subjectIds: string[]): Promise<void> {
  await client.query(`DELETE FROM subject_day_skips`);

  for (const subjectId of subjectIds) {
    await client.query(`INSERT INTO subject_day_skips (subject_id, day_key) VALUES ($1, $2)`, [subjectId, DAY_KEY]);
  }
}

describe("review queue with skipped subjects (real Postgres)", () => {
  it("should leave a skipped subject's and its sub-subjects' cards out of the queue and counts", async () => {
    const keptDue = await seedCard("kept", "due");
    const skippedDue = await seedCard("skipped", "due");
    const childDue = await seedCard("skipped_child", "due");

    await setSkip(["skipped"]);

    const queue = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);
    const ids = queue.cards.map((card) => card.variantId);

    expect(ids).toContain(keptDue);
    expect(ids).not.toContain(skippedDue);
    expect(ids).not.toContain(childDue);
    expect(queue.counts.review).toBe(1);
  });

  it("should serve the skipped subject's cards again once nothing is skipped", async () => {
    await setSkip([]);

    const queue = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);

    expect(queue.counts.review).toBe(3);
  });

  it("should still serve a skipped subject's cards when the owner opens that subject directly", async () => {
    await setSkip(["skipped"]);

    const queue = await getKnowledgeBitReviewQueue(50, { subjectId: "skipped" }, CLOCK);

    expect(queue.cards).toHaveLength(2);
  });

  it("should leave a skipped subject out of the new-card allowance", async () => {
    await seedCard("kept", "new");
    await seedCard("skipped", "new");
    await setSkip([]);

    const before = (await readNewRemainingToday(CLOCK, getDb())).remaining;

    await setSkip(["skipped"]);

    const after = (await readNewRemainingToday(CLOCK, getDb())).remaining;

    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it("should flag a skipped subject in the due counts while still reporting its count", async () => {
    await setSkip(["skipped"]);

    const counts = await getSubjectReviewDueCounts(CLOCK);
    const byId = Object.fromEntries(counts.subjects.map((row) => [row.subjectId, row]));

    expect(byId.skipped).toMatchObject({ skipped: true, dueCount: 2 });
    expect(byId.skipped_child).toMatchObject({ skipped: true, dueCount: 1 });
    expect(byId.kept).toMatchObject({ skipped: false, dueCount: 1 });
  });
});
