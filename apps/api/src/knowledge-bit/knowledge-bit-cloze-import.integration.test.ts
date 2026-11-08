import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
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

const dbName = `knowledge_bit_cloze_import_${randomUUID().replace(/-/g, "_")}`;
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

describe("imported cloze source (real Postgres)", () => {
  it("should store a cloze bit with one variant per number when a source holding {{c1::..}} is processed", async () => {
    const sourceId = `ksrc_${randomUUID()}`;
    const claimedAt = new Date();
    const rawText = "A deal needs {{c1::budget}}, {{c2::authority::who}} and {{c3::need}}.\n\nBack Extra: BANT.";
    const writeItems = vi.fn().mockRejectedValue(new Error("model must not be called"));

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at, import_key) VALUES ($1, 'prose', $2, 'processing', $3, 'anki:' || $1::text)`,
      [sourceId, rawText, claimedAt],
    );

    const result = await generateItemsForSource(
      { id: sourceId, rawText, extractionModelId: null, subjectId: null, claimedAt },
      {},
      { ...defaultGenerateItemsDeps(), writeItems },
    );

    expect(result).toEqual({ status: "detected", inserted: 1, failureReason: null });
    expect(writeItems).not.toHaveBeenCalled();

    const bits = await client.query(`SELECT id, body, background FROM knowledge_bits WHERE knowledge_source_id = $1`, [
      sourceId,
    ]);

    expect(bits.rows).toHaveLength(1);
    expect(bits.rows[0]).toMatchObject({
      body: "A deal needs budget, authority and need.",
      background: "Back Extra: BANT.",
    });

    const variants = await client.query(
      `SELECT kind, "order", answer, sentence FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 ORDER BY "order"`,
      [bits.rows[0]!.id],
    );

    expect(variants.rows.map((row) => [row.kind, row.order, row.answer])).toEqual([
      ["cloze", 1, "budget"],
      ["cloze", 2, "authority"],
      ["cloze", 3, "need"],
    ]);
    expect(variants.rows.every((row) => row.sentence === "A deal needs {{c1::budget}}, {{c2::authority::who}} and {{c3::need}}.")).toBe(true);
  });
});
