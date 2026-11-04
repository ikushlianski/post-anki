import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Gap } from "@post-anki/shared";
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

const dbName = `probe_attempt_${randomUUID().replace(/-/g, "_")}`;
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

const { recordProbeAttempt } = await import("./probe-attempt.repo.js");

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

const NOW = "2026-08-14T08:00:00.000Z";

function gapOf(gapId: string, topicId: string, over: Partial<Gap> = {}): Gap {
  return {
    id: gapId,
    topicId,
    label: "g",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: NOW,
    autoDeferredAt: null,
    ...over,
  };
}

async function seedTopic(): Promise<{ topicId: string; gapId: string }> {
  const subjectId = id("sub");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("top");
  const gapId = id("gap");

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `subject ${subjectId}`],
  );
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, 'c')`, [
    curriculumId,
    subjectId,
  ]);
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'm', 1)`,
    [moduleId, curriculumId],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 't', 1)`,
    [topicId, moduleId, curriculumId],
  );
  await client.query(`INSERT INTO gaps (id, topic_id, label) VALUES ($1, $2, 'g')`, [gapId, topicId]);

  return { topicId, gapId };
}

async function readTopic(topicId: string): Promise<{ attempts: number; status: string }> {
  const result = await client.query(
    `SELECT progress_attempts AS attempts, progress_status AS status FROM topics WHERE id = $1`,
    [topicId],
  );

  return result.rows[0];
}

describe("recordProbeAttempt", () => {
  it("should count two simultaneous attempts as two attempts", async () => {
    const { topicId, gapId } = await seedTopic();
    const attempt = () =>
      recordProbeAttempt({
        topicId,
        depth: "working",
        updatedGaps: [gapOf(gapId, topicId, { state: "covered", lastEvaluatedAt: NOW })],
        newGaps: [],
        now: NOW,
      });

    await Promise.all([attempt(), attempt()]);

    expect((await readTopic(topicId)).attempts).toBe(2);
  });

  it("should write covered gaps, discovered gaps and progress together", async () => {
    const { topicId, gapId } = await seedTopic();

    const outcome = await recordProbeAttempt({
      topicId,
      depth: "working",
      updatedGaps: [gapOf(gapId, topicId, { state: "covered", lastEvaluatedAt: NOW })],
      newGaps: [{ label: "new gap", depth: "working", concern: null }],
      now: NOW,
    });
    const gaps = await client.query(`SELECT state, label FROM gaps WHERE topic_id = $1`, [topicId]);

    expect(outcome.allGaps).toHaveLength(2);
    expect(gaps.rows).toHaveLength(2);
    expect(gaps.rows.find((r) => r.label === "g").state).toBe("covered");
    expect((await readTopic(topicId)).attempts).toBe(1);
    expect((await readTopic(topicId)).status).toBe(outcome.progress.status);
  });

  it("should leave gaps and the attempt counter unchanged when a write fails midway", async () => {
    const { topicId, gapId } = await seedTopic();

    await expect(
      recordProbeAttempt({
        topicId,
        depth: "working",
        updatedGaps: [gapOf(gapId, topicId, { state: "covered", untriagedSince: "not a date" })],
        newGaps: [],
        now: NOW,
      }),
    ).rejects.toThrow();

    const gap = await client.query(`SELECT state FROM gaps WHERE id = $1`, [gapId]);

    expect(gap.rows[0].state).toBe("open");
    expect((await readTopic(topicId)).attempts).toBe(0);
  });
});
