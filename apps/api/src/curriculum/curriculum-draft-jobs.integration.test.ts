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

const dbName = `curr_draft_jobs_${randomUUID().replace(/-/g, "_")}`;
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

const repo = await import("./curriculum-draft-jobs.repo.js");
const steps = await import("./curriculum-draft.steps.js");

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
    "Draft jobs subject",
  ]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status, research_touched_at)
     VALUES ($1, $2, 'Vite', $3, CASE WHEN $4::bigint IS NULL THEN NULL ELSE now() - ($4::bigint * interval '1 millisecond') END)`,
    [curriculumId, subjectId, status, touchedAgoMs],
  );

  return curriculumId;
}

async function seedPendingTurn(curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO curriculum_structure_turns (id, curriculum_id, role, message, status, "order")
     VALUES ($1, $2, 'assistant', 'Drafting', 'pending', 1)`,
    [`turn_${randomUUID()}`, curriculumId],
  );
}

async function state(curriculumId: string): Promise<{ status: string; touched: Date | null; turn: string | undefined }> {
  const { rows } = await client.query(
    `SELECT c.status, c.research_touched_at AS touched,
       (SELECT t.status FROM curriculum_structure_turns t WHERE t.curriculum_id = c.id ORDER BY t."order" DESC LIMIT 1) AS turn
     FROM curricula c WHERE c.id = $1`,
    [curriculumId],
  );

  return rows[0];
}

describe("failStaleDraftJobs (real Postgres)", () => {
  it("should fail only stale shaping rows and their pending turn, leaving queued, live and untouched rows", async () => {
    const stale = await seedCurriculum("shaping_structure", 30 * MIN);
    const owned = await seedCurriculum("shaping_structure", 5 * MIN);
    const inProcess = await seedCurriculum("shaping_structure", null);
    const researching = await seedCurriculum("curating", 30 * MIN);

    await seedPendingTurn(stale);
    await seedPendingTurn(owned);

    await repo.failStaleDraftJobs(15 * MIN);

    expect(await state(stale)).toMatchObject({ status: "failed", touched: null, turn: "failed" });
    expect(await state(owned)).toMatchObject({ status: "shaping_structure", turn: "pending" });
    expect((await state(inProcess)).status).toBe("shaping_structure");
    expect((await state(researching)).status).toBe("curating");
  });
});

describe("failDraftJob (real Postgres)", () => {
  it("should fail a shaping course and its pending turn", async () => {
    const id = await seedCurriculum("shaping_structure", MIN);

    await seedPendingTurn(id);
    await repo.failDraftJob(id);

    expect(await state(id)).toMatchObject({ status: "failed", touched: null, turn: "failed" });
  });

  it("should leave a course the learner already moved on", async () => {
    const id = await seedCurriculum("ready", MIN);

    await repo.failDraftJob(id);

    expect((await state(id)).status).toBe("ready");
  });
});

describe("draft steps (real Postgres)", () => {
  it("should touch the course into shaping_structure on begin", async () => {
    const id = await seedCurriculum("curating", null);

    await steps.beginDraftStep(id);

    expect((await state(id)).status).toBe("shaping_structure");
    expect((await state(id)).touched).not.toBeNull();
  });

  it("should return busy without a model call when a pending placeholder already exists", async () => {
    const id = await seedCurriculum("shaping_structure", MIN);

    const first = await steps.placeholderDraftStep(id);
    const second = await steps.placeholderDraftStep(id);
    const drafted = await steps.draftStep(id, second);

    expect(first).not.toBe("busy");
    expect(second).toBe("busy");
    expect(drafted).toEqual({ status: "busy", modules: 0 });
  });

  it("should leave the touch null and the status alone when the run is busy", async () => {
    const id = await seedCurriculum("shaping_structure", MIN);

    await steps.draftStep(id, "busy");

    expect(await state(id)).toMatchObject({ status: "shaping_structure", touched: null });
  });
});

describe("draft run ownership (real Postgres)", () => {
  it("should not fail or untouch a newer draft run when an old run's failure arrives late", async () => {
    const id = await seedCurriculum("shaping_structure", 1 * MIN);

    await client.query(`UPDATE curricula SET research_owner = 'run_new' WHERE id = $1`, [id]);
    await seedPendingTurn(id);
    await repo.failDraftJob(id, "run_old");
    await repo.finishDraftJob(id, "run_old");

    const after = await state(id);

    expect(after).toMatchObject({ status: "shaping_structure", turn: "pending" });
    expect(after.touched).not.toBeNull();
  });

  it("should fail the draft and its pending turn when the owning run fails", async () => {
    const id = await seedCurriculum("shaping_structure", 1 * MIN);

    await client.query(`UPDATE curricula SET research_owner = 'run_new' WHERE id = $1`, [id]);
    await seedPendingTurn(id);
    await repo.failDraftJob(id, "run_new");

    expect(await state(id)).toMatchObject({ status: "failed", touched: null, turn: "failed" });
  });

  it("should leave a healthy course untouched when a retry claimed while the first run was live is dropped", async () => {
    const id = await seedCurriculum("shaping_structure", null);

    await steps.beginDraftStep(id, "run_a");
    await repo.touchDraftJob(id);
    await repo.finishDraftJob(id, "run_a");

    expect(await state(id)).toMatchObject({ status: "shaping_structure", touched: null });
  });

  it("should report a live run only when the course was touched within the window", async () => {
    const live = await seedCurriculum("shaping_structure", 2 * MIN);
    const stale = await seedCurriculum("shaping_structure", 30 * MIN);
    const idle = await seedCurriculum("curating", null);

    expect(await repo.claimDraftJob(live, 15 * MIN)).toEqual({ liveRunActive: true });
    expect(await repo.claimDraftJob(stale, 15 * MIN)).toEqual({ liveRunActive: false });
    expect(await repo.claimDraftJob(idle, 15 * MIN)).toEqual({ liveRunActive: false });
    expect(await state(idle)).toMatchObject({ status: "shaping_structure" });
    expect((await state(idle)).touched).not.toBeNull();
  });
});
