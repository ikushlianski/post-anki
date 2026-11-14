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

const dbName = `api_token_owner_${randomUUID().replace(/-/g, "_")}`;
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

const { listApiTokens, getApiTokenSummary, revokeApiTokenById } = await import("./api-token.owner.repo.js");

async function seedToken(label: string, createdAt: string, scopes: string[] = ["cards:write"]): Promise<string> {
  const tokenId = `atk_${randomUUID()}`;

  await client.query(
    `INSERT INTO api_tokens (id, label, token_hash, created_at, scopes) VALUES ($1, $2, $3, $4, $5)`,
    [tokenId, label, `hash_${randomUUID()}`, createdAt, scopes],
  );

  return tokenId;
}

describe("API key listing and revoking against a real database", () => {
  it("should list keys newest first with their scopes and never expose the key hash", async () => {
    const older = await seedToken("older", "2026-01-01T00:00:00Z", ["knowledge:write"]);
    const newer = await seedToken("newer", "2026-02-01T00:00:00Z");

    const listed = (await listApiTokens()).filter((token) => [older, newer].includes(token.id));

    expect(listed.map((token) => token.id)).toEqual([newer, older]);
    expect(listed[1]).toMatchObject({ name: "older", scopes: ["knowledge:write"], lastUsedAt: null, revokedAt: null });
    expect(Object.keys(listed[0]!)).not.toContain("tokenHash");
  });

  it("should revoke a key once and report false when it is already revoked or unknown", async () => {
    const tokenId = await seedToken("to-revoke", "2026-03-01T00:00:00Z");

    expect(await revokeApiTokenById(tokenId)).toBe(true);
    expect(await revokeApiTokenById(tokenId)).toBe(false);
    expect(await revokeApiTokenById("atk_missing")).toBe(false);
    expect((await getApiTokenSummary(tokenId))?.revokedAt).not.toBeNull();
  });

  it("should keep a revoked key in the list and leave other keys active", async () => {
    const revoked = await seedToken("revoked-one", "2026-04-01T00:00:00Z");
    const active = await seedToken("active-one", "2026-04-02T00:00:00Z");

    await revokeApiTokenById(revoked);

    expect((await getApiTokenSummary(revoked))?.revokedAt).not.toBeNull();
    expect((await getApiTokenSummary(active))?.revokedAt).toBeNull();
    expect(await getApiTokenSummary("atk_missing")).toBeNull();
  });
});
