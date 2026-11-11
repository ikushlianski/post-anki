import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { pickBusinessLessons } from "../mastra/knowledge-bit-business-cards.agent.js";
import {
  MULTI_PARAGRAPH_CARDS,
  MULTI_PARAGRAPH_SOURCE,
  NEGOTIATION_CARDS,
  NEGOTIATION_SOURCE,
} from "../mastra/knowledge-bit-list-cards.test-mocks.js";

vi.mock("../admin-settings/admin-settings.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin-settings/admin-settings.repo.js")>()),
  getTriageEnabled: async () => true,
}));

vi.mock("./knowledge-bit-duplicate-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-duplicate-gate.js")>()),
  dropDuplicateCards: async (_db: unknown, lessons: readonly unknown[]) => ({ lessons: [...lessons], skippedCards: 0 }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_bit_list_cards_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

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

async function extract(rawText: string, modelCards: unknown[]) {
  const id = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', $2, 'processing', $3)`,
    [id, rawText, claimedAt],
  );

  const lessons = pickBusinessLessons({ cards: modelCards }, rawText);
  const deps = { ...defaultGenerateItemsDeps(), writeItems: vi.fn().mockResolvedValue(lessons) };
  const result = await generateItemsForSource(
    { id, rawText, extractionModelId: null, subjectId: null, claimedAt },
    {},
    deps,
  );
  const { rows } = await client.query(
    `SELECT bit.id, bit.approval_state FROM knowledge_bits bit WHERE bit.knowledge_source_id = $1 ORDER BY bit.ordinal`,
    [id],
  );

  return { result, bits: rows as { id: string; approval_state: string }[] };
}

describe("list chapters become single-item cards (real Postgres, mocked model)", () => {
  it("should store each situation and risk card from a list chapter as its own card", async () => {
    const { result, bits } = await extract(NEGOTIATION_SOURCE, NEGOTIATION_CARDS);

    expect(result.status).toBe("detected");
    expect(bits).toHaveLength(NEGOTIATION_CARDS.length);
  });

  it("should store a card for every substantive paragraph of a multi-paragraph note", async () => {
    const { result, bits } = await extract(MULTI_PARAGRAPH_SOURCE, MULTI_PARAGRAPH_CARDS);

    expect(result.status).toBe("detected");
    expect(bits).toHaveLength(MULTI_PARAGRAPH_CARDS.length);
  });
});
