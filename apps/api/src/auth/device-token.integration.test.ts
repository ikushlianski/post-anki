import { randomUUID } from "node:crypto";
import pg from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.BETTER_AUTH_SECRET = "integration-test-secret-integration-test";
process.env.OWNER_EMAIL = "owner@example.com";

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `device_token_test_${randomUUID().replace(/-/g, "_")}`;
const PASSWORD = "correct horse battery staple";

assertLocalDbTarget(BASE_DATABASE_URL);

process.env.DATABASE_URL = BASE_DATABASE_URL;

const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${TEST_DB_NAME}`;

let adminPool: pg.Pool;
let pool: pg.Pool;
let db: Db;
let createDeviceToken: typeof import("./device-token.js").createDeviceToken;

vi.mock("../db/client.js", async () => ({ getDb: () => db }));

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  pool = new pg.Pool({ connectionString: url.toString() });
  db = drizzle(pool, { schema });
  await migrate(drizzle(pool), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await db.insert(schema.users).values({ id: "user_owner", name: "Owner", email: "owner@example.com", emailVerified: true });

  const { createAuth } = await import("./auth.js");
  const auth = createAuth(db);
  const context = await auth.$context;

  await db.insert(schema.accounts).values({
    id: "acct_owner",
    accountId: "user_owner",
    providerId: "credential",
    userId: "user_owner",
    password: await context.password.hash(PASSWORD),
  });

  ({ createDeviceToken } = await import("./device-token.js"));
  const { insertApiToken } = await import("../api-token/api-token.repo.js");

  deps = {
    authHandler: (request) => auth.handler(request),
    insertToken: (input) => insertApiToken(input, db),
    baseUrl: "http://localhost:5540",
  };
});

let deps: Parameters<typeof import("./device-token.js").createDeviceToken>[2];

afterAll(async () => {
  await pool?.end();
  await adminPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await adminPool?.end();
});

describe("device token sign-in against a real database", () => {
  it("should mint a token for the owner password, store only its hash, and leave no session behind", async () => {
    const outcome = await createDeviceToken({ email: "owner@example.com", password: PASSWORD, label: "Mac" }, "10.1.0.1", deps);

    expect(outcome.kind).toBe("created");

    const { hashApiToken } = await import("../api-token/api-token.hash.js");
    const token = outcome.kind === "created" ? outcome.token : "";
    const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hashApiToken(token)));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Mac");
    expect(rows[0]?.userId).toBe("user_owner");
    expect(rows[0]?.revokedAt).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
  });

  it("should refuse a wrong password and an unknown email the same way and mint nothing", async () => {
    const before = (await db.select().from(schema.apiTokens)).length;
    const wrong = await createDeviceToken({ email: "owner@example.com", password: "not the password", label: "Mac" }, "10.1.0.2", deps);
    const other = await createDeviceToken({ email: "other@example.com", password: PASSWORD, label: "Mac" }, "10.1.0.3", deps);

    expect(wrong).toEqual({ kind: "invalid_credentials" });
    expect(other).toEqual({ kind: "invalid_credentials" });
    expect(await db.select().from(schema.apiTokens)).toHaveLength(before);
  });

  it("should rate limit repeated password attempts from one client", async () => {
    const kinds: string[] = [];

    for (let i = 0; i < 8; i++) {
      kinds.push((await createDeviceToken({ email: "owner@example.com", password: "wrong password", label: "Mac" }, "10.1.0.99", deps)).kind);
    }

    expect(kinds).toContain("rate_limited");
  });
});
