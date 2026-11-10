import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const webSearch = vi.hoisted(() => vi.fn());

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

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

const dbName = `knowledge_bit_import_facts_${randomUUID().replace(/-/g, "_")}`;
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

const { generateItemsForSource, defaultGenerateItemsDeps } = await import("./detect-knowledge-bits.orchestrator.js");

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

const STATEMENT = "A deal needs budget, authority and need.";
const RAW_NOTE = "A deal needs {{c1::budget}}, {{c2::authority::who}} and {{c3::need}}.\n\nBack Extra: BANT.";

const DRAFT = {
  statement: STATEMENT,
  quote: STATEMENT,
  example: null,
  cards: [
    {
      kind: "basic" as const,
      statement: STATEMENT,
      question: "What does a deal need?",
      answer: "Budget, authority and need.",
      quote: STATEMENT,
    },
  ],
};

async function insertImportSource(rawText: string): Promise<{ sourceId: string; claimedAt: Date }> {
  const sourceId = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at, import_key) VALUES ($1, 'prose', $2, 'processing', $3, 'anki:' || $1::text)`,
    [sourceId, rawText, claimedAt],
  );

  return { sourceId, claimedAt };
}

describe("imported Anki note read as facts (real Postgres)", () => {
  it("should send the plain fact text to the model and keep the Back Extra tail out of the background", async () => {
    webSearch.mockResolvedValue({ ok: false, status: 500 });
    const { sourceId, claimedAt } = await insertImportSource(RAW_NOTE);
    const writeItems = vi.fn().mockResolvedValue([DRAFT]);

    const result = await generateItemsForSource(
      { id: sourceId, rawText: RAW_NOTE, extractionModelId: null, subjectId: null, claimedAt },
      {},
      { ...defaultGenerateItemsDeps(), writeItems },
    );

    expect(result).toEqual({ status: "detected", inserted: 1, failureReason: null });

    const sentChunk = writeItems.mock.calls[0]?.[0] as string;

    expect(sentChunk).not.toContain("{{");
    expect(sentChunk).not.toContain("Back Extra");

    const bits = await client.query(`SELECT body, background, is_ai_generated FROM knowledge_bits WHERE knowledge_source_id = $1`, [
      sourceId,
    ]);

    expect(bits.rows).toEqual([{ body: STATEMENT, background: null, is_ai_generated: false }]);
  });

  it("should store a web example as an AI-generated bit with its source link", async () => {
    const url = "https://example.com/deal-qualification";

    webSearch.mockResolvedValue({
      ok: true,
      text: "A regional bank qualified deals by asking who signs the contract.",
      citations: [url],
    });
    const { sourceId, claimedAt } = await insertImportSource(RAW_NOTE);

    await generateItemsForSource(
      { id: sourceId, rawText: RAW_NOTE, extractionModelId: null, subjectId: null, claimedAt },
      {},
      { ...defaultGenerateItemsDeps(), writeItems: vi.fn().mockResolvedValue([DRAFT]) },
    );

    const bits = await client.query(
      `SELECT background, is_ai_generated, source_links FROM knowledge_bits WHERE knowledge_source_id = $1`,
      [sourceId],
    );

    expect(bits.rows).toEqual([
      {
        background: "A regional bank qualified deals by asking who signs the contract.",
        is_ai_generated: true,
        source_links: [url],
      },
    ]);
  });
});
