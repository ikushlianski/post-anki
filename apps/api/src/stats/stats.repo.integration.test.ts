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

const dbName = `stats_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { saveRecommendation, getRecommendationsForTopics } = await import("./stats.repo.js");

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

describe("saveRecommendation (real Postgres)", () => {
  it("should replace the stored recommendation for a topic", async () => {
    const topicId = `topic_${randomUUID()}`;

    await saveRecommendation(topicId, "first", ["a"], "2026-01-01T00:00:00.000Z");
    await saveRecommendation(topicId, "second", ["b"], "2026-01-02T00:00:00.000Z");

    const stored = await getRecommendationsForTopics([topicId]);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.text).toBe("second");
  });

  it("should keep the old recommendation when saving the new one fails", async () => {
    const topicId = `topic_${randomUUID()}`;

    await saveRecommendation(topicId, "keep me", ["a"], "2026-01-01T00:00:00.000Z");

    await expect(
      saveRecommendation(topicId, null as unknown as string, [], "2026-01-02T00:00:00.000Z"),
    ).rejects.toThrow();

    const stored = await getRecommendationsForTopics([topicId]);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.text).toBe("keep me");
  });
});
