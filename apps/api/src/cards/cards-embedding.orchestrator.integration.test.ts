import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

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

const dbName = `cards_embedding_orch_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { triggerCardEmbeddingScan } = await import("./cards-embedding.orchestrator.js");

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

async function seedTopicWithCardVariant(
  prompt: string,
  answer: string,
  embedding: number[] | null = null,
  embeddingHash: string | null = null,
): Promise<string> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("top");
  const cardSetId = id("cardset");
  const cardId = id("card");
  const variantId = id("variant");

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
    subjectId,
    "Embedding scan test subject",
  ]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Course"],
  );
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    moduleId,
    curriculumId,
    "Module 1",
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Topic 1"],
  );
  await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, 'ready')`, [
    cardSetId,
    topicId,
  ]);
  await client.query(
    `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, $3)`,
    [cardId, cardSetId, "Concept"],
  );
  await client.query(
    `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer, embedding, embedding_hash)
     VALUES ($1, $2, 1, $3, $4, $5, $6)`,
    [variantId, cardId, prompt, answer, embedding ? JSON.stringify(embedding) : null, embeddingHash],
  );

  return variantId;
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    const data = body.input.map((_text, index) => ({ index, embedding: padEmbedding([1, 2, 3]) }));

    return new Response(JSON.stringify({ data, model: body.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("triggerCardEmbeddingScan", () => {
  it("embeds a variant with no cached hash", async () => {
    const variantId = await seedTopicWithCardVariant("What is a closure?", "A bundled scope.");

    const result = await triggerCardEmbeddingScan();

    expect(result.embeddedCount).toBe(1);
    expect(result.reusedCount).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const { rows } = await client.query(
      `SELECT embedding, embedding_vec::text AS embedding_vec, embedding_hash, embedded_at FROM topic_card_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.embedding).toEqual(padEmbedding([1, 2, 3]));
    expect(JSON.parse(rows[0]!.embedding_vec)).toEqual(padEmbedding([1, 2, 3]));
    expect(rows[0]!.embedding_hash).not.toBeNull();
    expect(rows[0]!.embedded_at).not.toBeNull();
  });

  it("skips re-embedding a variant whose cached hash still matches its content", async () => {
    const { hashContent } = await import("@post-anki/core");
    const stableHash = hashContent("What is hoisting?\nDeclarations move up.");

    const variantId = await seedTopicWithCardVariant(
      "What is hoisting?",
      "Declarations move up.",
      [9, 9, 9],
      stableHash,
    );

    await triggerCardEmbeddingScan();

    const { rows } = await client.query(
      `SELECT embedding FROM topic_card_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.embedding).toEqual([9, 9, 9]);
  });

  it("re-embeds a variant whose content changed since its cached hash", async () => {
    const variantId = await seedTopicWithCardVariant(
      "What is a promise?",
      "A future value.",
      [5, 5, 5],
      "stale-hash-from-before-the-answer-changed",
    );

    await triggerCardEmbeddingScan();

    const { rows } = await client.query(
      `SELECT embedding FROM topic_card_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.embedding).toEqual(padEmbedding([1, 2, 3]));
  });

  it("makes zero embedding API calls on a rescan when nothing changed", async () => {
    const variantId = await seedTopicWithCardVariant(
      "What is currying?",
      "Partial application, one arg at a time.",
    );

    await triggerCardEmbeddingScan();

    const { rows: firstRows } = await client.query(
      `SELECT embedding, embedding_hash FROM topic_card_variants WHERE id = $1`,
      [variantId],
    );
    expect(firstRows[0]!.embedding).toEqual(padEmbedding([1, 2, 3]));

    vi.mocked(global.fetch).mockClear();

    const second = await triggerCardEmbeddingScan();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(second.embeddedCount).toBe(0);

    const { rows: secondRows } = await client.query(
      `SELECT embedding_hash FROM topic_card_variants WHERE id = $1`,
      [variantId],
    );
    expect(secondRows[0]!.embedding_hash).toBe(firstRows[0]!.embedding_hash);
  });
});
