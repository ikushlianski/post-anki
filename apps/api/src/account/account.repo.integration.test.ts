import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import { resolveRoute } from "../router.js";
import { getAccount, updateAccountName } from "./account.repo.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postanki_dev";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `account_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
let pool: pg.Pool;

function db() {
  return drizzle(pool, { schema });
}

function session(id: string, userId: string, createdAt: string) {
  return { id, userId, token: `tok_${id}`, createdAt: new Date(createdAt), expiresAt: new Date("2030-01-01") };
}

beforeAll(async () => {
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await db()
    .insert(schema.users)
    .values([
      { id: "u_a", name: "Ann", email: "ann@example.com" },
      { id: "u_b", name: "Bob", email: "bob@example.com" },
    ]);
  await db()
    .insert(schema.sessions)
    .values([
      session("s_a1", "u_a", "2026-01-01T10:00:00Z"),
      session("s_a2", "u_a", "2026-02-01T10:00:00Z"),
      session("s_a3", "u_a", "2026-03-01T10:00:00Z"),
      session("s_a4", "u_a", "2026-04-01T10:00:00Z"),
      session("s_b1", "u_b", "2026-03-15T10:00:00Z"),
    ]);
});

afterAll(async () => {
  await pool?.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

describe("account routes", () => {
  it("should resolve GET and PATCH /account", () => {
    expect(resolveRoute("GET", "/account")?.name).toBe("getAccount");
    expect(resolveRoute("PATCH", "/account")?.name).toBe("updateAccount");
  });
});

describe("getAccount", () => {
  it("should show the sign-in before the current one as last sign-in", async () => {
    const account = await getAccount(db(), {
      userId: "u_a",
      sessionId: "s_a3",
      sessionCreatedAt: new Date("2026-03-01T10:00:00Z"),
    });

    expect(account).toEqual({ email: "ann@example.com", name: "Ann", lastSignInAt: "2026-02-01T10:00:00.000Z" });
  });

  it("should ignore sessions created after the current one", async () => {
    const account = await getAccount(db(), {
      userId: "u_a",
      sessionId: "s_a2",
      sessionCreatedAt: new Date("2026-02-01T10:00:00Z"),
    });

    expect(account?.lastSignInAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("should fall back to the current session when it is the first one", async () => {
    const account = await getAccount(db(), {
      userId: "u_a",
      sessionId: "s_a1",
      sessionCreatedAt: new Date("2026-01-01T10:00:00Z"),
    });

    expect(account?.lastSignInAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("should never use another user's sessions for last sign-in", async () => {
    const account = await getAccount(db(), {
      userId: "u_b",
      sessionId: "s_b1",
      sessionCreatedAt: new Date("2026-03-15T10:00:00Z"),
    });

    expect(account?.lastSignInAt).toBe("2026-03-15T10:00:00.000Z");
  });
});

describe("updateAccountName", () => {
  it("should change only the signed-in user's name", async () => {
    const current = { userId: "u_b", sessionId: "s_b1", sessionCreatedAt: new Date("2026-03-15T10:00:00Z") };
    const updated = await updateAccountName(db(), current, "Robert");
    const other = await getAccount(db(), {
      userId: "u_a",
      sessionId: "s_a4",
      sessionCreatedAt: new Date("2026-04-01T10:00:00Z"),
    });

    expect(updated?.name).toBe("Robert");
    expect(updated?.email).toBe("bob@example.com");
    expect(other?.name).toBe("Ann");
  });

  it("should return null when the user no longer exists", async () => {
    const result = await updateAccountName(
      db(),
      { userId: "u_gone", sessionId: "x", sessionCreatedAt: new Date() },
      "Ghost",
    );

    expect(result).toBeNull();
  });
});
