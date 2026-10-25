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

const dbName = `knowledge_bit_matches_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
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

const { countBrowserMatchesScope, rankBrowserMatchesInTransaction } = await import(
  "./knowledge-bit-browser-matches.repo.js"
);
const { getDb } = await import("../db/client.js");

const NOW = new Date("2026-06-01T12:00:00Z");
const DIMENSIONS = 1536;
const ids: Record<string, string> = {};
let client: pg.Client;

function queryVector(parts: Record<number, number>): number[] {
  return Array.from({ length: DIMENSIONS }, (_, index) => parts[index] ?? 0);
}

function vectorLiteral(parts: Record<number, number>): string {
  return `[${queryVector(parts).join(",")}]`;
}

interface PieceSpec {
  key: string;
  vector?: Record<number, number>;
  sourceKind?: string;
  subject?: string;
}

async function addPiece(spec: PieceSpec): Promise<void> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  ids[spec.key] = id;
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, $2, 'text', 'pending', $3)`,
    [sourceId, spec.sourceKind ?? "prose", spec.subject ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, is_ai_generated, created_at, embedding_vec)
     VALUES ($1, $2, 0, 'body', 'approved', 'extracted', false, '2026-05-01T10:00:00Z', $3::halfvec)`,
    [id, sourceId, spec.vector ? vectorLiteral(spec.vector) : null],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, 'answer')`,
    [`kbqv_${randomUUID()}`, id, spec.key],
  );
}

async function rankKeys(filters: Parameters<typeof rankBrowserMatchesInTransaction>[1] = {}) {
  const ranking = await rankBrowserMatchesInTransaction(queryVector({ 0: 1 }), filters, getDb(), NOW);
  const byId = new Map(Object.entries(ids).map(([key, id]) => [id, key]));

  return { ...ranking, keys: ranking.items.map((item) => byId.get(item.knowledgeBitId) ?? "?") };
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('s_a', 'A', NULL), ('s_b', 'B', NULL)`);
  await addPiece({ key: "exact", vector: { 0: 1 } });
  await addPiece({ key: "near", vector: { 0: 0.8, 1: 0.6 } });
  await addPiece({ key: "weak", vector: { 0: 0.2, 1: 0.9797958971132712 } });
  await addPiece({ key: "unrelated", vector: { 1: 1 } });
  await addPiece({ key: "notionClose", vector: { 0: 0.9, 1: 0.4358898943540674 }, sourceKind: "notion", subject: "s_a" });
  await addPiece({ key: "missingA" });
  await addPiece({ key: "missingNotion", sourceKind: "notion", subject: "s_a" });
  await addPiece({ key: "missingB", subject: "s_b" });
}, 60_000);

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

describe("meaning search ranking (real Postgres)", () => {
  it("should list the closest piece first with its closeness and leave out pieces below 0.3", async () => {
    const { keys, items } = await rankKeys();

    expect(keys).toEqual(["exact", "notionClose", "near"]);
    expect(items[0]?.similarity).toBeCloseTo(1, 2);
    expect(items[2]?.similarity).toBeCloseTo(0.8, 2);
  });

  it("should rank only pieces that pass the other filters", async () => {
    const { keys } = await rankKeys({ origins: ["notion"] });

    expect(keys).toEqual(["notionClose"]);
  });

  it("should respect the subject filter", async () => {
    const { keys } = await rankKeys({ subjectId: "s_a" });

    expect(keys).toEqual(["notionClose"]);
  });

  it("should count filtered pieces without meaning data and never give them a score", async () => {
    const all = await countBrowserMatchesScope({}, getDb(), NOW);
    const notion = await countBrowserMatchesScope({ origins: ["notion"] }, getDb(), NOW);
    const none = await countBrowserMatchesScope({ subjectId: "s_b" }, getDb(), NOW);

    expect(all).toEqual({ readyCount: 5, notReadyCount: 3 });
    expect(notion).toEqual({ readyCount: 1, notReadyCount: 1 });
    expect(none).toEqual({ readyCount: 0, notReadyCount: 1 });
  });

  it("should return at most 100 pieces and say when more were close enough", async () => {
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, source_url) VALUES ('ksrc_bulk', 'prose', 'text', 'pending', 'https://bulk.example/x')`,
    );
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, is_ai_generated, created_at, embedding_vec)
       SELECT 'kb_bulk_' || n, 'ksrc_bulk', n, 'body', 'approved', 'extracted', false, '2026-05-01T10:00:00Z', $1::halfvec FROM generate_series(1, 101) n`,
      [vectorLiteral({ 0: 1 })],
    );
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       SELECT 'kbqv_bulk_' || n, 'kb_bulk_' || n, 'basic', 0, 'bulk ' || n, 'answer' FROM generate_series(1, 101) n`,
    );

    const capped = await rankKeys({ site: "bulk.example" });

    expect(capped.items).toHaveLength(100);
    expect(capped.capped).toBe(true);
    expect(new Set(capped.items.map((item) => item.knowledgeBitId)).size).toBe(100);
  });
});
