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

const dbName = `kb_overview_delete_${randomUUID().replace(/-/g, "_")}`;
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
const { listKnowledgeBitOverview } = await import("./knowledge-bit-overview.repo.js");
const { deleteKnowledgeBitsBulk } = await import("./knowledge-bit-delete.repo.js");

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

const NOW = new Date("2026-10-10T12:00:00.000Z");

async function seedSubject(name: string, parentId: string | null = null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, name, parentId]);

  return id;
}

async function seedBit(subjectId: string | null, approvalState = "approved", body = "Fact"): Promise<string> {
  const bitId = `kb_${randomUUID()}`;
  const sourceId = `ks_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, subject_id) VALUES ($1, 'paste', $2)`, [sourceId, subjectId]);
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, $4)`,
    [bitId, sourceId, body, approvalState],
  );

  return bitId;
}

async function seedVariant(bitId: string, prompt = "Q?", answer = "A."): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'wh_question', 0, $3, $4)`,
    [id, bitId, prompt, answer],
  );

  return id;
}

async function count(table: string, column: string, value: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [value]);

  return result.rows[0].n;
}

describe("listKnowledgeBitOverview (real Postgres)", () => {
  it("should list approved cards of a subject and its descendants but not other subjects or pending bits", async () => {
    const parent = await seedSubject("Parent");
    const child = await seedSubject("Child", parent);
    const other = await seedSubject("Other");
    const inChild = await seedBit(child);
    const inOther = await seedBit(other);
    const pending = await seedBit(parent, "pending");

    for (const id of [inChild, inOther, pending]) {
      await seedVariant(id);
    }

    const page = await listKnowledgeBitOverview({ subjectId: parent, limit: 50, offset: 0 }, NOW);

    expect(page.items.map((item) => item.knowledgeBitId)).toEqual([inChild]);
  });

  it("should match search text literally including percent signs", async () => {
    const subject = await seedSubject("Search");
    const hit = await seedBit(subject);
    const miss = await seedBit(subject);

    await seedVariant(hit, "Is 100% sure?", "Yes");
    await seedVariant(miss, "Is 1000 sure?", "No");

    const page = await listKnowledgeBitOverview({ subjectId: subject, q: "100%", limit: 50, offset: 0 }, NOW);

    expect(page.items.map((item) => item.knowledgeBitId)).toEqual([hit]);
  });

  it("should report a suspended schedule as suspended state", async () => {
    const subject = await seedSubject("State");
    const bit = await seedBit(subject);

    await seedVariant(bit);
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, phase, suspended_at, lapses) VALUES ($1, 'review', now(), 2)`,
      [bit],
    );

    const page = await listKnowledgeBitOverview({ subjectId: subject, limit: 50, offset: 0 }, NOW);

    expect(page.items[0]).toMatchObject({ state: "suspended", lapses: 2 });
  });
});

describe("deleteKnowledgeBitsBulk (real Postgres)", () => {
  it("should remove an approved bit with its dependents but keep its feedback rows", async () => {
    const subject = await seedSubject("Delete");
    const bit = await seedBit(subject);
    const variant = await seedVariant(bit);

    await client.query(
      `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback) VALUES ($1, $2, 'a', 1, 'ok', 'f')`,
      [`att_${randomUUID()}`, variant],
    );
    await client.query(`INSERT INTO knowledge_bit_schedules (knowledge_bit_id) VALUES ($1)`, [bit]);

    const result = await deleteKnowledgeBitsBulk([bit]);

    expect(result).toEqual({ deleted: [bit], skipped: [] });
    expect(await count("knowledge_bits", "id", bit)).toBe(0);
    expect(await count("knowledge_bit_question_variants", "knowledge_bit_id", bit)).toBe(0);
    expect(await count("knowledge_bit_variant_attempts", "variant_id", variant)).toBe(0);
    expect(await count("knowledge_bit_schedules", "knowledge_bit_id", bit)).toBe(0);
  });

  it("should skip pending and unknown ids and delete nothing for them", async () => {
    const subject = await seedSubject("Skip");
    const pending = await seedBit(subject, "pending");

    const result = await deleteKnowledgeBitsBulk([pending, "kb_missing"]);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([
      { id: pending, reason: "not_approved" },
      { id: "kb_missing", reason: "not_found" },
    ]);
    expect(await count("knowledge_bits", "id", pending)).toBe(1);
  });
});
