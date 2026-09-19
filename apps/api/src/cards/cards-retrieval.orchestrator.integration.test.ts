import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const dbName = `cards_retrieval_orch_${randomUUID().replace(/-/g, "_")}`;
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

const { findTopMatchingCards } = await import("./cards-retrieval.orchestrator.js");

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
  embedding: number[] | null,
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
    "Retrieval test subject",
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
    `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer, embedding)
     VALUES ($1, $2, 1, $3, $4, $5)`,
    [variantId, cardId, prompt, answer, embedding ? JSON.stringify(embedding) : null],
  );

  return variantId;
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    const data = body.input.map((_text, index) => ({ index, embedding: [1, 0] }));

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

describe("findTopMatchingCards", () => {
  it("makes no embedding call when no variants are embedded yet", async () => {
    await seedTopicWithCardVariant("Not embedded", "Answer", null);

    const results = await findTopMatchingCards("anything", 10);

    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ranks the closest-matching card highest", async () => {
    const closeId = await seedTopicWithCardVariant("What is a closure?", "A bundled scope.", [1, 0]);
    const farId = await seedTopicWithCardVariant("What is CSS?", "Styling language.", [0, 1]);

    const results = await findTopMatchingCards("closures", 10);

    expect(results[0]!.variantId).toBe(closeId);
    expect(results.map((r) => r.variantId)).toContain(farId);
    expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
  });

  it("caps results at topK", async () => {
    await seedTopicWithCardVariant("Q1", "A1", [1, 0]);
    await seedTopicWithCardVariant("Q2", "A2", [1, 0]);
    await seedTopicWithCardVariant("Q3", "A3", [1, 0]);

    const results = await findTopMatchingCards("anything", 2);

    expect(results).toHaveLength(2);
  });

  it("excludes variants with no embedding yet", async () => {
    const embeddedId = await seedTopicWithCardVariant("Embedded", "Answer", [1, 0]);
    const unembeddedId = await seedTopicWithCardVariant("Not embedded 2", "Answer", null);

    const results = await findTopMatchingCards("anything", 1000);
    const ids = results.map((r) => r.variantId);

    expect(ids).toContain(embeddedId);
    expect(ids).not.toContain(unembeddedId);
  });
});
