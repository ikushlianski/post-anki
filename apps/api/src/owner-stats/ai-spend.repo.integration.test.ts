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

const dbName = `ai_spend_${randomUUID().replace(/-/g, "_")}`;
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

const { readAiSpendRows } = await import("./ai-spend.repo.js");

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

async function seed(agentKey: string, createdAt: string, prompt: number | null, completion: number | null, modelId: string | null): Promise<void> {
  await client.query(
    `INSERT INTO llm_call_events (id, op, agent_key, duration_ms, success, prompt_tokens, completion_tokens, model_id, created_at)
     VALUES ($1, 'op', $2, 10, true, $3, $4, $5, $6::timestamptz)`,
    [`evt_${randomUUID()}`, agentKey, prompt, completion, modelId, createdAt],
  );
}

describe("readAiSpendRows", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("should bucket calls by the owner's local day, not the UTC day", async () => {
    await seed("a1", "2026-10-09T23:30:00Z", 100, 10, "m1");

    const rows = await readAiSpendRows({ tz: "Europe/Warsaw", days: 5, now });

    expect(rows.find((r) => r.agentKey === "a1")?.date).toBe("2026-10-10");
  });

  it("should sum tokens per day, agent and model and leave out calls older than the window", async () => {
    await seed("a2", "2026-10-08T10:00:00Z", 100, 10, "m1");
    await seed("a2", "2026-10-08T11:00:00Z", 200, 20, "m1");
    await seed("a2", "2026-09-01T11:00:00Z", 999, 99, "m1");

    const rows = (await readAiSpendRows({ tz: "UTC", days: 5, now })).filter((r) => r.agentKey === "a2");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ calls: 2, priceableCalls: 2, promptTokens: 300, completionTokens: 30 });
  });

  it("should keep calls without token counts out of the priceable sums", async () => {
    await seed("a3", "2026-10-08T10:00:00Z", null, null, null);
    await seed("a3", "2026-10-08T10:00:00Z", 50, 5, null);

    const rows = (await readAiSpendRows({ tz: "UTC", days: 5, now })).filter((r) => r.agentKey === "a3");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ calls: 2, priceableCalls: 1, promptTokens: 50, completionTokens: 5 });
  });
});
