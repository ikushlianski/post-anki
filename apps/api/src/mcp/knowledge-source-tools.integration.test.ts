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

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `mcp_knowledge_sources_${randomUUID().replace(/-/g, "_")}`;
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

const { listKnowledgeSources } = await import("./list-knowledge-sources.tool.js");
const { getSourceKnowledgeBits } = await import("./get-source-knowledge-bits.tool.js");
const { getKnowledgeBit } = await import("./get-knowledge-bit.tool.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertSource(fields: {
  id: string;
  rawText?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  subjectId?: string | null;
  createdAt: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, summary, source_url, subject_id, status, created_at)
     VALUES ($1, 'prose', $2, $3, $4, $5, 'detected', $6)`,
    [
      fields.id,
      fields.rawText ?? null,
      fields.summary ?? null,
      fields.sourceUrl ?? null,
      fields.subjectId ?? null,
      fields.createdAt,
    ],
  );
}

async function insertBit(sourceId: string, ordinal: number, state: string, body = `bit ${ordinal}`): Promise<string> {
  const bitId = id("bit");

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, $5)`,
    [bitId, sourceId, ordinal, body, state],
  );

  return bitId;
}

async function insertVariant(
  bitId: string,
  kind: string,
  order: number,
  prompt: string,
  supersededAt: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
     VALUES ($1, $2, $3, $4, $5, 'ans', $6)`,
    [id("var"), bitId, kind, order, prompt, supersededAt],
  );
}

describe("MCP knowledge source tools against a real database", () => {
  it("should list sources newest first, counting only approved bits, filtered by subject, and page them", async () => {
    const subjectId = id("sub");
    const older = id("src");
    const newer = id("src");

    await insertSource({ id: older, rawText: "older text", subjectId, createdAt: "2026-01-01T00:00:00Z" });
    await insertSource({
      id: newer,
      rawText: "raw",
      summary: "Newer summary",
      sourceUrl: "https://example.com/n",
      subjectId,
      createdAt: "2026-02-01T00:00:00Z",
    });
    await insertBit(newer, 1, "approved");
    await insertBit(newer, 2, "approved");
    await insertBit(newer, 3, "pending");
    await insertBit(newer, 4, "rejected");

    const result = await listKnowledgeSources({ subjectId });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([newer, older]);
    expect(result.items[0]).toMatchObject({
      label: "Newer summary",
      sourceUrl: "https://example.com/n",
      approvedBitCount: 2,
    });
    expect(result.items[1]).toMatchObject({ label: "older text", approvedBitCount: 0 });

    const page = await listKnowledgeSources({ subjectId, limit: 1, offset: 1 });

    expect(page.items.map((item) => item.id)).toEqual([older]);
    expect(page.total).toBe(2);
  });

  it("should return a source's approved bits in source order with only active questions", async () => {
    const sourceId = id("src");

    await insertSource({ id: sourceId, rawText: "x", createdAt: "2026-01-01T00:00:00Z" });
    const second = await insertBit(sourceId, 2, "approved");
    const first = await insertBit(sourceId, 1, "approved");

    await insertBit(sourceId, 3, "pending");
    await insertBit(sourceId, 4, "rejected");
    await insertVariant(first, "wh_question", 1, "active question");
    await insertVariant(first, "wh_question", 1, "old question", "2026-01-02T00:00:00Z");

    const result = await getSourceKnowledgeBits({ sourceId });

    if ("error" in result) {
      throw new Error("expected a result");
    }

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([first, second]);
    expect(result.items[0]?.questions.map((q) => q.prompt)).toEqual(["active question"]);
    expect(result.items[1]?.questions).toEqual([]);

    const page = await getSourceKnowledgeBits({ sourceId, limit: 1, offset: 1 });

    expect("items" in page && page.items.map((item) => item.id)).toEqual([second]);
  });

  it("should return not_found for an unknown source id and an unknown bit id", async () => {
    expect(await getSourceKnowledgeBits({ sourceId: "src_missing" })).toEqual({ error: "not_found" });
    expect(await getKnowledgeBit({ id: "bit_missing" })).toEqual({ error: "not_found" });
  });

  it("should open a pending bit with its approval state, source and active questions", async () => {
    const sourceId = id("src");

    await insertSource({
      id: sourceId,
      rawText: "raw text",
      sourceUrl: "https://example.com/s",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const bitId = await insertBit(sourceId, 1, "pending", "pending body");

    await insertVariant(bitId, "basic", 1, "live");
    await insertVariant(bitId, "basic", 1, "dead", "2026-01-02T00:00:00Z");

    const result = await getKnowledgeBit({ id: bitId });

    expect(result).toMatchObject({
      id: bitId,
      body: "pending body",
      approvalState: "pending",
      source: { id: sourceId, label: "raw text", sourceUrl: "https://example.com/s" },
    });
    expect("questions" in result && result.questions.map((q) => q.prompt)).toEqual(["live"]);
  });
});
