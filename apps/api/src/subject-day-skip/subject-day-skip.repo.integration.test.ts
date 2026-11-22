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

const dbName = `subject_day_skip_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
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

const { listSkippedSubjects, skipSubjectForDay, unskipSubjectForDay } = await import("./subject-day-skip.repo.js");

let client: pg.Client;

const NOON = new Date("2090-03-10T12:00:00.000Z");
const NEXT_DAY = new Date("2090-03-11T12:00:00.000Z");

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name) VALUES ('root', 'Root'), ('other', 'Other')`);
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('child', 'Child', 'root')`);
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('grandchild', 'Grandchild', 'child')`);
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

async function reset(): Promise<void> {
  await client.query(`DELETE FROM subject_day_skips`);
}

describe("subject day skips (real Postgres)", () => {
  it("should hide a skipped subject for the rest of the local day and show it again after unskipping", async () => {
    await reset();
    await skipSubjectForDay("other", { tz: "UTC", now: NOON });

    expect((await listSkippedSubjects({ tz: "UTC", now: NOON })).subjectIds).toEqual(["other"]);

    await unskipSubjectForDay("other", { tz: "UTC", now: NOON });

    expect((await listSkippedSubjects({ tz: "UTC", now: NOON })).subjectIds).toEqual([]);
  });

  it("should treat skipping the same subject twice as one skip", async () => {
    await reset();
    await skipSubjectForDay("other", { tz: "UTC", now: NOON });
    await skipSubjectForDay("other", { tz: "UTC", now: NOON });

    const { rows } = await client.query(`SELECT count(*)::int AS total FROM subject_day_skips`);

    expect(rows[0].total).toBe(1);
  });

  it("should skip every sub-subject when a parent is skipped", async () => {
    await reset();
    await skipSubjectForDay("root", { tz: "UTC", now: NOON });

    const skipped = await listSkippedSubjects({ tz: "UTC", now: NOON });

    expect(skipped.subjectIds).toEqual(["child", "grandchild", "root"]);
  });

  it("should not touch the parent when only a child is skipped", async () => {
    await reset();
    await skipSubjectForDay("child", { tz: "UTC", now: NOON });

    expect((await listSkippedSubjects({ tz: "UTC", now: NOON })).subjectIds).toEqual(["child", "grandchild"]);
  });

  it("should start the next local day with nothing skipped", async () => {
    await reset();
    await skipSubjectForDay("other", { tz: "UTC", now: NOON });

    const tomorrow = await listSkippedSubjects({ tz: "UTC", now: NEXT_DAY });

    expect(tomorrow).toEqual({ dayKey: "2090-03-11", subjectIds: [] });
  });

  it("should use the caller's time zone to decide which day it is", async () => {
    await reset();

    const lateUtc = new Date("2090-03-10T23:30:00.000Z");

    expect((await listSkippedSubjects({ tz: "UTC", now: lateUtc })).dayKey).toBe("2090-03-10");
    expect((await listSkippedSubjects({ tz: "Asia/Tokyo", now: lateUtc })).dayKey).toBe("2090-03-11");
  });

  it("should drop skips older than yesterday when a new skip is written", async () => {
    await reset();
    await client.query(
      `INSERT INTO subject_day_skips (subject_id, day_key) VALUES ('other', '2090-03-07'), ('root', '2090-03-09')`,
    );
    await skipSubjectForDay("child", { tz: "UTC", now: NOON });

    const { rows } = await client.query(`SELECT subject_id FROM subject_day_skips ORDER BY subject_id`);

    expect(rows.map((row) => row.subject_id)).toEqual(["child", "root"]);
  });
});
