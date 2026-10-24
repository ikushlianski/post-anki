import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const mockGather = vi.fn();

vi.mock("./source-candidates.js", () => ({
  gatherSourceCandidates: (...args: unknown[]) => mockGather(...args),
}));

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

const dbName = `curr_research_jobs_${randomUUID().replace(/-/g, "_")}`;
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
const steps = await import("./curriculum-research.steps.js");
const { researchMarkerFor } = await import("./curriculum-research-marker.js");
const { insertResearchSource } = await import("./curriculum.repo.js");

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

beforeEach(() => {
  mockGather.mockReset().mockResolvedValue([]);
});

async function seedCurriculum(status: string, touchedAgoMs: number | null, name = "Vite"): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
    subjectId,
    "Research jobs subject",
  ]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status, research_touched_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::bigint IS NULL THEN NULL ELSE now() - ($5::bigint * interval '1 millisecond') END)`,
    [curriculumId, subjectId, name, status, touchedAgoMs],
  );

  return curriculumId;
}

async function row(curriculumId: string): Promise<{ status: string; touched: Date | null }> {
  const { rows } = await client.query(
    `SELECT status, research_touched_at AS touched FROM curricula WHERE id = $1`,
    [curriculumId],
  );

  return rows[0];
}

const MIN = 60 * 1000;

describe("failStaleResearchJobs (real Postgres)", () => {
  it("should fail only curating rows whose touch is older than the cutoff", async () => {
    const stale = await seedCurriculum("curating", 30 * MIN);
    const queuedOrLive = await seedCurriculum("curating", 5 * MIN);
    const inProcess = await seedCurriculum("curating", null);
    const otherStatus = await seedCurriculum("awaiting_source_approval", 30 * MIN);

    await repo.failStaleResearchJobs(20 * MIN);

    expect((await row(stale)).status).toBe("failed");
    expect((await row(stale)).touched).toBeNull();
    expect((await row(queuedOrLive)).status).toBe("curating");
    expect((await row(inProcess)).status).toBe("curating");
    expect((await row(otherStatus)).status).toBe("awaiting_source_approval");
  });
});

describe("research job status helpers (real Postgres)", () => {
  it("should touch on prepare and clear the touch on finalize", async () => {
    const id = await seedCurriculum("curating", null);

    await repo.touchResearchJob(id);
    expect((await row(id)).touched).not.toBeNull();

    await repo.finishResearchJob(id);
    expect(await row(id)).toMatchObject({ status: "awaiting_source_approval", touched: null });
  });

  it("should fail a curating row on failure but leave a row the learner already moved on", async () => {
    const curating = await seedCurriculum("curating", MIN);
    const moved = await seedCurriculum("ready", MIN);

    await repo.failResearchJob(curating);
    await repo.failResearchJob(moved);

    expect((await row(curating)).status).toBe("failed");
    expect((await row(moved)).status).toBe("ready");
  });
});

describe("research steps (real Postgres)", () => {
  it("should keep the doc URL through a retry prepare and give it to gather", async () => {
    const id = await seedCurriculum("failed", null);

    await insertResearchSource(id, researchMarkerFor({ name: "Vite", docUrl: "https://vite.dev" }), "");

    await steps.prepareResearchStep(id, true);
    await steps.prepareResearchStep(id, true);
    await steps.gatherResearchStep(id);

    expect(mockGather).toHaveBeenCalledWith(
      { name: "Vite", docUrl: "https://vite.dev" },
      { curriculumId: id },
    );
    expect((await row(id)).status).toBe("curating");

    const { rows } = await client.query(`SELECT kind FROM sources WHERE curriculum_id = $1`, [id]);

    expect(rows).toHaveLength(1);
  });

  it("should store candidates as pending sources once even when gather runs twice", async () => {
    const id = await seedCurriculum("curating", null);

    await insertResearchSource(id, researchMarkerFor({ name: "Vite" }), "");
    mockGather.mockResolvedValue([
      { kind: "link", url: "https://a.dev", title: "A", fetchedText: null, discoveryTier: "official" },
    ]);

    await steps.gatherResearchStep(id);
    const result = await steps.gatherResearchStep(id);
    const { rows } = await client.query(
      `SELECT 1 FROM sources WHERE curriculum_id = $1 AND approval_status = 'pending'`,
      [id],
    );

    expect(result).toEqual({ candidates: 1 });
    expect(rows).toHaveLength(1);
  });
});
