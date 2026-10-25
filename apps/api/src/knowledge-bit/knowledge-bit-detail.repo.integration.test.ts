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

const dbName = `knowledge_bit_detail_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
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

const { getKnowledgeBitDetail } = await import("./knowledge-bit-detail.repo.js");

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

async function seedSubject(name: string, parentId: string | null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [
    id,
    name,
    parentId,
  ]);

  return id;
}

async function seedSource(subjectId: string | null, sourceUrl: string | null = null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, source_url) VALUES ($1, 'prose', 'Notes on indexes', 'pending', $2, $3)`,
    [id, subjectId, sourceUrl],
  );

  return id;
}

async function seedBit(
  sourceId: string,
  approvalState = "approved",
  background: string | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, background, approval_state, origin, created_at)
     VALUES ($1, $2, 0, 'Indexes speed up reads', $3, $4, 'extracted', '2026-01-01T00:00:00Z')`,
    [id, sourceId, background, approvalState],
  );

  return id;
}

async function seedVariant(
  bitId: string,
  kind: string,
  order: number,
  prompt: string,
  answer: string,
  sentence: string | null = null,
  superseded = false,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, sentence, superseded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`kbqv_${randomUUID()}`, bitId, kind, order, prompt, answer, sentence, superseded ? new Date() : null],
  );
}

async function seedTag(bitId: string, name: string): Promise<void> {
  const tagId = `tag_${randomUUID()}`;

  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $3)`, [
    tagId,
    name,
    `${name.toLowerCase()}_${tagId}`,
  ]);
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, 'knowledgeBit', $3)`,
    [`ta_${randomUUID()}`, tagId, bitId],
  );
}

describe("getKnowledgeBitDetail (real Postgres)", () => {
  it("should return every active phrasing with its own answer and sentence", async () => {
    const bit = await seedBit(await seedSource(null));

    await seedVariant(bit, "wh_question", 0, "Why index?", "To avoid full scans");
    await seedVariant(bit, "basic", 0, "What is an index?", "A lookup structure");
    await seedVariant(bit, "fill_in_the_blank", 0, "An ___ speeds reads", "index", "An index speeds reads");
    await seedVariant(bit, "basic", 1, "Old front", "old", null, true);

    const detail = await getKnowledgeBitDetail(bit);

    expect(detail?.phrasings.map((p) => [p.kindLabel, p.prompt, p.answer, p.sentence])).toEqual([
      ["Basic", "What is an index?", "A lookup structure", null],
      ["Fill in the blank", "An ___ speeds reads", "index", "An index speeds reads"],
      ["Why question", "Why index?", "To avoid full scans", null],
    ]);
    expect(detail?.body).toBe("Indexes speed up reads");
  });

  it("should include subject path, tags, source, context and review state", async () => {
    const top = await seedSubject("Programming", null);
    const mid = await seedSubject("Databases", top);
    const leaf = await seedSubject("Indexes", mid);
    const source = await seedSource(leaf, "https://example.com/post");
    const bit = await seedBit(source, "approved", "Used on large tables");

    await seedVariant(bit, "basic", 0, "Front", "Back");
    await seedTag(bit, "sql");
    await seedTag(bit, "performance");
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, phase, lapses, review_count) VALUES ($1, '2026-03-01T00:00:00Z', 'review', 2, 5)`,
      [bit],
    );

    const detail = await getKnowledgeBitDetail(bit, undefined, new Date("2026-02-01T00:00:00Z"));

    expect(detail?.subjectPath).toEqual(["Programming", "Databases", "Indexes"]);
    expect(detail?.tags).toEqual(["performance", "sql"]);
    expect(detail?.context).toBe("Used on large tables");
    expect(detail?.origin).toBe("article");
    expect(detail?.addedBy).toBe("you");
    expect(detail?.sourceId).toBe(source);
    expect(detail?.sourceUrl).toBe("https://example.com/post");
    expect(detail?.sourceLabel).toBe("example.com");
    expect(detail?.addedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(detail?.review).toEqual({
      state: "review",
      dueAt: "2026-03-01T00:00:00.000Z",
      lapses: 2,
      reviewCount: 5,
    });
  });

  it("should show a never reviewed piece as new with no due date and empty extras", async () => {
    const bit = await seedBit(await seedSource(null));

    await seedVariant(bit, "basic", 0, "Front", "Back");

    const detail = await getKnowledgeBitDetail(bit);

    expect(detail?.review).toEqual({ state: "new", dueAt: null, lapses: 0, reviewCount: 0 });
    expect(detail?.subjectPath).toEqual([]);
    expect(detail?.tags).toEqual([]);
    expect(detail?.context).toBeNull();
  });

  it("should show a suspended piece as suspended with no due date", async () => {
    const bit = await seedBit(await seedSource(null));

    await seedVariant(bit, "basic", 0, "Front", "Back");
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, due_at, suspended_at) VALUES ($1, '2026-03-01T00:00:00Z', now())`,
      [bit],
    );

    const detail = await getKnowledgeBitDetail(bit);

    expect(detail?.review.state).toBe("suspended");
    expect(detail?.review.dueAt).toBeNull();
  });

  it("should return nothing for an unknown id", async () => {
    expect(await getKnowledgeBitDetail("kb_does_not_exist")).toBeNull();
  });

  it("should return nothing for pending, rejected or phrasing-less pieces", async () => {
    const pending = await seedBit(await seedSource(null), "pending");
    const rejected = await seedBit(await seedSource(null), "rejected");
    const bare = await seedBit(await seedSource(null));

    await seedVariant(pending, "basic", 0, "p", "a");
    await seedVariant(rejected, "basic", 0, "r", "a");

    expect(await getKnowledgeBitDetail(pending)).toBeNull();
    expect(await getKnowledgeBitDetail(rejected)).toBeNull();
    expect(await getKnowledgeBitDetail(bare)).toBeNull();
  });

  it("should not write anything when reading a piece", async () => {
    const bit = await seedBit(await seedSource(null));

    await seedVariant(bit, "basic", 0, "Front", "Back");

    const before = await client.query(`SELECT count(*)::int AS n FROM knowledge_bit_schedules`);

    await getKnowledgeBitDetail(bit);

    const after = await client.query(`SELECT count(*)::int AS n FROM knowledge_bit_schedules`);

    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
