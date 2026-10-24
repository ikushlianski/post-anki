import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: {},
  getMastra: () => ({ getAgent: () => ({ generate: vi.fn() }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

const dbName = `curr_parse_jobs_${randomUUID().replace(/-/g, "_")}`;
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

const repo = await import("./curriculum-research-jobs.repo.js");

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

const MIN = 60 * 1000;

async function seedCurriculum(status: string, touchedAgoMs: number | null): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
    subjectId,
    "Parse jobs subject",
  ]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status, research_touched_at)
     VALUES ($1, $2, 'Vite', $3, CASE WHEN $4::bigint IS NULL THEN NULL ELSE now() - ($4::bigint * interval '1 millisecond') END)`,
    [curriculumId, subjectId, status, touchedAgoMs],
  );

  return curriculumId;
}

async function setOwner(id: string, token: string): Promise<void> {
  await client.query(`UPDATE curricula SET research_owner = $2 WHERE id = $1`, [id, token]);
}

async function state(curriculumId: string): Promise<{ status: string; touched: Date | null }> {
  const { rows } = await client.query(
    `SELECT c.status, c.research_touched_at AS touched
     FROM curricula c WHERE c.id = $1`,
    [curriculumId],
  );

  return rows[0];
}

describe("failResearchJob and failStaleResearchJobs for parse jobs (real Postgres)", () => {
  it("should fail a curating course and clear its touch when the job fails", async () => {
    const id = await seedCurriculum("curating", 1 * MIN);

    await repo.failResearchJob(id);

    expect(await state(id)).toMatchObject({ status: "failed", touched: null });
  });

  it("should clear the touch but keep the status of a course that already moved on", async () => {
    const id = await seedCurriculum("ready", 1 * MIN);

    await repo.failResearchJob(id);

    expect(await state(id)).toMatchObject({ status: "ready", touched: null });
  });

  it("should sweep a stale curating merge or parse course but not a live one", async () => {
    const stale = await seedCurriculum("curating", 30 * MIN);
    const live = await seedCurriculum("curating", 5 * MIN);

    await repo.failStaleResearchJobs(20 * MIN);

    expect((await state(stale)).status).toBe("failed");
    expect((await state(live)).status).toBe("curating");
  });
});

describe("run ownership (real Postgres)", () => {
  it("should leave a newer run's course and touch alone when an old run's failure arrives late", async () => {
    const id = await seedCurriculum("curating", 1 * MIN);

    await setOwner(id, "run_new");
    await repo.failResearchJob(id, "run_old");
    await repo.clearResearchJobTouch(id, "run_old");
    await repo.finishResearchJob(id, "run_old");

    const after = await state(id);

    expect(after.status).toBe("curating");
    expect(after.touched).not.toBeNull();
  });

  it("should still fail the course and clear the touch when the owning run fails", async () => {
    const id = await seedCurriculum("curating", 1 * MIN);

    await setOwner(id, "run_new");
    await repo.failResearchJob(id, "run_new");

    expect(await state(id)).toMatchObject({ status: "failed", touched: null });
  });

  it("should record the claiming run as owner when it touches the course", async () => {
    const id = await seedCurriculum("ready", null);

    await repo.touchResearchJob(id, "run_a");
    await repo.failResearchJob(id, "run_b");

    expect((await state(id)).status).toBe("curating");

    await repo.failResearchJob(id, "run_a");

    expect((await state(id)).status).toBe("failed");
  });
});
