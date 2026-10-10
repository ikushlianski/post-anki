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

const dbName = `kb_review_susp_${randomUUID().replace(/-/g, "_")}`;
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
const { updateKnowledgeBitScheduleControls } = await import(
  "./knowledge-bit-review-suspension.orchestrator.js"
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

async function seedBit(approvalState: "approved" | "pending" = "approved"): Promise<string> {
  const knowledgeBitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'TCP uses a three-way handshake.', $3)`,
    [knowledgeBitId, `ks_${randomUUID()}`, approvalState],
  );

  return knowledgeBitId;
}

async function seedVariant(knowledgeBitId: string, kind = "wh_question"): Promise<string> {
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, $3, 0, 'Why a handshake?', 'To agree on sequence numbers.')`,
    [variantId, knowledgeBitId, kind],
  );

  return variantId;
}

async function readSchedule(knowledgeBitId: string) {
  const { rows } = await client.query(
    `SELECT review_count, phase, suspended_at, buried_until FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`,
    [knowledgeBitId],
  );

  return rows[0] as
    | { review_count: number; phase: string; suspended_at: Date | null; buried_until: Date | null }
    | undefined;
}

const NOW = new Date("2026-10-10T12:00:00.000Z");

describe("updateKnowledgeBitScheduleControls (real Postgres)", () => {
  it("should suspend a card, keep it new, and bring it back when unsuspended", async () => {
    const bitId = await seedBit();

    const suspended = await updateKnowledgeBitScheduleControls(bitId, { suspended: true, tz: "UTC" }, NOW);

    expect(suspended).toMatchObject({ ok: true, suspended: true, buriedUntil: null });
    expect(await readSchedule(bitId)).toMatchObject({ review_count: 0, phase: "new" });
    expect((await readSchedule(bitId))?.suspended_at).not.toBeNull();

    const restored = await updateKnowledgeBitScheduleControls(bitId, { suspended: false, tz: "UTC" }, NOW);

    expect(restored).toMatchObject({ ok: true, suspended: false });
    expect((await readSchedule(bitId))?.suspended_at).toBeNull();
  });

  it("should bury a card until the end of the learner's local day", async () => {
    const bitId = await seedBit();

    const outcome = await updateKnowledgeBitScheduleControls(bitId, { buried: true, tz: "Pacific/Auckland" }, NOW);

    expect(outcome).toMatchObject({ ok: true, buriedUntil: "2026-10-11T11:00:00.000Z" });
  });

  it("should leave suspension alone when only the bury changes", async () => {
    const bitId = await seedBit();

    await updateKnowledgeBitScheduleControls(bitId, { suspended: true, tz: "UTC" }, NOW);
    await updateKnowledgeBitScheduleControls(bitId, { buried: true, tz: "UTC" }, NOW);

    const row = await readSchedule(bitId);

    expect(row?.suspended_at).not.toBeNull();
    expect(row?.buried_until).not.toBeNull();
  });

  it("should refuse a bit that is not approved and write nothing", async () => {
    const bitId = await seedBit("pending");

    expect(await updateKnowledgeBitScheduleControls(bitId, { suspended: true, tz: "UTC" }, NOW)).toEqual({
      ok: false,
      error: "not_approved",
    });
    expect(await readSchedule(bitId)).toBeUndefined();
  });

  it("should report a missing bit as not found", async () => {
    expect(await updateKnowledgeBitScheduleControls("kb_missing", { suspended: true, tz: "UTC" }, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
