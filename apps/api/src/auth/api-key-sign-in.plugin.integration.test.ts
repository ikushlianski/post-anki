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
process.env.RESEND_API_KEY = "";
process.env.OWNER_EMAIL = "owner@example.com";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `api_key_test_${randomUUID().replace(/-/g, "_")}`;
const ORIGIN = "http://localhost:5540";
const VALID_KEY = "pat_valid_web_key_0123456789";
const REVOKED_KEY = "pat_revoked_web_key_0123456789";
const OTHER_USER_KEY = "pat_other_user_key_0123456789";

assertLocalDbTarget(BASE_DATABASE_URL);

process.env.DATABASE_URL = BASE_DATABASE_URL;

const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${TEST_DB_NAME}`;

let adminPool: pg.Pool;
let pool: pg.Pool;
let db: Db;
let auth: Awaited<ReturnType<typeof buildAuth>>;
let hashApiToken: (raw: string) => string;
let ipCounter = 0;

async function buildAuth() {
  const { createAuth } = await import("./auth.js");

  return createAuth(db);
}

function signInWithKey(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  ipCounter += 1;

  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/api-key`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-pa-client-ip": `10.1.0.${ipCounter}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
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
  ({ hashApiToken } = await import("../api-token/api-token.hash.js"));
  await db.insert(schema.users).values({ id: "user_stranger", name: "S", email: "stranger@example.com", emailVerified: true });
  await db.insert(schema.apiTokens).values([
    { id: "tok_valid", label: "web", tokenHash: hashApiToken(VALID_KEY) },
    { id: "tok_revoked", label: "old", tokenHash: hashApiToken(REVOKED_KEY), revokedAt: new Date(Date.now() - 1000) },
    { id: "tok_other", label: "other", tokenHash: hashApiToken(OTHER_USER_KEY), userId: "user_stranger" },
  ]);
  auth = await buildAuth();
});

afterAll(async () => {
  await pool?.end();
  await adminPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await adminPool?.end();
});

describe("key sign-in", () => {
  it("should create the owner on first use and return a session cookie for the owner", async () => {
    expect(await db.select().from(schema.users).where(eq(schema.users.email, "owner@example.com"))).toHaveLength(0);

    const response = await signInWithKey({ key: VALID_KEY });
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("session_token");
    expect(cookie.toLowerCase()).toContain("httponly");

    const owners = await db.select().from(schema.users).where(eq(schema.users.email, "owner@example.com"));
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, owners[0]?.id ?? ""));

    expect(owners).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });

  it("should produce a cookie that the session lookup accepts as the owner", async () => {
    const response = await signInWithKey({ key: VALID_KEY });
    const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const session = await auth.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, "x-pa-client-ip": "10.1.99.1" } }),
    );

    expect(((await session.json()) as { user: { email: string } }).user.email).toBe("owner@example.com");
  });

  it("should record the last use and keep one owner row across repeated sign-ins", async () => {
    await signInWithKey({ key: VALID_KEY });
    const [token] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, "tok_valid"));

    expect(token?.lastUsedAt).not.toBeNull();
    expect(await db.select().from(schema.users).where(eq(schema.users.email, "owner@example.com"))).toHaveLength(1);
  });

  it("should give unknown, revoked, malformed, empty and other-user keys the identical failure without a cookie", async () => {
    const responses = await Promise.all([
      signInWithKey({ key: "pat_does_not_exist" }),
      signInWithKey({ key: REVOKED_KEY }),
      signInWithKey({ key: OTHER_USER_KEY }),
      signInWithKey({ key: "" }),
      signInWithKey({ key: 42 }),
      signInWithKey({}),
    ]);
    const bodies = await Promise.all(responses.map((r) => r.text()));

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(new Set(bodies).size).toBe(1);
    expect(responses.every((r) => r.headers.get("set-cookie") === null)).toBe(true);
  });

  it("should refuse a request from a foreign origin", async () => {
    const response = await signInWithKey({ key: VALID_KEY }, { origin: "https://evil.example.com" });

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("should refuse the shared secret as a key", async () => {
    const response = await signInWithKey({ key: "the-shared-secret" });

    expect(response.status).toBe(401);
  });

  it("should limit key attempts to five per minute per client", async () => {
    const statuses: number[] = [];

    for (let i = 0; i < 6; i += 1) {
      statuses.push((await signInWithKey({ key: "pat_nope" }, { "x-pa-client-ip": "10.1.200.1" })).status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("should never write the key or its hash to any log output", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");

    await signInWithKey({ key: REVOKED_KEY });
    await signInWithKey({ key: VALID_KEY }, { origin: "https://evil.example.com" });
    await signInWithKey({ key: "pat_unknown_logged_key" });

    const output = [...spies, stdout, stderr].flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");

    for (const secret of [REVOKED_KEY, VALID_KEY, "pat_unknown_logged_key", hashApiToken(REVOKED_KEY), hashApiToken(VALID_KEY)]) {
      expect(output).not.toContain(secret);
    }

    vi.restoreAllMocks();
  });

  it("should answer unavailable, never success, when the token lookup fails", async () => {
    const original = db.select.bind(db) as (...args: unknown[]) => { from: (table: unknown) => unknown };
    const spy = vi.spyOn(db, "select").mockImplementation(((...args: unknown[]) => {
      const query = original(...args);
      const from = query.from.bind(query);

      query.from = (table: unknown) => {
        if (table === schema.apiTokens) {
          throw new Error(`db down ${VALID_KEY}`);
        }

        return from(table);
      };

      return query;
    }) as unknown as typeof db.select);

    const response = await signInWithKey({ key: VALID_KEY });

    spy.mockRestore();
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain(VALID_KEY);
  });
});

describe("session token lookup used by the API gate", () => {
  async function lookup(token: string) {
    return auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
  }

  it("should accept a live session token and refuse a tampered, revoked or expired one", async () => {
    const token = (await signInWithKey({ key: VALID_KEY })).headers.get("set-auth-token") ?? "";

    expect(token).not.toBe("");
    expect((await lookup(token))?.user.email).toBe("owner@example.com");
    expect(await lookup(`${token}x`)).toBeNull();
    expect(await lookup("garbage.value")).toBeNull();

    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await lookup(token)).toBeNull();

    await db.delete(schema.sessions);
    expect(await lookup(token)).toBeNull();
  });
});
