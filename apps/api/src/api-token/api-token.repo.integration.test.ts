import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import { createOwnerUser } from "../auth/create-user.js";
import { hashApiToken } from "./api-token.hash.js";
import { findActiveTokenByHash, insertApiToken, UnknownTokenOwnerError } from "./api-token.repo.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `api_token_test_${randomUUID().replace(/-/g, "_")}`;

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

let adminPool: pg.Pool;
let testPool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);

  testPool = new pg.Pool({ connectionString: withDatabaseName(BASE_DATABASE_URL, TEST_DB_NAME) });
  db = drizzle(testPool, { schema });

  await migrate(db, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
}, 60_000);

afterAll(async () => {
  await testPool?.end();

  if (adminPool) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { rows } = await adminPool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1`,
        [TEST_DB_NAME],
      );

      if (rows[0].n === 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await adminPool.end();
  }
}, 30_000);

async function tokenCount(): Promise<number> {
  return (await db.select().from(schema.apiTokens)).length;
}

describe("insertApiToken", () => {
  it("should link a token minted for an email to that user, ignoring email case", async () => {
    await createOwnerUser(db, "owner@example.com");
    const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, "owner@example.com"));

    const result = await insertApiToken(
      { label: "phone", tokenHash: hashApiToken("pat_linked"), ownerEmail: "  Owner@Example.com " },
      db,
    );

    expect(result.userId).toBe(owner!.id);

    const [stored] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, result.id));

    expect(stored!.userId).toBe(owner!.id);
  });

  it("should refuse an email with no user and write no token", async () => {
    const before = await tokenCount();

    await expect(
      insertApiToken({ label: "ghost", tokenHash: hashApiToken("pat_ghost"), ownerEmail: "nobody@example.com" }, db),
    ).rejects.toBeInstanceOf(UnknownTokenOwnerError);

    expect(await tokenCount()).toBe(before);
  });

  it("should keep a token without an email working and ownerless", async () => {
    const hash = hashApiToken("pat_legacy");
    const result = await insertApiToken({ label: "legacy", tokenHash: hash }, db);

    expect(result.userId).toBeNull();
    expect(await findActiveTokenByHash(hash, db)).toEqual({ id: result.id, revokedAt: null });
  });

  it("should keep the token usable after its user is deleted", async () => {
    await createOwnerUser(db, "leaver@example.com");
    const hash = hashApiToken("pat_leaver");
    const result = await insertApiToken({ label: "leaver", tokenHash: hash, ownerEmail: "leaver@example.com" }, db);

    await db.delete(schema.users).where(eq(schema.users.email, "leaver@example.com"));

    const [stored] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, result.id));

    expect(stored!.userId).toBeNull();
    expect(await findActiveTokenByHash(hash, db)).not.toBeNull();
  });
});
