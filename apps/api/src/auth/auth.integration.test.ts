import { randomUUID } from "node:crypto";
import pg from "pg";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.BETTER_AUTH_SECRET = "integration-test-secret-integration-test";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `web_auth_test_${randomUUID().replace(/-/g, "_")}`;
const ORIGIN = "http://localhost:5540";

assertLocalDbTarget(BASE_DATABASE_URL);

process.env.DATABASE_URL = BASE_DATABASE_URL;

const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${TEST_DB_NAME}`;

const sentLinks: { email: string; url: string }[] = [];

vi.mock("./auth-email.js", () => ({
  sendAuthEmail: vi.fn(async (email: { to: string; text: string }) => {
    sentLinks.push({ email: email.to, url: /https?:\/\/\S+/.exec(email.text)?.[0] ?? "" });
  }),
}));

let adminPool: pg.Pool;
let pool: pg.Pool;
let db: Db;
let auth: Awaited<ReturnType<typeof buildAuth>>;

async function buildAuth() {
  const { createAuth } = await import("./auth.js");
  const { createMagicLinkSender } = await import("./send-magic-link.js");
  const { sendAuthEmail } = await import("./auth-email.js");
  const sender = createMagicLinkSender({
    userExists: async (email) =>
      (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1)).length > 0,
    sendEmail: sendAuthEmail,
    wait: async () => undefined,
  });

  return createAuth(db, sender);
}

function requestLink(email: string, ip: string): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-pa-client-ip": ip },
      body: JSON.stringify({ email, callbackURL: "/" }),
    }),
  );
}

function openLink(link: string, ip = "10.0.0.1"): Promise<Response> {
  return auth.handler(new Request(link, { headers: { "x-pa-client-ip": ip } }));
}

async function tableCount(table: typeof schema.users | typeof schema.sessions): Promise<number> {
  const [row] = await db.select({ total: count() }).from(table);

  return row?.total ?? 0;
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
  await db.insert(schema.users).values({ id: "user_owner", name: "Owner", email: "owner@example.com", emailVerified: true });
  auth = await buildAuth();
});

afterAll(async () => {
  await pool?.end();
  await adminPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await adminPool?.end();
});

describe("magic link sign-in", () => {
  it("should sign the owner in with the emailed link and refuse the same link a second time", async () => {
    sentLinks.length = 0;
    await requestLink("owner@example.com", "10.0.1.1");

    const link = sentLinks[0]?.url ?? "";
    const first = await openLink(link);

    expect(first.status).toBe(302);
    expect(first.headers.get("set-cookie")).toContain("session_token");
    expect(await tableCount(schema.sessions)).toBe(1);

    const second = await openLink(link);

    expect(second.headers.get("set-cookie") ?? "").not.toContain("session_token");
    expect(second.headers.get("location") ?? "").toContain("error=");
  });

  it("should refuse a link that has expired", async () => {
    sentLinks.length = 0;
    await requestLink("owner@example.com", "10.0.1.2");
    await db.update(schema.verifications).set({ expiresAt: sql`now() - interval '1 minute'` });

    const response = await openLink(sentLinks[0]?.url ?? "");

    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
    expect(response.headers.get("location") ?? "").toContain("error=");
  });

  it("should answer an unknown email like a known one without emailing, creating a user or a session", async () => {
    sentLinks.length = 0;
    const usersBefore = await tableCount(schema.users);
    const sessionsBefore = await tableCount(schema.sessions);

    const response = await requestLink("stranger@example.com", "10.0.1.3");

    expect(response.status).toBe(200);
    expect(sentLinks).toHaveLength(0);
    expect(await tableCount(schema.users)).toBe(usersBefore);
    expect(await tableCount(schema.sessions)).toBe(sessionsBefore);
  });

  it("should limit a client to five sign-in requests per minute", async () => {
    const statuses: number[] = [];

    for (let i = 0; i < 6; i += 1) {
      statuses.push((await requestLink("owner@example.com", "10.0.9.9")).status);
    }

    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});

describe("expired auth row purge", () => {
  it("should delete expired verifications and sessions while keeping live ones", async () => {
    const { purgeExpiredAuthRows } = await import("./purge-expired-auth-rows.js");
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    await db.delete(schema.verifications);
    await db.delete(schema.sessions);
    await db.insert(schema.verifications).values([
      { id: "v_old", identifier: "a", value: "x", expiresAt: past },
      { id: "v_live", identifier: "b", value: "y", expiresAt: future },
    ]);
    await db.insert(schema.sessions).values([
      { id: "s_old", token: "t_old", userId: "user_owner", expiresAt: past },
      { id: "s_live", token: "t_live", userId: "user_owner", expiresAt: future },
    ]);

    await purgeExpiredAuthRows(db);

    const remainingVerifications = await db.select({ id: schema.verifications.id }).from(schema.verifications);
    const remainingSessions = await db.select({ id: schema.sessions.id }).from(schema.sessions);

    expect(remainingVerifications.map((r) => r.id)).toEqual(["v_live"]);
    expect(remainingSessions.map((r) => r.id)).toEqual(["s_live"]);
  });
});
