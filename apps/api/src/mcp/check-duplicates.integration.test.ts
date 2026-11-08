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

const dbName = `check_duplicates_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";


const { checkDuplicates } = await import("./check-duplicates.tool.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedSubject(name: string): Promise<string> {
  const subjectId = id("sub");

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [subjectId, name]);

  return subjectId;
}

async function seedSource(subjectId: string, rawText: string, importKey: string | null): Promise<string> {
  const sourceId = id("ksrc");

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, import_key) VALUES ($1, 'prose', $2, 'detected', $3, $4)`,
    [sourceId, rawText, subjectId, importKey],
  );

  return sourceId;
}

describe("check_duplicates against a real database", () => {
  it("should flag a draft whose exact text was already added and name its subject", async () => {
    const subjectId = await seedSubject("Sales");
    const sourceId = await seedSource(subjectId, "Cold outreach works best on Tuesdays", null);

    const result = await checkDuplicates({
      drafts: [{ text: "Cold outreach works best on Tuesdays" }, { text: "Something brand new" }],
    });

    expect(result.items[0]).toMatchObject({
      exists: true,
      sources: [{ id: sourceId, subjectName: "Sales", matchedBy: "text", match: "exact" }],
    });
    expect(result.items[1]).toMatchObject({ exists: false, sources: [], knowledgeBits: [], cards: [] });
  });

  it("should match an already-imported note by its exact import key even when the text changed", async () => {
    const subjectId = await seedSubject("Imports");
    const sourceId = await seedSource(subjectId, "Original wording", "anki:abc12345");

    const result = await checkDuplicates({ drafts: [{ text: "Edited wording", key: "anki:abc12345" }] });

    expect(result.items[0]).toMatchObject({ exists: true, sources: [{ id: sourceId, matchedBy: "key" }] });
  });

  it("should only report matches in the requested subject", async () => {
    const a = await seedSubject("A");
    const b = await seedSubject("B");

    await seedSource(a, "Shared sentence in A", null);

    const inB = await checkDuplicates({ drafts: [{ text: "Shared sentence in A" }], subjectId: b });
    const inA = await checkDuplicates({ drafts: [{ text: "Shared sentence in A" }], subjectId: a });

    expect(inB.items[0]!.exists).toBe(false);
    expect(inA.items[0]!.exists).toBe(true);
  });

  it("should treat quotes and SQL fragments in a draft as plain text", async () => {
    const text = "x'); DROP TABLE knowledge_sources; --";
    const subjectId = await seedSubject("Hostile");
    const sourceId = await seedSource(subjectId, text, null);

    const result = await checkDuplicates({ drafts: [{ text }] });

    expect(result.items[0]!.sources.map((s) => s.id)).toEqual([sourceId]);
  });

  it("should find an existing bit and a ready card with the same text", async () => {
    const subjectId = await seedSubject("Cards");
    const sourceId = await seedSource(subjectId, "parent source text", null);
    const bitId = id("kbit");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");
    const setId = id("set");
    const cardId = id("card");

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 1, 'Unique bit sentence', 'approved')`,
      [bitId, sourceId],
    );
    await client.query(`INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'C', 'confirmed')`, [curriculumId, subjectId]);
    await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'M', 1)`, [moduleId, curriculumId]);
    await client.query(`INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'T', 1)`, [topicId, moduleId, curriculumId]);
    await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, 'ready')`, [setId, topicId]);
    await client.query(`INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, 'Unique card concept')`, [cardId, setId]);

    const result = await checkDuplicates({
      drafts: [{ text: "Unique bit sentence" }, { text: "Unique card concept" }],
      subjectId,
    });

    expect(result.items[0]).toMatchObject({ exists: true, knowledgeBits: [{ id: bitId, sourceId }] });
    expect(result.items[1]).toMatchObject({ exists: true, cards: [{ id: cardId, topicId }] });
  });

  it("should match existing text that differs only in case, whitespace or punctuation, and report it as normalized", async () => {
    const subjectId = await seedSubject("Normalized");
    const sourceId = await seedSource(subjectId, "Raft: elects ONE leader, per term!", null);
    const exactId = await seedSource(subjectId, "raft elects one leader per term", null);
    const parentId = await seedSource(subjectId, "unrelated parent text", null);
    const bitId = id("kbit");

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 1, 'Über   2 Bücher gehören   zusammen.', 'approved')`,
      [bitId, parentId],
    );

    const result = await checkDuplicates({
      drafts: [{ text: "raft elects one leader per term" }, { text: "ÜBER 2 bücher gehören zusammen" }],
      subjectId,
    });

    expect(result.items[0]!.sources.map((s) => [s.id, s.match])).toEqual([
      [exactId, "exact"],
      [sourceId, "normalized"],
    ]);
    expect(result.items[1]).toMatchObject({ exists: true, knowledgeBits: [{ id: bitId, match: "normalized" }] });
  });

  it("should not fuzzy-match short drafts and should leave unrelated sentences alone", async () => {
    const subjectId = await seedSubject("Short");

    await seedSource(subjectId, "Hello, World!", null);
    await seedSource(subjectId, "A completely different long sentence", null);

    const result = await checkDuplicates({
      drafts: [{ text: "hello world" }, { text: "a completely different long sentence about cats" }],
      subjectId,
    });

    expect(result.items.map((i) => i.exists)).toEqual([false, false]);
  });
});
