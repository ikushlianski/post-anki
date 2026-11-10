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

const dbName = `card_quality_${randomUUID().replace(/-/g, "_")}`;
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

const { getCardQualityByModel } = await import("./card-quality.orchestrator.js");
const backfill = await import("../knowledge-bit/card-model-backfill.repo.js");
const { planCardModelBackfill } = await import("../knowledge-bit/card-model-backfill.js");

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

let ordinal = 0;

async function seedSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 't', 'bits_detected')`,
    [id],
  );

  return id;
}

async function seedBit(sourceId: string, state: string, modelId: string | null, origin = "extracted"): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, generated_by_model_id)
     VALUES ($1, $2, $3, 'body', $4, $5, $6)`,
    [id, sourceId, ordinal++, state, origin, modelId],
  );

  return id;
}

async function seedFeedback(
  bitId: string,
  sourceId: string,
  verdict: string,
  rating: number | null,
  reason: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_feedback (id, knowledge_source_id, knowledge_bit_id, verdict, reason_code, rating, statement)
     VALUES ($1, $2, $3, $4, $5, $6, 's')`,
    [`kbf_${randomUUID()}`, sourceId, bitId, verdict, reason, rating],
  );
}

describe("getCardQualityByModel (real Postgres)", () => {
  it("should count cards per model, bucket unstamped cards as unknown and leave manual cards out", async () => {
    const sourceId = await seedSource();
    const approved = await seedBit(sourceId, "approved", "m/a");
    const rejected = await seedBit(sourceId, "rejected", "m/a");

    await seedBit(sourceId, "pending", "m/a");
    await seedBit(sourceId, "superseded", "m/a");
    await seedBit(sourceId, "approved", null);
    await seedBit(sourceId, "approved", "m/a", "manual");
    await seedFeedback(approved, sourceId, "approved", 4, null);
    await seedFeedback(rejected, sourceId, "rejected", 2, "too_trivial");

    const { models } = await getCardQualityByModel(undefined);
    const a = models.find((row) => row.modelId === "m/a");
    const unknown = models.find((row) => row.modelId === "unknown");

    expect(a).toMatchObject({ approved: 1, rejected: 1, pending: 1, superseded: 1, approvalRate: 0.5, averageRating: 3 });
    expect(a?.topReasons).toEqual([{ reasonCode: "too_trivial", count: 1 }]);
    expect(unknown).toMatchObject({ approved: 1, rejected: 0, approvalRate: 1, averageRating: null });
  });

  it("should only count cards created inside the requested window", async () => {
    const sourceId = await seedSource();
    const old = await seedBit(sourceId, "approved", "m/window");

    await client.query(`UPDATE knowledge_bits SET created_at = now() - interval '40 days' WHERE id = $1`, [old]);

    const { models } = await getCardQualityByModel(7);

    expect(models.find((row) => row.modelId === "m/window")).toBeUndefined();
  });
});

describe("card model backfill (real Postgres)", () => {
  it("should fill only empty stamps, copy them to empty feedback rows and never overwrite a set model", async () => {
    const sourceId = await seedSource();

    await client.query(`UPDATE knowledge_sources SET extraction_model_id = 'm/override' WHERE id = $1`, [sourceId]);

    const empty = await seedBit(sourceId, "approved", null);
    const already = await seedBit(sourceId, "approved", "m/kept");

    await seedFeedback(empty, sourceId, "approved", 4, null);
    await seedFeedback(already, sourceId, "approved", 4, null);

    const candidates = (await backfill.listUnstampedCardCandidates()).filter((c) => c.bitId === empty || c.bitId === already);
    const plan = planCardModelBackfill(candidates);

    expect(await backfill.stampCards(plan.reliable)).toBe(1);
    await backfill.copyStampToRecords();

    const bits = await client.query(`SELECT id, generated_by_model_id FROM knowledge_bits WHERE id = ANY($1)`, [[empty, already]]);
    const feedback = await client.query(`SELECT knowledge_bit_id, model_id FROM knowledge_bit_feedback WHERE knowledge_bit_id = ANY($1)`, [[empty, already]]);

    expect(Object.fromEntries(bits.rows.map((r) => [r.id, r.generated_by_model_id]))).toEqual({ [empty]: "m/override", [already]: "m/kept" });
    expect(Object.fromEntries(feedback.rows.map((r) => [r.knowledge_bit_id, r.model_id]))).toEqual({ [empty]: "m/override", [already]: "m/kept" });
  });
});
