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

const dbName = `owner_marker_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { claimOrLoadSourceForExtraction, failSourceByEngineRunId, failSourceOwnedByWorkflow } = await import("./knowledge-bit.repo.js");

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
}, 30_000);

async function seedPending(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`, [id]);

  return id;
}

async function seedProcessing(marker: string | null, status = "processing"): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason) VALUES ($1, 'prose', 'x', $2, $3)`,
    [id, status, marker],
  );

  return id;
}

async function readSource(id: string): Promise<{ status: string; failure_reason: string | null; updated_at: Date }> {
  const result = await client.query(`SELECT status, failure_reason, updated_at FROM knowledge_sources WHERE id = $1`, [id]);

  return result.rows[0];
}

describe("durable owner marker (real Postgres)", () => {
  it("should add the engine run id to a plain marker without touching the claim token", async () => {
    const id = await seedPending();
    const workflowId = `${id}:5`;
    const first = await claimOrLoadSourceForExtraction(id, { regeneration: false, workflowId });
    const plain = await readSource(id);

    expect(plain.failure_reason).toBe(`durable:${workflowId}`);

    const upgraded = await claimOrLoadSourceForExtraction(id, { regeneration: false, workflowId, engineRunId: "run_A" });
    const after = await readSource(id);

    expect(after.failure_reason).toBe(`durable:${workflowId}#run_A`);
    expect(after.updated_at.getTime()).toBe(plain.updated_at.getTime());
    expect(upgraded?.claimedAt.getTime()).toBe(first?.claimedAt.getTime());
  }, 30_000);

  it("should keep recognising the owner after the run id was added, and refuse another workflow", async () => {
    const id = await seedPending();
    const workflowId = `${id}:5`;

    await claimOrLoadSourceForExtraction(id, { regeneration: false, workflowId, engineRunId: "run_A" });

    expect(await claimOrLoadSourceForExtraction(id, { regeneration: false, workflowId })).not.toBeNull();
    expect(await claimOrLoadSourceForExtraction(id, { regeneration: false, workflowId: `${id}:6` })).toBeNull();
  }, 30_000);

  it("should fail only the processing source whose marker carries the run id", async () => {
    const target = await seedProcessing(`durable:ksrc_t:1#run_A`);
    const neighbour = await seedProcessing(`durable:ksrc_n:1#run_B`);
    const alreadyDone = await seedProcessing(`durable:ksrc_d:1#run_A`, "bits_detected");

    expect(await failSourceByEngineRunId("run_A", "workflow_timed_out")).toBe(true);

    expect(await readSource(target)).toMatchObject({ status: "failed", failure_reason: "workflow_timed_out" });
    expect(await readSource(neighbour)).toMatchObject({ status: "processing", failure_reason: "durable:ksrc_n:1#run_B" });
    expect(await readSource(alreadyDone)).toMatchObject({ status: "bits_detected", failure_reason: "durable:ksrc_d:1#run_A" });
  }, 30_000);

  it("should change nothing for an unknown run id or for another source's id", async () => {
    const sourceId = await seedProcessing(`durable:ksrc_x:1#run_known`);
    const other = await seedProcessing(`durable:ksrc_y:1`);

    expect(await failSourceByEngineRunId("run_unknown", "workflow_timed_out")).toBe(false);
    expect(await failSourceByEngineRunId(other, "workflow_timed_out")).toBe(false);
    expect(await failSourceByEngineRunId("ksrc_x", "workflow_timed_out")).toBe(false);

    expect(await readSource(sourceId)).toMatchObject({ status: "processing", failure_reason: "durable:ksrc_x:1#run_known" });
    expect(await readSource(other)).toMatchObject({ status: "processing", failure_reason: "durable:ksrc_y:1" });
  }, 30_000);

  it("should treat percent and underscore in a run id as plain characters, not wildcards", async () => {
    const id = await seedProcessing(`durable:ksrc_w:1#run_X1`);

    expect(await failSourceByEngineRunId("%", "workflow_timed_out")).toBe(false);
    expect(await failSourceByEngineRunId("run_X_", "workflow_timed_out")).toBe(false);
    expect(await failSourceByEngineRunId("%X1", "workflow_timed_out")).toBe(false);
    expect(await readSource(id)).toMatchObject({ status: "processing", failure_reason: "durable:ksrc_w:1#run_X1" });
    expect(await failSourceByEngineRunId("run_X1", "workflow_timed_out")).toBe(true);
  }, 30_000);

  it("should not fail a regenerated source when the superseded older run is cancelled or fails late", async () => {
    const id = await seedProcessing(null);

    await client.query(`UPDATE knowledge_sources SET failure_reason = $2 WHERE id = $1`, [id, `durable:${id}:2#run_NEW`]);

    expect(await failSourceByEngineRunId("run_OLD", "extraction_failed")).toBe(false);
    expect(await failSourceOwnedByWorkflow(id, `${id}:1`, "extraction_failed")).toBe(false);
    expect(await readSource(id)).toMatchObject({ status: "processing", failure_reason: `durable:${id}:2#run_NEW` });
    expect(await failSourceByEngineRunId("run_NEW", "extraction_failed")).toBe(true);
  }, 30_000);
});
