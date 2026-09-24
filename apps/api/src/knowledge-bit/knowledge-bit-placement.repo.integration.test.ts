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

const dbName = `knowledge_bit_placement_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const {
  listKnowledgeBitsForPlacementScan,
  listTopicsForPlacement,
  markKnowledgeBitMatched,
  markKnowledgeBitSuggested,
  markKnowledgeBitPlacementFailed,
} = await import("./knowledge-bit-placement.repo.js");

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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );

  return id;
}

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  topicId: string | null = null,
  placementSuggestion: string | null = null,
  placementCheckedAt: Date | null = null,
  placementFailedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits
       (id, knowledge_source_id, ordinal, body, topic_id, placement_suggestion, placement_checked_at, placement_failed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      knowledgeSourceId,
      ordinal,
      body,
      topicId,
      placementSuggestion,
      placementCheckedAt,
      placementFailedAt,
    ],
  );

  return id;
}

async function seedSubject(name: string): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [id, name]);

  return id;
}

async function seedCurriculum(
  subjectId: string,
  name: string,
  containerAreaNodeId: string | null = null,
): Promise<string> {
  const id = `curr_${randomUUID()}`;

  await client.query(
    `INSERT INTO curricula (id, subject_id, name, container_area_node_id) VALUES ($1, $2, $3, $4)`,
    [id, subjectId, name, containerAreaNodeId],
  );

  return id;
}

async function seedTopic(
  curriculumId: string,
  title: string,
  included: boolean,
): Promise<string> {
  const id = `topic_${randomUUID()}`;
  const moduleId = `mod_${randomUUID()}`;

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, moduleId, curriculumId, title, 0, included],
  );

  return id;
}

describe("listKnowledgeBitsForPlacementScan (real Postgres)", () => {
  it("returns exactly the bits with placementCheckedAt IS NULL AND placementFailedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const untouchedId = await seedKnowledgeBit(sourceId, 0, "An unplaced bit");

    await seedKnowledgeBit(
      sourceId,
      1,
      "An already-checked bit",
      null,
      null,
      new Date(),
      null,
    );
    await seedKnowledgeBit(sourceId, 2, "A permanently-failed bit", null, null, null, new Date());

    const rows = await listKnowledgeBitsForPlacementScan(100);

    expect(rows).toEqual([{ id: untouchedId, body: "An unplaced bit" }]);
  });
});

describe("listTopicsForPlacement (real Postgres)", () => {
  it("returns exactly the included, non-container topics", async () => {
    const subjectId = await seedSubject("Placement Subject");
    const containerCurriculumId = await seedCurriculum(
      subjectId,
      "Container Curriculum",
      `area_${randomUUID()}`,
    );
    const ordinaryCurriculumId = await seedCurriculum(subjectId, "Ordinary Curriculum");

    const includedTopicId = await seedTopic(ordinaryCurriculumId, "Included Topic", true);

    await seedTopic(ordinaryCurriculumId, "Excluded Topic", false);
    await seedTopic(containerCurriculumId, "Container Topic", true);

    const rows = await listTopicsForPlacement();

    expect(rows).toEqual([
      {
        topicId: includedTopicId,
        topicTitle: "Included Topic",
        curriculumName: "Ordinary Curriculum",
        subjectName: "Placement Subject",
      },
    ]);
  });
});

describe("markKnowledgeBitMatched (real Postgres)", () => {
  it("persists topicId and placementCheckedAt on read-back after marking a bit matched", async () => {
    const subjectId = await seedSubject("Match Subject");
    const curriculumId = await seedCurriculum(subjectId, "Match Curriculum");
    const topicId = await seedTopic(curriculumId, "Match Topic", true);

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to match");

    await markKnowledgeBitMatched(bitId, topicId);

    const { rows } = await client.query(
      `SELECT topic_id, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.topic_id).toBe(topicId);
    expect(rows[0]!.placement_checked_at).toBeInstanceOf(Date);
  });
});

describe("markKnowledgeBitSuggested (real Postgres)", () => {
  it("persists placementSuggestion and placementCheckedAt on read-back after marking a bit suggested", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with no home yet");

    await markKnowledgeBitSuggested(bitId, "Create a new topic under Subject > Curriculum");

    const { rows } = await client.query(
      `SELECT placement_suggestion, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_suggestion).toBe("Create a new topic under Subject > Curriculum");
    expect(rows[0]!.placement_checked_at).toBeInstanceOf(Date);
  });
});

describe("markKnowledgeBitPlacementFailed (real Postgres)", () => {
  it("persists placementFailedAt on read-back after marking a bit placement failed", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit that fails to place");

    await markKnowledgeBitPlacementFailed(bitId);

    const { rows } = await client.query(
      `SELECT placement_failed_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_failed_at).toBeInstanceOf(Date);
  });
});
