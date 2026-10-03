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

const dbName = `topic_bit_mastery_${randomUUID().replace(/-/g, "_")}`;
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

const { getTopicBitMasteryLevels } = await import("./topic-due.repo.js");
const { insertQuestionVariant } = await import("./knowledge-bit-question-variant.repo.js");
const { insertVariantAttempt } = await import("./knowledge-bit-variant-attempt.repo.js");
const { getCurriculumDetail } = await import("../curriculum/curriculum.repo.js");

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

async function insertSubject(overrides: { id: string; name: string }): Promise<void> {
  await client.query(`INSERT INTO subjects (id, name, require_sources) VALUES ($1, $2, false)`, [
    overrides.id,
    overrides.name,
  ]);
}

async function insertCurriculum(overrides: {
  id: string;
  subjectId: string;
  name: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [overrides.id, overrides.subjectId, overrides.name],
  );
}

async function insertModule(overrides: {
  id: string;
  curriculumId: string;
  title: string;
}): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    overrides.id,
    overrides.curriculumId,
    overrides.title,
  ]);
}

async function insertTopic(overrides: {
  id: string;
  moduleId: string;
  curriculumId: string;
  title: string;
  releaseState?: "declined" | "queued" | null;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included, learning_status, release_state)
     VALUES ($1, $2, $3, $4, 1, true, 'not_started', $5)`,
    [overrides.id, overrides.moduleId, overrides.curriculumId, overrides.title, overrides.releaseState ?? null],
  );
}

async function seedKnowledgeBit(body: string, topicId: string | null): Promise<string> {
  const sourceId = id("ksrc");
  const bitId = id("kb");

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [sourceId, body],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state) VALUES ($1, $2, 0, $3, $4, 'approved')`,
    [bitId, sourceId, body, topicId],
  );

  return bitId;
}

async function seedVariant(bitId: string, prompt: string): Promise<string> {
  await insertQuestionVariant(bitId, "wh_question", 0, prompt, "some answer");

  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
    [bitId],
  );

  return rows[0]!.id as string;
}

async function recordAttempt(variantId: string, verdict: "Ok" | "NeedsReview" | "NeedsDeepDive") {
  await insertVariantAttempt({
    variantId,
    userAnswer: "an answer",
    score: verdict === "Ok" ? 9 : 2,
    verdict,
    feedback: "feedback",
  });
}

