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

const dbName = `kb_review_new_order_${randomUUID().replace(/-/g, "_")}`;
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

let client: pg.Client;

const CLOCK = { tz: "UTC", now: new Date("2090-03-10T12:00:00.000Z") };
const IMPORT_DAY = "2090-01-01T00:00:00.000Z";
const RECENT = "2090-03-01T00:00:00.000Z";

async function seedSubject(
  name: string,
  newCardOrder: string | null,
  parentId: string | null = null,
): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id, new_card_order) VALUES ($1, $2, $3, $4)`, [
    subjectId,
    name,
    parentId,
    newCardOrder,
  ]);

  return subjectId;
}

async function seedCard(subjectId: string, createdAt: string): Promise<string> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at) VALUES ($1, $2, 0, 'body', 'approved', $3)`,
    [bitId, sourceId, createdAt],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, created_at) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.', $3)`,
    [variantId, bitId, createdAt],
  );

  return variantId;
}

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

describe("review queue new card order (real Postgres)", () => {
  it("should serve recently added English cards before the bulk import while another subject stays oldest first", async () => {
    const english = await seedSubject("English", "newest-first");
    const history = await seedSubject("History", null);
    const englishImport = await seedCard(english, IMPORT_DAY);
    const englishRecent = await seedCard(english, RECENT);
    const historyImport = await seedCard(history, IMPORT_DAY);
    const historyRecent = await seedCard(history, RECENT);

    const { cards } = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);
    const order = (subjectId: string) =>
      cards.filter((card) => card.subjectId === subjectId).map((card) => card.variantId);

    expect(order(english)).toEqual([englishRecent, englishImport]);
    expect(order(history)).toEqual([historyImport, historyRecent]);
  });

  it("should let a sub-subject inherit its parent's newest-first order", async () => {
    const parent = await seedSubject("Languages", "newest-first");
    const child = await seedSubject("Spanish", null, parent);
    const old = await seedCard(child, IMPORT_DAY);
    const recent = await seedCard(child, RECENT);

    const { cards } = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);

    expect(cards.filter((card) => card.subjectId === child).map((card) => card.variantId)).toEqual([
      recent,
      old,
    ]);
  });

  it("should apply the order to a review scoped to the subject", async () => {
    const subject = await seedSubject("Writing", "newest-first");
    const old = await seedCard(subject, IMPORT_DAY);
    const recent = await seedCard(subject, RECENT);

    const { cards } = await getKnowledgeBitReviewQueue(50, { subjectId: subject }, CLOCK);

    expect(cards.map((card) => card.variantId)).toEqual([recent, old]);
  });
});
