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

const dbName = `knowledge_bit_pending_subjects_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { listPendingReviewSubjectCounts } = await import("./knowledge-bit-pending-subjects.repo.js");
const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-approval.repo.js");

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

async function seedSubject(id: string, name: string, parentId: string | null = null): Promise<void> {
  await client.query(`INSERT INTO subjects (id, name, kind, parent_id) VALUES ($1, $2, 'general', $3)`, [
    id,
    name,
    parentId,
  ]);
}

async function seedBit(subjectId: string | null, state = "pending", withVariant = true): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'A bit', $3)`,
    [id, sourceId, state],
  );

  if (withVariant) {
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       VALUES ($1, $2, 'wh_question', 0, 'P', 'A')`,
      [`kbqv_${randomUUID()}`, id],
    );
  }

  return id;
}

describe("listPendingReviewSubjectCounts (real Postgres)", () => {
  it("should count only pending cards that are ready, per subject, with a parent path", async () => {
    await seedSubject("sub_lang", "Languages");
    await seedSubject("sub_de", "German", "sub_lang");
    await seedSubject("sub_empty", "Empty");
    await seedBit("sub_de");
    await seedBit("sub_de");
    await seedBit("sub_de", "approved");
    await seedBit("sub_de", "pending", false);
    await seedBit("sub_lang");
    await seedBit(null);
    await seedBit("sub_empty", "rejected");

    const rows = await listPendingReviewSubjectCounts();

    expect(rows).toEqual([
      { subjectId: "sub_lang", name: "Languages", path: "Languages", pendingCount: 1 },
      { subjectId: "sub_de", name: "German", path: "Languages / German", pendingCount: 2 },
    ]);
  });
});

describe("listPendingKnowledgeBitsForReview subject filter (real Postgres)", () => {
  it("should return only the chosen subject's sources when a subject is given", async () => {
    await seedSubject("sub_a", "A");
    await seedSubject("sub_b", "B");
    await seedBit("sub_a");
    await seedBit("sub_b");

    const only = await listPendingKnowledgeBitsForReview(200, undefined, "sub_a");
    const all = await listPendingKnowledgeBitsForReview(200);

    expect(only.every((source) => source.subjectId === "sub_a")).toBe(true);
    expect(only).toHaveLength(1);
    expect(all.length).toBeGreaterThan(1);
  });
});
