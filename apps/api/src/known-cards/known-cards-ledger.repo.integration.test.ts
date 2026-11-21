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

const dbName = `known_cards_ledger_${randomUUID().replace(/-/g, "_")}`;
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

const { sumFeatureUsage, listRecentFeatureSteps } = await import(
  "../llm-call-events/feature-ledger.repo.js"
);
const { recordKnownCardsSkip } = await import("./known-cards-ledger.repo.js");

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

async function seed(op: string, outcome: string, cost: number, tokens: number, minutesAgo: number): Promise<void> {
  await client.query(
    `INSERT INTO llm_call_events (id, op, agent_key, duration_ms, success, outcome, cost_usd, total_tokens, created_at)
     VALUES ($1, $2, 'agent', 10, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval)`,
    [`evt_${randomUUID()}`, op, outcome === "ok", outcome, cost, tokens, String(minutesAgo)],
  );
}

describe("sumFeatureUsage unmetered failures", () => {
  it("should count failed calls with no cost or tokens, and not failed calls with real usage", async () => {
    await client.query(
      `INSERT INTO llm_call_events (id, op, agent_key, duration_ms, success, outcome, created_at)
       VALUES ($1, 'ledger_e_judge', 'agent', 10, false, 'failed', now())`,
      [`evt_${randomUUID()}`],
    );
    await seed("ledger_e_embed", "failed", 0.01, 100, 0);

    const usage = await sumFeatureUsage("ledger_e_", new Date(Date.now() - 86_400_000), new Date(Date.now() - 86_400_000));

    expect(usage.dayUnmeteredFailures).toBe(1);
    expect(usage.monthUnmeteredFailures).toBe(1);
  });
});

describe("sumFeatureUsage", () => {
  it("should add cost and tokens of only this feature's ok and failed calls, split by day and month", async () => {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    await seed("ledger_a_judge", "ok", 0.01, 1000, 0);
    await seed("ledger_a_embed", "failed", 0.02, 2000, 0);
    await seed("ledger_a_step", "skipped_cap", 5, 5000, 0);
    await seed("ledger_b_judge", "ok", 9, 9000, 0);

    const usage = await sumFeatureUsage("ledger_a_", dayStart, monthStart);

    expect(usage.dayCostUsd).toBeCloseTo(0.03, 6);
    expect(usage.dayTokens).toBe(3000);
    expect(usage.monthCostUsd).toBeGreaterThanOrEqual(usage.dayCostUsd);
  });

  it("should treat an underscore in the prefix literally", async () => {
    await seed("ledgerXc_judge", "ok", 7, 7000, 0);

    const usage = await sumFeatureUsage("ledger_c_", new Date(0), new Date(0));

    expect(usage.monthCostUsd).toBe(0);
  });
});

describe("listRecentFeatureSteps", () => {
  it("should return newest first for the step op only, skipping skipped rows and per-call rows", async () => {
    await seed("ledger_d_step", "failed", 0, 0, 30);
    await seed("ledger_d_step", "ok", 0, 0, 20);
    await seed("ledger_d_judge", "failed", 0, 0, 15);
    await seed("ledger_d_step", "skipped_breaker", 0, 0, 10);

    const rows = await listRecentFeatureSteps("ledger_d_step", 5);

    expect(rows.map((row) => row.outcome)).toEqual(["ok", "failed"]);
  });
});

describe("recordKnownCardsSkip", () => {
  it("should write a zero-cost step row carrying the skip outcome and source", async () => {
    await recordKnownCardsSkip("skipped_cap", "src_skip");

    const { rows } = await client.query(
      `SELECT outcome, cost_usd, total_tokens, knowledge_source_id FROM llm_call_events WHERE op = 'known_cards_step'`,
    );

    expect(rows[0]).toMatchObject({ outcome: "skipped_cap", total_tokens: 0, knowledge_source_id: "src_skip" });
    expect(Number(rows[0].cost_usd)).toBe(0);
  });
});
