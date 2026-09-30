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

const dbName = `card_search_${randomUUID().replace(/-/g, "_")}`;
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

const { searchCards } = await import("./card-search.repo.js");

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

async function seedTopic(): Promise<{ topicId: string; curriculumId: string }> {
  const subjectId = id("sub");
  const curriculumId = id("target");
  const moduleId = id("mod");
  const topicId = id("top");

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Course"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Module 1"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Topic"],
  );

  return { topicId, curriculumId };
}

async function insertCardSet(
  topicId: string,
  status: string,
  cards: { concept: string; prompt: string; answer: string }[],
): Promise<string[]> {
  const cardSetId = id("cardset");

  await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, $3)`, [
    cardSetId,
    topicId,
    status,
  ]);

  const cardIds: string[] = [];

  for (let i = 0; i < cards.length; i += 1) {
    const cardId = id("card");
    const card = cards[i]!;

    cardIds.push(cardId);

    await client.query(
      `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, $3, $4)`,
      [cardId, cardSetId, i + 1, card.concept],
    );
    await client.query(
      `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer) VALUES ($1, $2, 1, $3, $4)`,
      [id("variant"), cardId, card.prompt, card.answer],
    );
  }

  return cardIds;
}

describe("searchCards", () => {
  it("returns each field mapped from its own owning column, not a swapped or borrowed id", async () => {
    const { topicId, curriculumId } = await seedTopic();
    const [cardId] = await insertCardSet(topicId, "ready", [
      { concept: "Field mapping check", prompt: "Zephyr question text", answer: "Zephyr response text" },
    ]);

    const rows = await searchCards("zephyr", 50);

    expect(rows).toEqual([
      {
        cardId,
        topicId,
        curriculumId,
        concept: "Field mapping check",
        prompt: "Zephyr question text",
        answer: "Zephyr response text",
      },
    ]);
  });

  it("matches ready cards by text in concept, prompt, or answer, case-insensitively", async () => {
    const { topicId, curriculumId } = await seedTopic();

    await insertCardSet(topicId, "ready", [
      { concept: "CLOSURE basics", prompt: "What is scope?", answer: "A binding region." },
      { concept: "Loops", prompt: "What is a Closure used for?", answer: "Repeats a block." },
      { concept: "Async", prompt: "What is a promise?", answer: "A future CLOSURE value." },
      { concept: "Unrelated", prompt: "Something else entirely", answer: "Nope." },
    ]);

    const rows = await searchCards("closure", 50);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.curriculumId === curriculumId)).toBe(true);
    expect(rows.map((row) => row.concept).sort()).toEqual(["Async", "CLOSURE basics", "Loops"]);
  });

  it("never returns cards from sets that are still generating", async () => {
    const { topicId: readyTopic } = await seedTopic();
    const { topicId: generatingTopic } = await seedTopic();

    await insertCardSet(readyTopic, "ready", [
      { concept: "Ready concept", prompt: "Ready prompt", answer: "Ready answer" },
    ]);
    await insertCardSet(generatingTopic, "generating", [
      { concept: "Stale concept", prompt: "Stale prompt", answer: "Stale answer" },
    ]);

    const rows = await searchCards("prompt", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Ready concept");
  });

  it("never returns cards from a set left failed by an unsuccessful regeneration over prior ready cards", async () => {
    const { topicId: readyTopic } = await seedTopic();
    const { topicId: failedTopic } = await seedTopic();

    await insertCardSet(readyTopic, "ready", [
      { concept: "Surviving concept", prompt: "Surviving prompt", answer: "Surviving answer" },
    ]);
    await insertCardSet(failedTopic, "failed", [
      { concept: "Stranded concept", prompt: "Surviving prompt leftover", answer: "Stranded answer" },
    ]);

    const rows = await searchCards("surviving", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Surviving concept");
  });

  it("matches a query containing both % and _ literally, not as combined wildcards", async () => {
    const { topicId } = await seedTopic();

    await insertCardSet(topicId, "ready", [
      { concept: "Discount code", prompt: "What is 50%_off?", answer: "Half price." },
      { concept: "Worded discount", prompt: "What is 50 percent off?", answer: "Half price too." },
    ]);

    const rows = await searchCards("50%_off", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Discount code");
  });

  it("matches a query containing % literally, not as a multi-character wildcard, with no underscore in play", async () => {
    const { topicId } = await seedTopic();

    await insertCardSet(topicId, "ready", [
      { concept: "Literal percent", prompt: "Contains A%B literally", answer: "yes" },
      { concept: "Wildcard decoy", prompt: "Contains AxxxB but no percent sign", answer: "no" },
    ]);

    const rows = await searchCards("A%B", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Literal percent");
  });

  it("matches a query containing _ literally, not as a single-character wildcard", async () => {
    const { topicId } = await seedTopic();

    await insertCardSet(topicId, "ready", [
      { concept: "Exact underscore", prompt: "What is a_c?", answer: "Literal a_c." },
      { concept: "Three letters", prompt: "What is abc?", answer: "The alphabet start." },
    ]);

    const rows = await searchCards("a_c", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Exact underscore");
  });

  it("matches a query containing a literal backslash, not as an escape character for the next character", async () => {
    const { topicId } = await seedTopic();

    await insertCardSet(topicId, "ready", [
      { concept: "Literal backslash", prompt: "Contains path\\_file exactly", answer: "yes" },
      { concept: "Wildcard decoy", prompt: "Contains path\\qfile instead", answer: "no" },
    ]);

    const rows = await searchCards("path\\_file", 50);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("Literal backslash");
  });

  it("caps results at the given limit", async () => {
    const { topicId } = await seedTopic();

    await insertCardSet(
      topicId,
      "ready",
      Array.from({ length: 5 }, (_, i) => ({
        concept: `Concept ${i}`,
        prompt: `Matching prompt ${i}`,
        answer: `Answer ${i}`,
      })),
    );

    const rows = await searchCards("matching", 3);

    expect(rows).toHaveLength(3);
  });
});
