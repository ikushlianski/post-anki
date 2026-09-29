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

const dbName = `list_cards_for_curriculum_${randomUUID().replace(/-/g, "_")}`;
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

const { listCardsForCurriculum } = await import("./list-cards-for-curriculum.repo.js");

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

async function seedCurriculum(): Promise<string> {
  const subjectId = id("sub");
  const curriculumId = id("target");
  const moduleId = id("mod");

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Course"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Module 1"],
  );

  return curriculumId;
}

async function insertModule(curriculumId: string, order: number, title: string): Promise<string> {
  const moduleId = id("mod");

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`,
    [moduleId, curriculumId, title, order],
  );

  return moduleId;
}

async function insertTopic(
  curriculumId: string,
  title: string,
  moduleId?: string,
  order = 1,
): Promise<string> {
  const resolvedModuleId =
    moduleId ??
    (
      await client.query<{ id: string }>(`SELECT id FROM modules WHERE curriculum_id = $1 LIMIT 1`, [
        curriculumId,
      ])
    ).rows[0]!.id;
  const topicId = id("top");

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, $5)`,
    [topicId, resolvedModuleId, curriculumId, title, order],
  );

  return topicId;
}

async function insertCardSetWithVariants(
  topicId: string,
  status: string,
  variants: { prompt: string; answer: string }[],
): Promise<void> {
  const cardSetId = id("cardset");
  const cardId = id("card");

  await client.query(
    `INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, $3)`,
    [cardSetId, topicId, status],
  );
  await client.query(
    `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, $3)`,
    [cardId, cardSetId, "Concept"],
  );

  for (let i = 0; i < variants.length; i += 1) {
    await client.query(
      `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer) VALUES ($1, $2, $3, $4, $5)`,
      [id("variant"), cardId, i + 1, variants[i]!.prompt, variants[i]!.answer],
    );
  }
}

describe("listCardsForCurriculum", () => {
  it("flattens every ready variant across topics, one row per variant, with the owning topic's title", async () => {
    const curriculumId = await seedCurriculum();
    const topicA = await insertTopic(curriculumId, "Topic A");
    const topicB = await insertTopic(curriculumId, "Topic B");

    await insertCardSetWithVariants(topicA, "ready", [
      { prompt: "What is a closure?", answer: "A function bundled with its scope." },
      { prompt: "What is hoisting?", answer: "Declarations moved to the top of scope." },
    ]);
    await insertCardSetWithVariants(topicB, "ready", [
      { prompt: "What is a promise?", answer: "A future value from async work." },
    ]);

    const rows = await listCardsForCurriculum(curriculumId);

    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.topicTitle === "Topic A")).toHaveLength(2);
    expect(rows.filter((r) => r.topicTitle === "Topic B")).toHaveLength(1);
    expect(rows.map((r) => r.prompt)).toContain("What is a closure?");
    expect(rows.map((r) => r.answer)).toContain("A future value from async work.");
  });

  it("never includes a generating or failed card set's variants", async () => {
    const curriculumId = await seedCurriculum();
    const readyTopic = await insertTopic(curriculumId, "Ready topic");
    const generatingTopic = await insertTopic(curriculumId, "Generating topic");
    const failedTopic = await insertTopic(curriculumId, "Failed topic");

    await insertCardSetWithVariants(readyTopic, "ready", [
      { prompt: "Ready question", answer: "Ready answer" },
    ]);
    await insertCardSetWithVariants(generatingTopic, "generating", [
      { prompt: "Should not appear", answer: "Should not appear" },
    ]);
    await insertCardSetWithVariants(failedTopic, "failed", [
      { prompt: "Should not appear either", answer: "Should not appear either" },
    ]);

    const rows = await listCardsForCurriculum(curriculumId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.prompt).toBe("Ready question");
  });

  it("never includes another curriculum's cards", async () => {
    const curriculumId = await seedCurriculum();
    const otherCurriculumId = await seedCurriculum();
    const ownTopic = await insertTopic(curriculumId, "Own topic");
    const otherTopic = await insertTopic(otherCurriculumId, "Other topic");

    await insertCardSetWithVariants(ownTopic, "ready", [
      { prompt: "Own question", answer: "Own answer" },
    ]);
    await insertCardSetWithVariants(otherTopic, "ready", [
      { prompt: "Other question", answer: "Other answer" },
    ]);

    const rows = await listCardsForCurriculum(curriculumId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.prompt).toBe("Own question");
  });

  it("returns an empty array for a curriculum with no cards generated yet", async () => {
    const curriculumId = await seedCurriculum();
    await insertTopic(curriculumId, "Untouched topic");

    const rows = await listCardsForCurriculum(curriculumId);

    expect(rows).toEqual([]);
  });

  it("orders by module first, not by topic order alone, across a multi-module curriculum", async () => {
    const curriculumId = await seedCurriculum();
    const { rows: existingModules } = await client.query<{ id: string }>(
      `SELECT id FROM modules WHERE curriculum_id = $1`,
      [curriculumId],
    );
    const firstModuleId = existingModules[0]!.id;
    const secondModuleId = await insertModule(curriculumId, 2, "Module 2");

    const topicInModule1 = await insertTopic(curriculumId, "Module 1 topic", firstModuleId, 2);
    const topicInModule2 = await insertTopic(curriculumId, "Module 2 topic", secondModuleId, 1);

    await insertCardSetWithVariants(topicInModule2, "ready", [
      { prompt: "Module 2 question", answer: "Module 2 answer" },
    ]);
    await insertCardSetWithVariants(topicInModule1, "ready", [
      { prompt: "Module 1 question", answer: "Module 1 answer" },
    ]);

    const rows = await listCardsForCurriculum(curriculumId);

    expect(rows.map((r) => r.topicTitle)).toEqual(["Module 1 topic", "Module 2 topic"]);
  });
});
