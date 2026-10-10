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

const dbName = `kb_sched_conc_${randomUUID().replace(/-/g, "_")}`;
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

const { reviewKnowledgeBitSchedule } = await import("./knowledge-bit-schedule.repo.js");

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

async function readSchedule(
  knowledgeBitId: string,
): Promise<{ easeFactor: number; intervalDays: number; reviewCount: number }> {
  const { rows } = await client.query(
    `SELECT ease_factor, interval_days, review_count FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
    [knowledgeBitId],
  );

  return {
    easeFactor: Number(rows[0]!.ease_factor),
    intervalDays: Number(rows[0]!.interval_days),
    reviewCount: Number(rows[0]!.review_count),
  };
}

describe("reviewKnowledgeBitSchedule under concurrency (real Postgres)", () => {
  it("applies both grades from two concurrent first-ever reviews of the same bit, instead of one clobbering the other's base state", async () => {
    const knowledgeBitId = `kb_${randomUUID()}`;

    const [resultA, resultB] = await Promise.all([
      reviewKnowledgeBitSchedule(knowledgeBitId, "Ok"),
      reviewKnowledgeBitSchedule(knowledgeBitId, "NeedsDeepDive"),
    ]);

    expect(resultA).toBeUndefined();
    expect(resultB).toBeUndefined();

    const schedule = await readSchedule(knowledgeBitId);

    // Sequential in either order starting from the 2.5/0 default: Ok then
    // NeedsDeepDive, or NeedsDeepDive then Ok, both land ease at 2.5 + 0.1 -
    // 0.2 = 2.4 — a clobber (the second write overwriting the first's
    // committed ease/interval with values it computed from the stale 2.5/0
    // default) would instead leave ease at 2.6 (Ok alone) or 2.3 (DeepDive
    // alone).
    expect(schedule.easeFactor).toBeCloseTo(2.4, 5);
    // Ok-then-DeepDive resets interval to 1; DeepDive-then-Ok grows that
    // reset interval of 1 by the pre-update 2.3 ease factor to 2.3 — either
    // is proof both grades landed on top of each other's state, not just one.
    const isResetInterval = Math.abs(schedule.intervalDays - 1) < 1e-5;
    const isGrownInterval = Math.abs(schedule.intervalDays - 2.3) < 1e-5;

    expect(isResetInterval || isGrownInterval).toBe(true);
    expect(schedule.reviewCount).toBe(2);
  });

  it("applies both grades from two concurrent reviews of a bit that already has a schedule row", async () => {
    const knowledgeBitId = `kb_${randomUUID()}`;

    await reviewKnowledgeBitSchedule(knowledgeBitId, "Ok");
    const baseline = await readSchedule(knowledgeBitId);

    const [resultA, resultB] = await Promise.all([
      reviewKnowledgeBitSchedule(knowledgeBitId, "Ok"),
      reviewKnowledgeBitSchedule(knowledgeBitId, "NeedsReview"),
    ]);

    expect(resultA).toBeUndefined();
    expect(resultB).toBeUndefined();

    const schedule = await readSchedule(knowledgeBitId);

    // Baseline ease is 2.6 after the seed "Ok". Sequential in either order
    // from there nets +0.1 then -0.05, or -0.05 then +0.1 — both land at
    // 2.65. A clobber would instead leave ease at 2.7 (Ok alone) or 2.55
    // (NeedsReview alone), each based on the stale 2.6 baseline alone.
    expect(schedule.easeFactor).toBeCloseTo(baseline.easeFactor + 0.05, 5);
    expect(schedule.reviewCount).toBe(3);
  });

  it("returns a relearning card to review when a typed verdict lands, keeping its lapses", async () => {
    const knowledgeBitId = `kb_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, interval_days, phase, learning_step, lapses) VALUES ($1, 1, 'relearning', 0, 2)`,
      [knowledgeBitId],
    );
    await reviewKnowledgeBitSchedule(knowledgeBitId, "Ok");

    const { rows } = await client.query(
      `SELECT phase, learning_step, lapses FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
      [knowledgeBitId],
    );

    expect(rows[0]).toEqual({ phase: "review", learning_step: 0, lapses: 2 });
  });
});