describe("getTopicBitMasteryLevels (real Postgres)", () => {
  it("returns an empty map for a topic with zero bit attempts", async () => {
    await insertSubject({ id: "sub_tbm_1", name: "Testing" });
    await insertCurriculum({ id: "cur_tbm_1", subjectId: "sub_tbm_1", name: "Curriculum" });
    await insertModule({ id: "mod_tbm_1", curriculumId: "cur_tbm_1", title: "Module" });
    await insertTopic({
      id: "top_tbm_1",
      moduleId: "mod_tbm_1",
      curriculumId: "cur_tbm_1",
      title: "No attempts yet",
    });

    const levels = await getTopicBitMasteryLevels(["top_tbm_1"]);

    expect(levels.get("top_tbm_1")).toBeUndefined();
  });

  it("folds scored attempts across every bit placed under a topic into one stream", async () => {
    await insertSubject({ id: "sub_tbm_2", name: "Testing" });
    await insertCurriculum({ id: "cur_tbm_2", subjectId: "sub_tbm_2", name: "Curriculum" });
    await insertModule({ id: "mod_tbm_2", curriculumId: "cur_tbm_2", title: "Module" });
    await insertTopic({
      id: "top_tbm_2",
      moduleId: "mod_tbm_2",
      curriculumId: "cur_tbm_2",
      title: "Scored attempts",
    });

    const bitA = await seedKnowledgeBit("Bit A body", "top_tbm_2");
    const bitB = await seedKnowledgeBit("Bit B body", "top_tbm_2");
    const variantA = await seedVariant(bitA, "Why A?");
    const variantB = await seedVariant(bitB, "Why B?");

    await recordAttempt(variantA, "Ok");
    await recordAttempt(variantB, "Ok");
    await recordAttempt(variantA, "Ok");

    const levels = await getTopicBitMasteryLevels(["top_tbm_2"]);

    expect(levels.get("top_tbm_2")?.status).toBe("mastered");
    expect(levels.get("top_tbm_2")?.masteryStage).toBe(3);
  });

  it("never credits a topic with attempts against a bit that has no topic placement", async () => {
    await insertSubject({ id: "sub_tbm_3", name: "Testing" });
    await insertCurriculum({ id: "cur_tbm_3", subjectId: "sub_tbm_3", name: "Curriculum" });
    await insertModule({ id: "mod_tbm_3", curriculumId: "cur_tbm_3", title: "Module" });
    await insertTopic({
      id: "top_tbm_3",
      moduleId: "mod_tbm_3",
      curriculumId: "cur_tbm_3",
      title: "Unrelated topic",
    });

    const unplacedBit = await seedKnowledgeBit("Unplaced bit body", null);
    const unplacedVariant = await seedVariant(unplacedBit, "Why unplaced?");

    await recordAttempt(unplacedVariant, "Ok");
    await recordAttempt(unplacedVariant, "Ok");
    await recordAttempt(unplacedVariant, "Ok");

    const levels = await getTopicBitMasteryLevels(["top_tbm_3"]);

    expect(levels.get("top_tbm_3")).toBeUndefined();
  });

  it("still computes a mastery value for a declined topic", async () => {
    await insertSubject({ id: "sub_tbm_4", name: "Testing" });
    await insertCurriculum({ id: "cur_tbm_4", subjectId: "sub_tbm_4", name: "Curriculum" });
    await insertModule({ id: "mod_tbm_4", curriculumId: "cur_tbm_4", title: "Module" });
    await insertTopic({
      id: "top_tbm_4",
      moduleId: "mod_tbm_4",
      curriculumId: "cur_tbm_4",
      title: "Declined topic",
      releaseState: "declined",
    });

    const bit = await seedKnowledgeBit("Declined topic's bit", "top_tbm_4");
    const variant = await seedVariant(bit, "Why declined?");

    await recordAttempt(variant, "Ok");

    const levels = await getTopicBitMasteryLevels(["top_tbm_4"]);

    expect(levels.get("top_tbm_4")?.status).toBe("practicing");
    expect(levels.get("top_tbm_4")?.masteryStage).toBe(1);
  });
});

describe("getCurriculumDetail bitKnowledge wiring", () => {
  it("surfaces bitKnowledge on the topic payload, defaulting zero-attempt topics to 'new'", async () => {
    await insertSubject({ id: "sub_tbm_5", name: "Testing" });
    await insertCurriculum({ id: "cur_tbm_5", subjectId: "sub_tbm_5", name: "Curriculum" });
    await insertModule({ id: "mod_tbm_5", curriculumId: "cur_tbm_5", title: "Module" });
    await insertTopic({
      id: "top_tbm_5_scored",
      moduleId: "mod_tbm_5",
      curriculumId: "cur_tbm_5",
      title: "Has a scored attempt",
    });
    await insertTopic({
      id: "top_tbm_5_fresh",
      moduleId: "mod_tbm_5",
      curriculumId: "cur_tbm_5",
      title: "No attempts at all",
    });

    const bit = await seedKnowledgeBit("Scored topic's bit", "top_tbm_5_scored");
    const variant = await seedVariant(bit, "Why scored?");

    await recordAttempt(variant, "Ok");

    const detail = await getCurriculumDetail("cur_tbm_5");
    const module = detail?.modules.find((m) => m.id === "mod_tbm_5");
    const scoredTopic = module?.topics.find((t) => t.id === "top_tbm_5_scored");
    const freshTopic = module?.topics.find((t) => t.id === "top_tbm_5_fresh");

    expect(scoredTopic?.bitKnowledge).toMatchObject({ status: "practicing", masteryStage: 1 });
    expect(freshTopic?.bitKnowledge).toMatchObject({ status: "new", masteryStage: 0 });
    expect(scoredTopic?.progress.maturity).toBe(0);
  });
});
