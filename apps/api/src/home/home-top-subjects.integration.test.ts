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

const dbName = `home_top_subjects_${randomUUID().replace(/-/g, "_")}`;
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

const { listTopSubjectsByActivity } = await import("./home.repo.js");

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

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedSubject(name: string, topicAges: (number | null)[]): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;
  const moduleId = `mod_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, name]);
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'm', 0)`,
    [moduleId, curriculumId],
  );

  for (const [index, ageDays] of topicAges.entries()) {
    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", progress_last_interacted_at)
       VALUES ($1, $2, $3, 't', $4, $5)`,
      [
        `topic_${randomUUID()}`,
        moduleId,
        curriculumId,
        index,
        ageDays === null ? null : new Date(Date.now() - ageDays * DAY_MS),
      ],
    );
  }

  return subjectId;
}

describe("listTopSubjectsByActivity (real Postgres)", () => {
  it("counts only topics touched within 30 days and orders subjects by latest activity", async () => {
    const older = await seedSubject("Older subject", [3, 5, 45, 90]);
    const newest = await seedSubject("Newest subject", [1, null]);
    const stale = await seedSubject("Stale subject", [60, 100]);
    await seedSubject("Never touched", [null]);

    const result = await listTopSubjectsByActivity(10);

    expect(result.map((row) => row.subjectId)).toEqual([newest, older, stale]);
    expect(result.map((row) => row.topicsTouchedLast30Days)).toEqual([1, 2, 0]);
    expect(result[0]?.subjectName).toBe("Newest subject");
    expect(new Date(result[1]!.lastInteractedAt).getTime()).toBeGreaterThan(
      Date.now() - 4 * DAY_MS,
    );
  });

  it("returns at most the requested number of subjects, most recent first", async () => {
    const result = await listTopSubjectsByActivity(2);

    expect(result).toHaveLength(2);
    expect(result[0]!.lastInteractedAt >= result[1]!.lastInteractedAt).toBe(true);
  });
});
