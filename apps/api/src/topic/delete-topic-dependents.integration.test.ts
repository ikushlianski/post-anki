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

const dbName = `topic_dependents_${randomUUID().replace(/-/g, "_")}`;
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

const { deleteTopic } = await import("./topic.repo.js");
const { deleteModule } = await import("../module/module.repo.js");

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

interface SeededTopic {
  topicId: string;
  gapId: string;
  sessionId: string;
}

async function seedModule(): Promise<{ moduleId: string; topics: SeededTopic[] }> {
  const subjectId = id("sub");
  const curriculumId = id("curr");
  const moduleId = id("mod");

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `subject ${subjectId}`],
  );
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    `curriculum ${curriculumId}`,
  ]);
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'm', 1)`,
    [moduleId, curriculumId],
  );

  const seeded: SeededTopic[] = [];

  for (const order of [1, 2]) {
    seeded.push(await seedTopic(moduleId, curriculumId, order));
  }

  return { moduleId, topics: seeded };
}

async function seedTopic(
  moduleId: string,
  curriculumId: string,
  order: number,
): Promise<SeededTopic> {
  const topicId = id("top");
  const gapId = id("gap");
  const sessionId = id("soc");
  const lectureId = id("lec");
  const cardSetId = id("set");
  const cardId = id("card");

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $4, 't', $3)`,
    [topicId, moduleId, order, curriculumId],
  );
  await client.query(`INSERT INTO gaps (id, topic_id, label) VALUES ($1, $2, 'g')`, [gapId, topicId]);
  await client.query(`INSERT INTO gap_mastery (id, gap_id) VALUES ($1, $2)`, [id("gm"), gapId]);
  await client.query(
    `INSERT INTO gap_archetype_state (id, gap_id, archetype_last_used_at) VALUES ($1, $2, '{}'::jsonb)`,
    [id("gas"), gapId],
  );
  await client.query(
    `INSERT INTO socratic_sessions (id, topic_id, curriculum_id) VALUES ($1, $2, $3)`,
    [sessionId, topicId, curriculumId],
  );
  await client.query(
    `INSERT INTO socratic_turns (id, session_id, concept_label, "order", prompt) VALUES ($1, $2, 'c', 1, 'p')`,
    [id("turn"), sessionId],
  );
  await client.query(
    `INSERT INTO study_materials (id, topic_id, kind, status) VALUES ($1, $2, 'summary', 'ready')`,
    [id("sm"), topicId],
  );
  await client.query(
    `INSERT INTO open_questions (id, source_type, source_item_id, topic_id, question_text) VALUES ($1, 'card', 'x', $2, 'q')`,
    [id("oq"), topicId],
  );
  await client.query(
    `INSERT INTO study_item_feedback (id, item_type, item_id, topic_id, item_text, rating) VALUES ($1, 'card', $2, $3, 't', 'up')`,
    [id("fb"), id("item"), topicId],
  );
  await client.query(
    `INSERT INTO topic_recommendations (id, topic_id, text, generated_at) VALUES ($1, $2, 'r', now())`,
    [id("rec"), topicId],
  );
  await client.query(`INSERT INTO lectures (id, topic_id, title) VALUES ($1, $2, 'l')`, [lectureId, topicId]);
  await client.query(
    `INSERT INTO lecture_sections (id, lecture_id, "order", heading, body) VALUES ($1, $2, 1, 'h', 'b')`,
    [id("sec"), lectureId],
  );
  await client.query(
    `INSERT INTO lecture_source_candidates (id, topic_id, title, url, why_selected) VALUES ($1, $2, 't', 'https://example.com', 'w')`,
    [id("cand"), topicId],
  );
  await client.query(`INSERT INTO topic_card_sets (id, topic_id) VALUES ($1, $2)`, [cardSetId, topicId]);
  await client.query(
    `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, 'c')`,
    [cardId, cardSetId],
  );
  await client.query(
    `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer) VALUES ($1, $2, 1, 'p', 'a')`,
    [id("var"), cardId],
  );

  return { topicId, gapId, sessionId };
}

async function countDependents(seeded: SeededTopic): Promise<number> {
  const byTopic = [
    "gaps",
    "socratic_sessions",
    "study_materials",
    "open_questions",
    "study_item_feedback",
    "topic_recommendations",
    "lectures",
    "lecture_source_candidates",
    "topic_card_sets",
  ];
  const byGap = ["gap_mastery", "gap_archetype_state"];
  let total = 0;

  for (const table of byTopic) {
    const result = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE topic_id = $1`, [
      seeded.topicId,
    ]);

    total += result.rows[0].n as number;
  }

  for (const table of byGap) {
    const result = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE gap_id = $1`, [
      seeded.gapId,
    ]);

    total += result.rows[0].n as number;
  }

  const turns = await client.query(
    `SELECT count(*)::int AS n FROM socratic_turns WHERE session_id = $1`,
    [seeded.sessionId],
  );

  return total + (turns.rows[0].n as number);
}

describe("deleting a topic or module removes everything that hangs off the topic", () => {
  it("should leave no dependent rows after a topic is deleted", async () => {
    const { topics } = await seedModule();
    const [target, other] = topics as [SeededTopic, SeededTopic];

    expect(await countDependents(target)).toBeGreaterThan(0);
    expect(await deleteTopic(target.topicId)).toBe(true);

    expect(await countDependents(target)).toBe(0);
    expect(await countDependents(other)).toBeGreaterThan(0);
  });

  it("should leave no dependent rows for any of its topics after a module is deleted", async () => {
    const { moduleId, topics } = await seedModule();

    for (const topic of topics) {
      expect(await countDependents(topic)).toBeGreaterThan(0);
    }

    expect(await deleteModule(moduleId)).toBe(true);

    for (const topic of topics) {
      expect(await countDependents(topic)).toBe(0);
    }
  });
});
