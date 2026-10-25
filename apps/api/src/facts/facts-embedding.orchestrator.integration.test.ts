import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

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

const dbName = `facts_embedding_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { embedFacts } = await import("./facts-embedding.orchestrator.js");
const { hashContent } = await import("@post-anki/core");

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

async function seedFact(
  body: string,
  embedding: number[] | null = null,
  embeddingHash: string | null = null,
): Promise<string> {
  const id = `fact_${randomUUID()}`;

  await client.query(
    `INSERT INTO facts (id, body, source, source_ref, tags, embedding_vec, embedding_hash)
     VALUES ($1, $2, 'notion', $3, '["SPA"]', $4, $5)`,
    [id, body, `notion:${randomUUID()}`, embedding ? JSON.stringify(padEmbedding(embedding)) : null, embeddingHash],
  );

  return id;
}

async function vectorOf(id: string): Promise<number[]> {
  const { rows } = await client.query(`SELECT embedding_vec::text AS v FROM facts WHERE id = $1`, [id]);

  return JSON.parse(rows[0]!.v);
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const body = JSON.parse(String(args[1]?.body)) as { input: string[]; model: string };
    const data = body.input.map((_text, index) => ({ index, embedding: padEmbedding([1, 2, 3]) }));

    return new Response(JSON.stringify({ data, model: body.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("embedFacts", () => {
  it("embeds a fact that has never been embedded", async () => {
    const id = await seedFact("Price anchors shape perceived value");

    await embedFacts();

    expect(await vectorOf(id)).toEqual(padEmbedding([1, 2, 3]));
  });

  it("keeps the stored embedding when the fact's body is unchanged", async () => {
    const body = "Retention beats acquisition";
    const id = await seedFact(body, [9, 9, 9], hashContent(body));

    await embedFacts();

    expect(await vectorOf(id)).toEqual(padEmbedding([9, 9, 9]));
  });

  it("re-embeds a fact whose body changed since it was last embedded", async () => {
    const id = await seedFact("Churn compounds quietly", [5, 5, 5], "hash-of-the-old-body");

    await embedFacts();

    expect(await vectorOf(id)).toEqual(padEmbedding([1, 2, 3]));
  });

  it("makes no embedding API call when every fact is already current", async () => {
    await seedFact("Referrals are the cheapest channel");
    await embedFacts();
    vi.mocked(global.fetch).mockClear();

    const second = await embedFacts();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(second.embeddedCount).toBe(0);
  });
});
