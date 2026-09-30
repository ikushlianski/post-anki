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

const dbName = `search_knowledge_items_${randomUUID().replace(/-/g, "_")}`;
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

const { searchKnowledgeItems } = await import("./search-knowledge-items.tool.js");

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

async function seedTopic(
  curriculumName: string,
  topicTitle: string,
): Promise<{ topicId: string; curriculumId: string }> {
  const subjectId = id("sub");
  const curriculumId = id("target");
  const moduleId = id("mod");
  const topicId = id("top");

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, curriculumName],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Module 1"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, topicTitle],
  );

  return { topicId, curriculumId };
}

async function insertCardSet(
  topicId: string,
  status: string,
  cards: { concept: string; prompt: string; answer: string }[],
): Promise<void> {
  const cardSetId = id("cardset");

  await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, $3)`, [
    cardSetId,
    topicId,
    status,
  ]);

  for (let i = 0; i < cards.length; i += 1) {
    const cardId = id("card");
    const card = cards[i]!;

    await client.query(
      `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, $3, $4)`,
      [cardId, cardSetId, i + 1, card.concept],
    );
    await client.query(
      `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer) VALUES ($1, $2, 1, $3, $4)`,
      [id("variant"), cardId, card.prompt, card.answer],
    );
  }
}

describe("searchKnowledgeItems", () => {
  it("also returns matching course names and topic titles", async () => {
    const { topicId, curriculumId } = await seedTopic("Closures deep dive", "Closure scoping");

    await insertCardSet(topicId, "ready", [
      { concept: "Closure basics", prompt: "What is a closure?", answer: "A bundled scope." },
    ]);
    await seedTopic("Unrelated course", "Unrelated topic");

    const result = await searchKnowledgeItems({ query: "closure" });

    expect(result.cards.map((card) => card.concept)).toContain("Closure basics");
    expect(result.courses).toContainEqual({ id: curriculumId, name: "Closures deep dive" });
    expect(result.topics).toContainEqual({
      id: topicId,
      title: "Closure scoping",
      curriculumId,
    });
  });

  it("matches a query containing % or _ literally through the full tool, cards included", async () => {
    const { topicId } = await seedTopic("Pricing course", "Pricing topic");

    await insertCardSet(topicId, "ready", [
      { concept: "Discount rule", prompt: "What is 50%_off?", answer: "Half price, no more." },
      { concept: "Wildcard decoy", prompt: "What is 50 percent off?", answer: "No discount here." },
    ]);

    const result = await searchKnowledgeItems({ query: "50%_off" });

    expect(result.cards.map((card) => card.concept)).toEqual(["Discount rule"]);
  });

  it("matches an underscore literally against course names and topic titles, not as a wildcard", async () => {
    const { curriculumId: literalCurriculumId, topicId: literalTopicId } = await seedTopic(
      "A_B course",
      "A_B topic",
    );
    await seedTopic("AxB course", "AxB topic");

    const result = await searchKnowledgeItems({ query: "A_B" });

    expect(result.courses.map((course) => course.id)).toEqual([literalCurriculumId]);
    expect(result.topics.map((topic) => topic.id)).toEqual([literalTopicId]);
  });

  it("matches a percent sign literally against course names and topic titles, not as a wildcard", async () => {
    const { curriculumId: literalCurriculumId, topicId: literalTopicId } = await seedTopic(
      "A%B course",
      "A%B topic",
    );
    await seedTopic("AxxxB course", "AxxxB topic");

    const result = await searchKnowledgeItems({ query: "A%B" });

    expect(result.courses.map((course) => course.id)).toEqual([literalCurriculumId]);
    expect(result.topics.map((topic) => topic.id)).toEqual([literalTopicId]);
  });

  it("matches a literal backslash against course names and topic titles, not as an escape character", async () => {
    const { curriculumId: literalCurriculumId, topicId: literalTopicId } = await seedTopic(
      "path\\_B course",
      "path\\_B topic",
    );
    await seedTopic("path\\qB course", "path\\qB topic");

    const result = await searchKnowledgeItems({ query: "path\\_B" });

    expect(result.courses.map((course) => course.id)).toEqual([literalCurriculumId]);
    expect(result.topics.map((topic) => topic.id)).toEqual([literalTopicId]);
  });
});
