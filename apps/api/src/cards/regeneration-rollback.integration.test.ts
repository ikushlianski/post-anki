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

const dbName = `regeneration_rollback_${randomUUID().replace(/-/g, "_")}`;
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

const { replaceCardsContent } = await import("./cards.repo.js");
const { replaceLectureContent } = await import("../lecture/lecture.repo.js");

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
  const moduleId = (
    await client.query<{ id: string }>(`SELECT id FROM modules WHERE curriculum_id = $1 LIMIT 1`, [
      curriculumId,
    ])
  ).rows[0]!.id;
  const topicId = id("top");

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, title],
  );

  return topicId;
}

describe("regeneration rollback", () => {
  it("should keep the old lecture sections when the replacement write fails", async () => {
    const curriculumId = await seedCurriculum();
    const topicId = await insertTopic(curriculumId, "Topic");
    const lectureId = id("lec");

    await client.query(`INSERT INTO lectures (id, topic_id, title, status) VALUES ($1, $2, 'Old', 'ready')`, [
      lectureId,
      topicId,
    ]);
    await client.query(
      `INSERT INTO lecture_sections (id, lecture_id, "order", heading, body) VALUES ($1, $2, 1, 'Old heading', 'Old body')`,
      [id("lsec"), lectureId],
    );

    const badPlan = {
      title: "New",
      sections: [{ heading: "New heading", body: "New body" }],
      citations: [{ title: "Bad", url: null as unknown as string }],
    };

    await expect(replaceLectureContent(topicId, badPlan)).rejects.toThrow();

    const sections = await client.query(`SELECT heading FROM lecture_sections WHERE lecture_id = $1`, [lectureId]);

    expect(sections.rows).toEqual([{ heading: "Old heading" }]);
  });

  it("should keep the old cards when the replacement write fails", async () => {
    const curriculumId = await seedCurriculum();
    const topicId = await insertTopic(curriculumId, "Topic");
    const cardSetId = id("cardset");

    await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, 'ready')`, [
      cardSetId,
      topicId,
    ]);
    await client.query(
      `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, 'Old concept')`,
      [id("card"), cardSetId],
    );

    const badPlan = {
      cards: [{ concept: null as unknown as string, variants: [] }],
    };

    await expect(replaceCardsContent(topicId, badPlan)).rejects.toThrow();

    const cards = await client.query(`SELECT concept FROM topic_cards WHERE card_set_id = $1`, [cardSetId]);

    expect(cards.rows).toEqual([{ concept: "Old concept" }]);
  });
});
