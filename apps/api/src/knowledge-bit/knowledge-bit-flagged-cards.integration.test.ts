import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_bit_flagged_cards_${randomUUID().replace(/-/g, "_")}`;
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

const { generateItemsForSource, defaultGenerateItemsDeps } = await import(
  "./detect-knowledge-bits.orchestrator.js"
);
const { approveKnowledgeBit, listPendingKnowledgeBitsForReview } = await import(
  "./knowledge-bit-approval.repo.js"
);
const { approveKnowledgeBitsBulk } = await import("./knowledge-bit-bulk-approval.repo.js");
const { claimSourceForRegeneration } = await import("../knowledge-source/knowledge-source-regeneration.repo.js");

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

const GOOD_LESSON = RU_EXAMPLE_ITEMS[0]!;
const REJECTED_LESSON = {
  ...RU_EXAMPLE_ITEMS[1]!,
  quote: "цитата которой нет в источнике вообще",
};

async function extract(lessons: typeof RU_EXAMPLE_ITEMS) {
  const id = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', $2, 'processing', $3)`,
    [id, RU_SOURCE_TEXT, claimedAt],
  );

  const deps = { ...defaultGenerateItemsDeps(), writeItems: vi.fn().mockResolvedValue(lessons) };
  const result = await generateItemsForSource(
    { id, rawText: RU_SOURCE_TEXT, extractionModelId: null, subjectId: null, claimedAt },
    {},
    deps,
  );

  return { id, result };
}

async function bitsOf(sourceId: string) {
  const { rows } = await client.query(
    `SELECT id, approval_state, review_flag FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal`,
    [sourceId],
  );

  return rows as { id: string; approval_state: string; review_flag: string | null }[];
}

async function sourceStatus(sourceId: string): Promise<string> {
  const { rows } = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [sourceId]);

  return rows[0]!.status as string;
}

describe("rejected cards stay visible in triage (real Postgres, mocked model)", () => {
  it("should save a rejected card flagged next to the clean ones and still finish the note", async () => {
    const { id, result } = await extract([GOOD_LESSON, REJECTED_LESSON]);

    expect(result.status).toBe("detected");
    expect(await sourceStatus(id)).toBe("bits_detected");
    expect((await bitsOf(id)).map((bit) => bit.review_flag)).toEqual([null, "quote_not_in_source"]);
  });

  it("should finish a note whose every card was rejected with all of them flagged", async () => {
    const { id, result } = await extract([REJECTED_LESSON]);

    expect(result.status).toBe("detected");
    expect(await sourceStatus(id)).toBe("bits_detected");
    expect((await bitsOf(id)).map((bit) => bit.review_flag)).toEqual(["quote_not_in_source"]);
  });

  it("should fail the note when the model returned nothing", async () => {
    const { id, result } = await extract([]);

    expect(result).toMatchObject({ status: "failed", failureReason: "no_valid_items" });
    expect(await bitsOf(id)).toEqual([]);
  });

  it("should hand the flag to triage so the reviewer sees why the card needs a look", async () => {
    const { id } = await extract([GOOD_LESSON, REJECTED_LESSON]);

    const sources = await listPendingKnowledgeBitsForReview(500);
    const bits = sources.find((source) => source.knowledgeSourceId === id)!.bits;

    expect(bits.map((bit) => bit.reviewFlag)).toEqual([null, "quote_not_in_source"]);
  });

  it("should leave flagged cards pending when the reviewer bulk approves everything", async () => {
    const { id } = await extract([GOOD_LESSON, REJECTED_LESSON]);
    const [clean, flagged] = await bitsOf(id);

    const result = await approveKnowledgeBitsBulk([clean!.id, flagged!.id]);

    expect(result).toEqual({
      approved: [clean!.id],
      skipped: [{ id: flagged!.id, reason: "needs_manual_review" }],
    });
    expect((await bitsOf(id)).map((bit) => bit.approval_state)).toEqual(["approved", "pending"]);
  });

  it("should clear the flag once the reviewer approves the card by hand", async () => {
    const { id } = await extract([REJECTED_LESSON]);
    const [flagged] = await bitsOf(id);

    expect(await approveKnowledgeBit(flagged!.id)).toBe(true);
    expect(await bitsOf(id)).toEqual([{ id: flagged!.id, approval_state: "approved", review_flag: null }]);
  });

  it("should replace flagged cards with the new run's cards when the note is retried", async () => {
    const { id } = await extract([REJECTED_LESSON]);
    const [flagged] = await bitsOf(id);

    const claim = await claimSourceForRegeneration(id);

    expect(claim.ok).toBe(true);
    expect((await bitsOf(id)).find((bit) => bit.id === flagged!.id)?.approval_state).toBe("superseded");
  });
});
