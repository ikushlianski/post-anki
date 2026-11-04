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

const dbName = `chat_outcomes_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getChatQueueOutcomesStatistics } = await import("./chat-queue-outcomes-statistics.service.js");

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

async function seedBit(
  state: string,
  chatAt: string | null,
  snoozedUntil: string | null = null,
  source = "ks1",
): Promise<void> {
  ordinal += 1;
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at, chat_snoozed_until)
     VALUES ($1, $4, $2, 'Body', $3, ${chatAt}, ${snoozedUntil})`,
    [`kb${ordinal}`, ordinal, state, source],
  );
}

describe("getChatQueueOutcomesStatistics (real Postgres)", () => {
  it("should report zeros when no card was sent to Chat", async () => {
    expect(await getChatQueueOutcomesStatistics()).toMatchObject({ total: 0, accepted: 0, rejected: 0, waiting: 0, snoozed: 0 });
  });

  it("should split Chat cards of the last 30 days by what became of them and ignore older ones", async () => {
    await client.query(`INSERT INTO knowledge_sources (id, kind) VALUES ('ks1','text')`);
    await seedBit("approved", "now() - interval '2 days'");
    await seedBit("approved", "now() - interval '5 days'");
    await seedBit("rejected", "now() - interval '3 days'");
    await seedBit("chat", "now() - interval '1 day'");
    await seedBit("chat", "now() - interval '4 days'", "now() + interval '2 days'");
    await seedBit("chat", "now() - interval '4 days'", "now() - interval '1 day'");
    await seedBit("approved", "now() - interval '40 days'");
    await seedBit("chat", "now() - interval '31 days'");
    await seedBit("approved", "NULL");
    await seedBit("pending", "NULL");

    expect(await getChatQueueOutcomesStatistics()).toEqual({
      windowDays: 30,
      total: 6,
      accepted: 2,
      rejected: 1,
      waiting: 2,
      snoozed: 1,
    });
  });

  it("should not count waiting or snoozed Chat cards whose source is missing", async () => {
    const before = await getChatQueueOutcomesStatistics();

    await seedBit("chat", "now() - interval '1 day'", null, "ks_missing");
    await seedBit("chat", "now() - interval '1 day'", "now() + interval '2 days'", "ks_missing");

    expect(await getChatQueueOutcomesStatistics()).toEqual(before);
  });
});
