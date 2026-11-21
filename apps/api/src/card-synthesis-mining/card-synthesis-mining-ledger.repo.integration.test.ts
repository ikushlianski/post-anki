import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `card_synthesis_mining_${randomUUID().replace(/-/g, "_")}`;
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

const { markBitsExamined, insertMiningCluster, recordMiningStep } = await import(
  "./card-synthesis-mining-ledger.repo.js"
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

describe("markBitsExamined", () => {
  it("should record a card as examined only once, keeping the first run", async () => {
    const first = await markBitsExamined(["bitA", "bitB"], "run1", null, "singleton");
    const second = await markBitsExamined(["bitB", "bitC"], "run2", "c2", "failed");

    const { rows } = await client.query(
      "SELECT bit_id, run_id FROM synthesis_mining_examined_bits ORDER BY bit_id",
    );

    expect(first).toBe(2);
    expect(second).toBe(1);
    expect(rows).toEqual([
      { bit_id: "bitA", run_id: "run1" },
      { bit_id: "bitB", run_id: "run1" },
      { bit_id: "bitC", run_id: "run2" },
    ]);
  });
});

describe("insertMiningCluster", () => {
  it("should store the evidence cards and a nullable resulting source", async () => {
    await insertMiningCluster({
      id: "cl1",
      runId: "run1",
      subjectId: "subj1",
      bitIds: ["bitA", "bitB", "bitC"],
      evidenceBitIds: ["bitA", "bitB"],
      evidenceLink: [{ bitId: "bitA", snippet: "step one" }],
      outcome: "not_chain",
      sourceId: null,
    });

    const { rows } = await client.query(
      "SELECT evidence_bit_ids, evidence_link, source_id FROM synthesis_mining_clusters WHERE id = 'cl1'",
    );

    expect(rows[0]).toEqual({
      evidence_bit_ids: ["bitA", "bitB"],
      evidence_link: [{ bitId: "bitA", snippet: "step one" }],
      source_id: null,
    });
  });
});

describe("recordMiningStep", () => {
  it("should write one metered step row carrying the run and cluster ids", async () => {
    await recordMiningStep("ok", "run1", "cl1", 12);

    const { rows } = await client.query(
      "SELECT run_id, cluster_id, outcome, cost_usd FROM llm_call_events WHERE op = 'card_synthesis_mining_step'",
    );

    expect(rows).toEqual([{ run_id: "run1", cluster_id: "cl1", outcome: "ok", cost_usd: "0.000000" }]);
  });
});
