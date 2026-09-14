import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// ingestion-progress-visibility — a course-wide "X cards ready so far"
// display needs a real cross-topic aggregate, not the per-topic count
// card-panel.tsx already shows.

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

const dbName = `cards_summary_${randomUUID().replace(/-/g, "_")}`;
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

const { getCurriculumCardsSummary } = await import("./cards.repo.js");

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

async function insertTopic(curriculumId: string, title: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM modules WHERE curriculum_id = $1 LIMIT 1`,
    [curriculumId],
  );
  const moduleId = rows[0]!.id;
  const topicId = id("top");

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, title],
  );

  return topicId;
}

async function insertCardSet(topicId: string, status: string, conceptCount: number): Promise<void> {
  const cardSetId = id("cardset");

  await client.query(
    `INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, $3)`,
    [cardSetId, topicId, status],
  );

  for (let i = 0; i < conceptCount; i += 1) {
    await client.query(
      `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, $3, $4)`,
      [id("card"), cardSetId, i + 1, `Concept ${i + 1}`],
    );
  }
}

describe("getCurriculumCardsSummary", () => {
  it("sums ready cards across every topic and counts topics still generating", async () => {
    const curriculumId = await seedCurriculum();

    const readyTopicA = await insertTopic(curriculumId, "Topic A");
    const readyTopicB = await insertTopic(curriculumId, "Topic B");
    const generatingTopic = await insertTopic(curriculumId, "Topic C");
    const failedTopic = await insertTopic(curriculumId, "Topic D");

    await insertCardSet(readyTopicA, "ready", 4);
    await insertCardSet(readyTopicB, "ready", 3);
    // startGeneratingCards's upsert flips status back to "generating"
    // without clearing the prior ready set's card rows — regenerating an
    // already-ready topic leaves stale cards sitting under a non-ready
    // status, which must never count toward cardsReady.
    await insertCardSet(generatingTopic, "generating", 5);
    await insertCardSet(failedTopic, "failed", 0);

    const summary = await getCurriculumCardsSummary(curriculumId);

    expect(summary).toEqual({ cardsReady: 7, topicsGenerating: 1 });
  });

  it("returns zeros for a curriculum with no cards generated anywhere yet", async () => {
    const curriculumId = await seedCurriculum();

    await insertTopic(curriculumId, "Untouched topic");

    const summary = await getCurriculumCardsSummary(curriculumId);

    expect(summary).toEqual({ cardsReady: 0, topicsGenerating: 0 });
  });

  it("never counts another curriculum's cards", async () => {
    const curriculumId = await seedCurriculum();
    const otherCurriculumId = await seedCurriculum();

    const ownTopic = await insertTopic(curriculumId, "Own topic");
    const otherTopic = await insertTopic(otherCurriculumId, "Other topic");

    await insertCardSet(ownTopic, "ready", 2);
    await insertCardSet(otherTopic, "ready", 5);

    const summary = await getCurriculumCardsSummary(curriculumId);

    expect(summary).toEqual({ cardsReady: 2, topicsGenerating: 0 });
  });
});
