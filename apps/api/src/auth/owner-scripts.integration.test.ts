import { randomUUID } from "node:crypto";
import pg from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.BETTER_AUTH_SECRET = "integration-test-secret-integration-test";
process.env.OWNER_EMAIL = "owner@example.com";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `owner_scripts_test_${randomUUID().replace(/-/g, "_")}`;

assertLocalDbTarget(BASE_DATABASE_URL);

process.env.DATABASE_URL = BASE_DATABASE_URL;

const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${TEST_DB_NAME}`;

let adminPool: pg.Pool;
let pool: pg.Pool;
let db: Db;

async function ownerId(): Promise<string> {
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, "owner@example.com"));

  return row?.id ?? "";
}

async function addSession(id: string, userId: string): Promise<void> {
  await db.insert(schema.sessions).values({ id, token: `tok_${id}`, userId, expiresAt: new Date(Date.now() + 60_000) });
}

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  pool = new pg.Pool({ connectionString: url.toString() });
  db = drizzle(pool, { schema });
  await migrate(drizzle(pool), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
});

afterAll(async () => {
  await pool?.end();
  await adminPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await adminPool?.end();
});

describe("setting the owner password", () => {
  it("should create the owner, store a hashed password and sign the owner in with it", async () => {
    const { setOwnerPassword } = await import("./set-owner-password.js");
    const { createAuth } = await import("./auth.js");

    await setOwnerPassword(db, "first password 123");

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, await ownerId()));

    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain("first password 123");

    const response = await createAuth(db).handler(
      new Request("http://localhost:5540/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:5540", "x-pa-client-ip": "10.5.0.1" },
        body: JSON.stringify({ email: "owner@example.com", password: "first password 123" }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("should replace the password on a second run, end all owner sessions and keep one account", async () => {
    const { setOwnerPassword } = await import("./set-owner-password.js");
    const { createAuth } = await import("./auth.js");

    await db.delete(schema.sessions);
    await addSession("s1", await ownerId());
    await setOwnerPassword(db, "second password 456");

    const accountsAfter = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, await ownerId()));
    const sessionsAfter = await db.select().from(schema.sessions);
    const auth = createAuth(db);
    const attempt = (password: string, ip: string) =>
      auth.handler(
        new Request("http://localhost:5540/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:5540", "x-pa-client-ip": ip },
          body: JSON.stringify({ email: "owner@example.com", password }),
        }),
      );

    expect(accountsAfter).toHaveLength(1);
    expect(sessionsAfter).toHaveLength(0);
    expect((await attempt("first password 123", "10.5.0.2")).status).toBe(401);
    expect((await attempt("second password 456", "10.5.0.3")).status).toBe(200);
  });
});

describe("revoking a key", () => {
  it("should mark the key revoked and end every owner session while leaving other keys active", async () => {
    const { revokeApiToken } = await import("../api-token/revoke-api-token.js");
    const id = await ownerId();

    await db.delete(schema.sessions);
    await addSession("r1", id);
    await addSession("r2", id);
    await db.insert(schema.apiTokens).values([
      { id: "tok_web", label: "web", tokenHash: "h1" },
      { id: "tok_phone", label: "Phone", tokenHash: "h2" },
    ]);

    const result = await revokeApiToken(db, "web");
    const tokens = await db.select().from(schema.apiTokens);

    expect(result).toMatchObject({ ok: true, id: "tok_web", sessionsEnded: 2 });
    expect(tokens.find((t) => t.id === "tok_web")?.revokedAt).not.toBeNull();
    expect(tokens.find((t) => t.id === "tok_phone")?.revokedAt).toBeNull();
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
  });

  it("should change nothing and keep sessions when the key is unknown or already revoked", async () => {
    const { revokeApiToken } = await import("../api-token/revoke-api-token.js");

    await addSession("r3", await ownerId());

    expect(await revokeApiToken(db, "missing")).toEqual({ ok: false, reason: "not_found" });
    expect(await revokeApiToken(db, "tok_web")).toEqual({ ok: false, reason: "already_revoked" });
    expect(await db.select().from(schema.sessions)).toHaveLength(1);
  });
});
