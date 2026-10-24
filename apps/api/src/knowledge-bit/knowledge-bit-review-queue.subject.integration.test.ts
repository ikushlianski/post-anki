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

const dbName = `kb_review_subject_${randomUUID().replace(/-/g, "_")}`;
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

async function seedSubject(name: string): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, name]);

  return subjectId;
}

async function seedCard(subjectId: string | null): Promise<{ bitId: string; variantId: string }> {
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

  return { bitId, variantId };
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

describe("review queue card subject (real Postgres)", () => {
  it("should carry the source's subject on cards of the home queue and leave subject-less sources null", async () => {
    const subjectId = await seedSubject("Networking");
    const withSubject = await seedCard(subjectId);
    const withoutSubject = await seedCard(null);

    const { cards } = await getKnowledgeBitReviewQueue(50, undefined, CLOCK);
    const byVariant = new Map(cards.map((card) => [card.variantId, card.subjectId]));

    expect(byVariant.get(withSubject.variantId)).toBe(subjectId);
    expect(byVariant.get(withoutSubject.variantId)).toBeNull();
  });

  it("should carry the source's subject on cards of a subject-scoped and a bit-scoped review", async () => {
    const subjectId = await seedSubject("Databases");
    const { bitId, variantId } = await seedCard(subjectId);

    const scopedBySubject = await getKnowledgeBitReviewQueue(50, { subjectId }, CLOCK);
    const scopedByBit = await getKnowledgeBitReviewQueue(50, { knowledgeBitId: bitId }, CLOCK);

    expect(scopedBySubject.cards.map((card) => [card.variantId, card.subjectId])).toEqual([
      [variantId, subjectId],
    ]);
    expect(scopedByBit.cards.map((card) => card.subjectId)).toEqual([subjectId]);
  });
});
