import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `admin_fusion_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: databaseUrl.toString() });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = databaseUrl.toString();
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { handleGetAdminSettings, handleUpdateAdminSettings } = await import("./admin-settings.controller.js");

const IDS = [
  "openrouter/openai/gpt-6-luna",
  "openrouter/anthropic/claude-haiku-5.5",
  "openrouter/google/gemma-4-31b-it",
  "openrouter/openai/gpt-oss-120b",
  "openrouter/mistralai/mistral-small-3.2-24b-instruct",
  "openrouter/meta-llama/llama-3.3-70b-instruct",
];

afterAll(async () => {
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

function fakeRes() {
  const out = { status: 0, body: undefined as Record<string, unknown> | undefined };
  const res = {
    writeHead: (status: number) => {
      out.status = status;
    },
    end: (payload?: string) => {
      out.body = payload ? (JSON.parse(payload) as Record<string, unknown>) : undefined;
    },
    setHeader: () => undefined,
  } as unknown as http.ServerResponse;

  return { out, res };
}

async function get() {
  const { out, res } = fakeRes();

  await handleGetAdminSettings(res);

  return out;
}

async function put(body: unknown) {
  const { out, res } = fakeRes();
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { headers: {} }) as unknown as http.IncomingMessage;

  await handleUpdateAdminSettings(req, res);

  return out;
}

describe("admin settings fusion mode", () => {
  it("should be off with no models and a zero estimate by default", async () => {
    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      fusionEnabled: false,
      fusionModelIds: [],
      fusionEstimate: { perModel: [], totalEstimatedCostUsd: 0 },
    });
  });

  it.each([
    ["one model", IDS.slice(0, 1)],
    ["six models", IDS.slice(0, 6)],
    ["duplicate models", [IDS[0], IDS[1], IDS[0]]],
    ["unknown models", ["a/b", "c/d"]],
  ])("should refuse turning fusion on with %s and keep the stored setting", async (_name, fusionModelIds) => {
    const refused = await put({ fusionEnabled: true, fusionModelIds });

    expect(refused.status).toBe(400);
    expect((await get()).body).toMatchObject({ fusionEnabled: false, fusionModelIds: [] });
  });

  it("should refuse turning fusion on when no models were chosen before", async () => {
    expect((await put({ fusionEnabled: true })).status).toBe(400);
  });

  it("should save the chosen models and return an estimate for them", async () => {
    const saved = await put({ fusionEnabled: true, fusionModelIds: IDS.slice(0, 3) });
    const stored = await get();

    expect(saved.status).toBe(200);
    expect(stored.body).toMatchObject({ fusionEnabled: true, fusionModelIds: IDS.slice(0, 3) });

    const estimate = stored.body?.fusionEstimate as { perModel: unknown[]; totalEstimatedCostUsd: number };

    expect(estimate.perModel).toHaveLength(3);
    expect(estimate.totalEstimatedCostUsd).toBeGreaterThan(0);
  });

  it("should refuse shrinking the chosen models below two while fusion is on", async () => {
    expect((await put({ fusionModelIds: IDS.slice(0, 1) })).status).toBe(400);
    expect((await get()).body).toMatchObject({ fusionModelIds: IDS.slice(0, 3) });
  });

  it("should keep the chosen models when fusion is turned off and leave other settings alone", async () => {
    const off = await put({ fusionEnabled: false });

    expect(off.body).toMatchObject({ fusionEnabled: false, fusionModelIds: IDS.slice(0, 3), newCardsPerDay: 20 });
  });

  it("should allow a single model while fusion is off", async () => {
    expect((await put({ fusionModelIds: IDS.slice(0, 1) })).status).toBe(200);
  });
});
