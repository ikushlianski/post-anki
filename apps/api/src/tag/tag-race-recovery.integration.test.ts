import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// prose-knowledge-fisher--tag-cap-guard-cleanup, SCENARIO 1/2 — the real-DB
// proof that resolveOrCreateTag's nested-SAVEPOINT fix recovers from a
// genuine unique-violation race both when `db` is the pool (unchanged
// behavior) and when `db` is a transaction already held open by
// resolveTagUnderCapGuard (the bug this fix closes: without the SAVEPOINT,
// the re-select after a unique-violation runs on an aborted transaction and
// throws instead of recovering).

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

const dbName = `tag_race_recovery_${randomUUID().replace(/-/g, "_")}`;
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

const { resolveOrCreateTag } = await import("./tag.repo.js");
const { withNamedLock } = await import("../shared/merge-lock.js");

describe("resolveOrCreateTag race recovery", () => {
  afterAll(async () => {
    await closeDb();
    const cleanupPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

    await cleanupPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await cleanupPool.end();
  });

  it("recovers a real unique-violation race called directly against the pool", async () => {
    const name = `race concept pool ${randomUUID()}`;

    const [resultA, resultB] = await Promise.all([
      resolveOrCreateTag(name),
      resolveOrCreateTag(name),
    ]);

    expect(resultA.id).toBe(resultB.id);
  });

  it("recovers a real unique-violation race when called inside an already-open transaction, the same way resolveTagUnderCapGuard holds one open", async () => {
    const name = `race concept tx ${randomUUID()}`;

    const [heldTxResult, poolResult] = await Promise.all([
      withNamedLock("race-recovery-test-lock", async (tx) => resolveOrCreateTag(name, tx)),
      resolveOrCreateTag(name),
    ]);

    expect(heldTxResult.id).toBe(poolResult.id);
  });
});
