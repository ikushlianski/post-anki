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

const dbName = `distiller_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { listHierarchyForClassification, TOPIC_HIERARCHY_PROMPT_LIMIT } = await import(
  "./distiller.repo.js"
);

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

async function seedSubject(name: string): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [id, name]);

  return id;
}

async function seedCurriculum(subjectId: string, name: string): Promise<string> {
  const id = `curr_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    id,
    subjectId,
    name,
  ]);

  return id;
}

describe("listHierarchyForClassification (real Postgres)", () => {
  it("returns a topic joined with its curriculum and subject names", async () => {
    const subjectId = await seedSubject("Hierarchy Subject");
    const curriculumId = await seedCurriculum(subjectId, "Hierarchy Curriculum");
    const moduleId = `mod_${randomUUID()}`;
    const topicId = `topic_${randomUUID()}`;

    await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`, [
      moduleId,
      curriculumId,
      "Hierarchy Module",
      0,
    ]);
    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included) VALUES ($1, $2, $3, $4, $5, $6)`,
      [topicId, moduleId, curriculumId, "Hierarchy Topic", 0, true],
    );

    const rows = await listHierarchyForClassification();

    expect(rows).toEqual([
      {
        topicId,
        topicTitle: "Hierarchy Topic",
        curriculumName: "Hierarchy Curriculum",
        subjectName: "Hierarchy Subject",
      },
    ]);
  });

  it(`caps the returned rows at TOPIC_HIERARCHY_PROMPT_LIMIT (${TOPIC_HIERARCHY_PROMPT_LIMIT})`, async () => {
    const subjectId = await seedSubject("Cap Subject");
    const curriculumId = await seedCurriculum(subjectId, "Cap Curriculum");
    const moduleId = `mod_${randomUUID()}`;

    await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`, [
      moduleId,
      curriculumId,
      "Cap Module",
      0,
    ]);

    const topicCount = TOPIC_HIERARCHY_PROMPT_LIMIT + 1;
    const values: string[] = [];
    const params: unknown[] = [];

    for (let i = 0; i < topicCount; i++) {
      const base = params.length;

      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
      params.push(`topic_${randomUUID()}`, moduleId, curriculumId, `Cap Topic ${i}`, i, true);
    }

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included) VALUES ${values.join(", ")}`,
      params,
    );

    const rows = await listHierarchyForClassification();

    expect(rows).toHaveLength(TOPIC_HIERARCHY_PROMPT_LIMIT);
  });
});
