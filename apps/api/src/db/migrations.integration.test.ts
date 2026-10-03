import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "./assert-local-db-target.js";
import * as schema from "./schema.js";
import {
  claimPendingKnowledgeSources,
  insertKnowledgeBits,
  insertKnowledgeBitsAndMarkDetected,
  markKnowledgeSourceBitsDetected,
  markKnowledgeSourceFailed,
  resetStaleProcessingKnowledgeSources,
} from "../knowledge-bit/knowledge-bit.repo.js";

// SCENARIO 1 (.planning/phrase-bank-concurrency-fix/scenarios.md) — migration-diff
// proof. This test applies every migration under apps/api/src/db/migrations/
// (including this plan's new one) against a fresh, throwaway database created
// inside the project's local e2e Postgres container, then attempts the exact
// violating/non-violating raw-SQL INSERTs the plan's Definition of Done names,
// asserting the real Postgres error codes (23503 FK, 23505 unique) — not a
// drizzle-level abstraction over them.
//
// A throwaway *database* (not just a schema) is used so this test never
// touches whatever data SCENARIO 2-4's integration tests or a running e2e
// Playwright suite already left in `postanki_e2e` — created and dropped fresh
// every run, isolated by a random suffix.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

const TEST_DB_NAME = `pb_migration_test_${randomUUID().replace(/-/g, "_")}`;

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const TEST_DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, TEST_DB_NAME);

let adminPool: pg.Pool;
let testPool: pg.Pool;
let client: pg.Client;
// Passed explicitly to repo functions' optional DbExecutor param, so they
// run against this test's own throwaway database, not the shared pool.
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);

  testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  const db = drizzle(testPool);
  testDb = drizzle(testPool, { schema });

  await migrate(db, {
    migrationsFolder: new URL("./migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });

  client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
}, 60_000);

afterAll(async () => {
  await client?.end();
  await testPool?.end();

  if (adminPool) {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.end();
  }
}, 30_000);

function newSubjectId(): string {
  return `sub_migtest_${randomUUID()}`;
}

async function insertPhrase(overrides: {
  id?: string;
  subjectId: string;
  level?: string;
  pack?: string;
  sequenceNumber: number;
  targetPhraseBankEntryId?: string | null;
}): Promise<void> {
  const {
    id = `phrase_${randomUUID()}`,
    subjectId,
    level = "B1_B2",
    pack = "General",
    sequenceNumber,
    targetPhraseBankEntryId = null,
  } = overrides;

  await client.query(
    `INSERT INTO phrases
       (id, subject_id, batch_id, level, pack, position, russian, reference_english, domain, target_phrase_bank_entry_id, sequence_number)
     VALUES ($1, $2, $3, $4, $5, 1, 'Тест', 'Test', 'Everyday', $6, $7)`,
    [id, subjectId, `batch_${randomUUID()}`, level, pack, targetPhraseBankEntryId, sequenceNumber],
  );
}

async function insertPhraseBankEntry(overrides: {
  id?: string;
  subjectId: string;
  level?: string;
  pack?: string;
  phraseText: string;
  status?: string;
}): Promise<string> {
  const {
    id = `pbentry_${randomUUID()}`,
    subjectId,
    level = "B1_B2",
    pack = "General",
    phraseText,
    status = "new",
  } = overrides;

  await client.query(
    `INSERT INTO phrase_bank_entries (id, subject_id, level, pack, phrase_text, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, subjectId, level, pack, phraseText, status],
  );

  return id;
}

describe("migrations — real FK and unique-index enforcement (SCENARIO 1)", () => {
  describe("phrases.target_phrase_bank_entry_id references phrase_bank_entries(id)", () => {
    it("rejects a dangling target with a foreign-key violation (23503)", async () => {
      const subjectId = newSubjectId();

      await expect(
        insertPhrase({
          subjectId,
          sequenceNumber: 1,
          targetPhraseBankEntryId: `pbentry_${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: "23503" });
    });

    it("accepts a null target (untracked phrase) with no error", async () => {
      const subjectId = newSubjectId();

      await expect(
        insertPhrase({ subjectId, sequenceNumber: 1, targetPhraseBankEntryId: null }),
      ).resolves.toBeUndefined();
    });

    it("accepts a target that actually exists in phrase_bank_entries", async () => {
      const subjectId = newSubjectId();
      const entryId = await insertPhraseBankEntry({ subjectId, phraseText: "get to the bottom of" });

      await expect(
        insertPhrase({ subjectId, sequenceNumber: 1, targetPhraseBankEntryId: entryId }),
      ).resolves.toBeUndefined();
    });
  });

  describe("unique index on phrases(subject_id, level, pack, sequence_number)", () => {
    it("rejects a second row with the same scope + sequence number (23505)", async () => {
      const subjectId = newSubjectId();

      await insertPhrase({ subjectId, sequenceNumber: 5 });

      await expect(insertPhrase({ subjectId, sequenceNumber: 5 })).rejects.toMatchObject({
        code: "23505",
      });
    });

    it("allows the same sequence number in a different subject/level/pack scope", async () => {
      const subjectA = newSubjectId();
      const subjectB = newSubjectId();

      await insertPhrase({ subjectId: subjectA, sequenceNumber: 5 });

      await expect(
        insertPhrase({ subjectId: subjectB, sequenceNumber: 5 }),
      ).resolves.toBeUndefined();
    });
  });

  describe("unique index on phrase_bank_entries(subject_id, level, pack, lower(phrase_text))", () => {
    it("rejects an exact-duplicate phrase text in the same scope (23505)", async () => {
      const subjectId = newSubjectId();

      await insertPhraseBankEntry({ subjectId, phraseText: "drowning in work" });

      await expect(
        insertPhraseBankEntry({ subjectId, phraseText: "drowning in work" }),
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("rejects a case/whitespace-only variation of an existing phrase text (23505)", async () => {
      const subjectId = newSubjectId();

      await insertPhraseBankEntry({ subjectId, phraseText: "Get to the bottom of" });

      await expect(
        insertPhraseBankEntry({ subjectId, phraseText: "get to the bottom of " }),
      ).rejects.toMatchObject({ code: "23505" });
    });

    it("allows a genuinely different phrase text in the same scope", async () => {
      const subjectId = newSubjectId();

      await insertPhraseBankEntry({ subjectId, phraseText: "drowning in work" });

      await expect(
        insertPhraseBankEntry({ subjectId, phraseText: "get to the bottom of" }),
      ).resolves.not.toBeUndefined();
    });

    it("allows the same phrase text in a different subject/level/pack scope", async () => {
      const subjectA = newSubjectId();
      const subjectB = newSubjectId();

      await insertPhraseBankEntry({ subjectId: subjectA, phraseText: "drowning in work" });

      await expect(
        insertPhraseBankEntry({ subjectId: subjectB, phraseText: "drowning in work" }),
      ).resolves.not.toBeUndefined();
    });

    it("allows a mastered entry's text to be reintroduced as a fresh (non-mastered) entry — the index is partial, excluding status = 'mastered'", async () => {
      const subjectId = newSubjectId();

      await insertPhraseBankEntry({ subjectId, phraseText: "drowning in work", status: "mastered" });

      await expect(
        insertPhraseBankEntry({ subjectId, phraseText: "drowning in work", status: "new" }),
      ).resolves.not.toBeUndefined();
    });

    it("still rejects two non-mastered entries with the same text in the same scope", async () => {
      const subjectId = newSubjectId();

      await insertPhraseBankEntry({ subjectId, phraseText: "drowning in work", status: "practicing" });

      await expect(
        insertPhraseBankEntry({ subjectId, phraseText: "drowning in work", status: "struggling" }),
      ).rejects.toMatchObject({ code: "23505" });
    });
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--accept-pasted-prose/scenarios.md) —
// proves the 0056 migration applies cleanly against real Postgres (this file's
// beforeAll already runs every migration, including 0056, against a fresh
// throwaway database) and that knowledge_sources' real columns match schema.ts.
describe("migrations — knowledge_sources table (prose-knowledge-fisher--accept-pasted-prose)", () => {
  it("creates knowledge_sources with the columns schema.ts declares", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'knowledge_sources'
        ORDER BY ordinal_position`,
    );

    expect(rows).toEqual([
      expect.objectContaining({ column_name: "id", data_type: "text", is_nullable: "NO" }),
      expect.objectContaining({ column_name: "kind", data_type: "text", is_nullable: "NO" }),
      expect.objectContaining({ column_name: "raw_text", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({
        column_name: "status",
        data_type: "text",
        is_nullable: "NO",
        column_default: "'pending'::text",
      }),
      expect.objectContaining({ column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" }),
      expect.objectContaining({ column_name: "notion_database_id", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({ column_name: "notion_page_id", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({ column_name: "failure_reason", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({
        column_name: "updated_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      }),
    ]);
  });

  it("inserts and round-trips a prose knowledge source through raw SQL, matching the repo's own insert shape", async () => {
    const id = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
      [id, "Some pasted prose for the migration test."],
    );

    const { rows } = await client.query(`SELECT * FROM knowledge_sources WHERE id = $1`, [id]);

    expect(rows[0]).toMatchObject({
      id,
      kind: "prose",
      raw_text: "Some pasted prose for the migration test.",
      status: "pending",
    });
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--accept-notion-source/scenarios.md) —
// proves the new migration applies cleanly against real Postgres and that
// knowledge_sources.notion_database_id's real column shape matches schema.ts.
describe("migrations — knowledge_sources.notion_database_id (prose-knowledge-fisher--accept-notion-source)", () => {
  it("adds notion_database_id as a nullable text column", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'knowledge_sources' AND column_name = 'notion_database_id'`,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        column_name: "notion_database_id",
        data_type: "text",
        is_nullable: "YES",
      }),
    ]);
  });

  it("inserts and round-trips a notion knowledge source with a non-null notion_database_id", async () => {
    const id = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, notion_database_id)
       VALUES ($1, 'notion', $2, 'pending', $3)`,
      [id, "A row imported from Notion.", "ds-migration-test"],
    );

    const { rows } = await client.query(`SELECT * FROM knowledge_sources WHERE id = $1`, [id]);

    expect(rows[0]).toMatchObject({
      id,
      kind: "notion",
      raw_text: "A row imported from Notion.",
      status: "pending",
      notion_database_id: "ds-migration-test",
    });
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--accept-notion-source/scenarios.md) —
// proves notion_page_id's real column shape and its unique index actually
// reject a duplicate page id at the database level, not just in app code.
describe("migrations — knowledge_sources.notion_page_id (prose-knowledge-fisher--accept-notion-source)", () => {
  it("adds notion_page_id as a nullable text column", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'knowledge_sources' AND column_name = 'notion_page_id'`,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        column_name: "notion_page_id",
        data_type: "text",
        is_nullable: "YES",
      }),
    ]);
  });

  it("rejects a second row that reuses an already-imported notion_page_id", async () => {
    const pageId = `page-migtest-${randomUUID()}`;
    const firstId = `ks_migtest_${randomUUID()}`;
    const secondId = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, notion_page_id)
       VALUES ($1, 'notion', $2, 'pending', $3)`,
      [firstId, "First import of this page.", pageId],
    );

    await expect(
      client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, notion_page_id)
         VALUES ($1, 'notion', $2, 'pending', $3)`,
        [secondId, "Duplicate import of the same page.", pageId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows multiple rows with a null notion_page_id (e.g. pasted-prose sources)", async () => {
    const firstId = `ks_migtest_${randomUUID()}`;
    const secondId = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
      [firstId, "Pasted prose one."],
    );

    await expect(
      client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
        [secondId, "Pasted prose two."],
      ),
    ).resolves.toBeDefined();
  });

  it("keeps exactly one row when two concurrent imports race to insert the same notion_page_id with ON CONFLICT DO NOTHING", async () => {
    const pageId = `page-race-${randomUUID()}`;
    const insertOnConflict = (id: string, text: string) =>
      testPool.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, notion_page_id)
         VALUES ($1, 'notion', $2, 'pending', $3)
         ON CONFLICT (notion_page_id) DO NOTHING`,
        [id, text, pageId],
      );

    await Promise.all([
      insertOnConflict(`ks_race_${randomUUID()}`, "First racer."),
      insertOnConflict(`ks_race_${randomUUID()}`, "Second racer."),
    ]);

    const { rows } = await client.query(
      `SELECT id FROM knowledge_sources WHERE notion_page_id = $1`,
      [pageId],
    );

    expect(rows).toHaveLength(1);
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--detect-knowledge-bits/scenarios.md) —
// proves the new migration applies cleanly against real Postgres and that
// knowledge_sources.failure_reason's real column shape matches schema.ts.
describe("migrations — knowledge_sources.failure_reason (prose-knowledge-fisher--detect-knowledge-bits)", () => {
  it("adds failure_reason as a nullable text column", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'knowledge_sources' AND column_name = 'failure_reason'`,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        column_name: "failure_reason",
        data_type: "text",
        is_nullable: "YES",
      }),
    ]);
  });

  it("round-trips a failed source with a failure reason", async () => {
    const id = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason)
       VALUES ($1, 'prose', $2, 'failed', $3)`,
      [id, "Some prose that was too long.", "source_too_long"],
    );

    const { rows } = await client.query(`SELECT * FROM knowledge_sources WHERE id = $1`, [id]);

    expect(rows[0]).toMatchObject({ id, status: "failed", failure_reason: "source_too_long" });
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--detect-knowledge-bits/scenarios.md) —
// proves knowledge_bits' real columns match schema.ts and that its unique
// index on (knowledge_source_id, ordinal) actually rejects a duplicate pair
// at the database level, not just in app code.
// SCENARIO (.planning/prose-knowledge-fisher--stale-row-reset/scenarios.md) —
// proves the 0060 migration applies cleanly against real Postgres and that
// knowledge_sources.updated_at's real column shape matches schema.ts.
describe("migrations — knowledge_sources.updated_at (prose-knowledge-fisher--stale-row-reset)", () => {
  it("adds updated_at as a not-null, now()-defaulted timestamptz column", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'knowledge_sources' AND column_name = 'updated_at'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      column_name: "updated_at",
      data_type: "timestamp with time zone",
      is_nullable: "NO",
    });
    expect(rows[0].column_default).toMatch(/now\(\)/);
  });
});

describe("migrations — knowledge_bits table (prose-knowledge-fisher--detect-knowledge-bits)", () => {
  it("creates knowledge_bits with the columns schema.ts declares", async () => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'knowledge_bits'
        ORDER BY ordinal_position`,
    );

    expect(rows).toEqual([
      expect.objectContaining({ column_name: "id", data_type: "text", is_nullable: "NO" }),
      expect.objectContaining({
        column_name: "knowledge_source_id",
        data_type: "text",
        is_nullable: "NO",
      }),
      expect.objectContaining({ column_name: "ordinal", data_type: "integer", is_nullable: "NO" }),
      expect.objectContaining({ column_name: "body", data_type: "text", is_nullable: "NO" }),
      expect.objectContaining({
        column_name: "created_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      }),
      expect.objectContaining({ column_name: "embedding", data_type: "jsonb", is_nullable: "YES" }),
      expect.objectContaining({ column_name: "embedding_hash", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({
        column_name: "embedded_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "tagged_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "tag_failed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({ column_name: "topic_id", data_type: "text", is_nullable: "YES" }),
      expect.objectContaining({
        column_name: "placement_suggestion",
        data_type: "text",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "placement_checked_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "placement_failed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "placement_suggestion_resolved_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "wh_question_generated_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "wh_question_generation_failed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "fill_blank_generated_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "fill_blank_generation_failed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "fill_blank_generation_attempts",
        data_type: "integer",
        is_nullable: "NO",
      }),
      expect.objectContaining({
        column_name: "fill_blank_generation_claimed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "fill_blank_generation_claim_token",
        data_type: "text",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "wh_question_generation_attempts",
        data_type: "integer",
        is_nullable: "NO",
      }),
      expect.objectContaining({
        column_name: "wh_question_generation_claimed_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "wh_question_generation_claim_token",
        data_type: "text",
        is_nullable: "YES",
      }),
      expect.objectContaining({
        column_name: "background",
        data_type: "text",
        is_nullable: "YES",
        column_default: null,
      }),
      expect.objectContaining({
        column_name: "search_vector",
        data_type: "tsvector",
        is_nullable: "YES",
      }),
    ]);
  });

  it("rejects a second row with the same (knowledge_source_id, ordinal) pair (23505)", async () => {
    const sourceId = `ks_migtest_${randomUUID()}`;
    const bitId = `kb_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body)
       VALUES ($1, $2, 0, 'First bit.')`,
      [bitId, sourceId],
    );

    const { rows: backgroundRows } = await client.query(
      `SELECT background FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(backgroundRows[0].background).toBeNull();

    await expect(
      client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body)
         VALUES ($1, $2, 0, 'Duplicate ordinal.')`,
        [`kb_migtest_${randomUUID()}`, sourceId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows the same ordinal across two different sources", async () => {
    const sourceA = `ks_migtest_${randomUUID()}`;
    const sourceB = `ks_migtest_${randomUUID()}`;
    const bitA = `kb_migtest_${randomUUID()}`;
    const bitB = `kb_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body)
       VALUES ($1, $2, 0, 'First source, bit 0.')`,
      [bitA, sourceA],
    );

    await expect(
      client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body)
         VALUES ($1, $2, 0, 'Second source, bit 0.')`,
        [bitB, sourceB],
      ),
    ).resolves.toBeDefined();

    const { rows: backgroundRowsA } = await client.query(
      `SELECT background FROM knowledge_bits WHERE id = $1`,
      [bitA],
    );
    const { rows: backgroundRowsB } = await client.query(
      `SELECT background FROM knowledge_bits WHERE id = $1`,
      [bitB],
    );

    expect(backgroundRowsA[0].background).toBeNull();
    expect(backgroundRowsB[0].background).toBeNull();
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--detect-knowledge-bits/scenarios.md) —
// "Two concurrent scan runs never both claim the same source" — proved
// against the REAL claimPendingKnowledgeSources repo function (not a raw-SQL
// simulation), run twice concurrently via Promise.all.
describe("migrations — claimPendingKnowledgeSources atomic claim (prose-knowledge-fisher--detect-knowledge-bits)", () => {
  it("never lets two concurrent calls both claim the same source", async () => {
    const sourceA = `ks_migtest_${randomUUID()}`;
    const sourceB = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Source A.', 'pending')`,
      [sourceA],
    );
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Source B.', 'pending')`,
      [sourceB],
    );

    // Limit is generous since the shared test database can carry other
    // tests' pending rows; the assertion below filters down to just ours.
    const [firstClaim, secondClaim] = await Promise.all([
      claimPendingKnowledgeSources(1000, testDb),
      claimPendingKnowledgeSources(1000, testDb),
    ]);

    const ourIds = new Set([sourceA, sourceB]);
    const claimedIds = [...firstClaim, ...secondClaim]
      .map((row) => row.id)
      .filter((id) => ourIds.has(id))
      .sort();

    expect(claimedIds).toEqual([sourceA, sourceB].sort());

    const { rows } = await client.query(
      `SELECT id, status FROM knowledge_sources WHERE id = ANY($1)`,
      [[sourceA, sourceB]],
    );

    expect(rows.every((row) => row.status === "processing")).toBe(true);
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--detect-knowledge-bits/scenarios.md) —
// "Re-detecting the same source twice ... never duplicates bits" — proved
// against the REAL insertKnowledgeBits repo function, called twice with the
// same sourceId + bits.
describe("migrations — insertKnowledgeBits idempotent re-detection (prose-knowledge-fisher--detect-knowledge-bits)", () => {
  it("keeps exactly one row per bit when the same source is detected twice", async () => {
    const sourceId = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
      [sourceId],
    );

    const bits = [
      { text: "First bit.", background: null },
      { text: "Second bit.", background: null },
      { text: "Third bit.", background: null },
    ];

    await insertKnowledgeBits(sourceId, bits, testDb);
    await insertKnowledgeBits(sourceId, bits, testDb);

    const { rows } = await client.query(
      `SELECT ordinal, body FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal`,
      [sourceId],
    );

    expect(rows).toEqual([
      { ordinal: 0, body: "First bit." },
      { ordinal: 1, body: "Second bit." },
      { ordinal: 2, body: "Third bit." },
    ]);
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--stale-row-reset/scenarios.md) —
// proves resetStaleProcessingKnowledgeSources' WHERE clause against real
// Postgres: a stale processing row is reset, a fresh one and rows in other
// statuses are left alone, regardless of how old their updated_at is.
describe("migrations — resetStaleProcessingKnowledgeSources (prose-knowledge-fisher--stale-row-reset)", () => {
  const STALE_MS = 15 * 60 * 1000;

  async function insertSource(overrides: {
    id: string;
    status: string;
    failureReason?: string | null;
  }): Promise<void> {
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason)
       VALUES ($1, 'prose', 'Some prose.', $2, $3)`,
      [overrides.id, overrides.status, overrides.failureReason ?? null],
    );
  }

  async function backdate(id: string, interval: string): Promise<void> {
    await client.query(
      `UPDATE knowledge_sources SET updated_at = now() - $2::interval WHERE id = $1`,
      [id, interval],
    );
  }

  it("resets a processing row older than the threshold to pending and clears its failure reason", async () => {
    const staleId = `ks_migtest_${randomUUID()}`;

    await insertSource({ id: staleId, status: "processing", failureReason: "some reason" });
    await backdate(staleId, "1 hour");

    const count = await resetStaleProcessingKnowledgeSources(STALE_MS, testDb);

    expect(count).toBeGreaterThanOrEqual(1);

    const { rows } = await client.query(
      `SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`,
      [staleId],
    );

    expect(rows[0]).toMatchObject({ status: "pending", failure_reason: null });
  });

  it("leaves a recently-claimed processing row untouched", async () => {
    const freshId = `ks_migtest_${randomUUID()}`;

    await insertSource({ id: freshId, status: "processing" });
    await backdate(freshId, "1 minute");

    await resetStaleProcessingKnowledgeSources(STALE_MS, testDb);

    const { rows } = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [
      freshId,
    ]);

    expect(rows[0].status).toBe("processing");
  });

  it.each(["pending", "bits_detected", "failed"])(
    "never touches a %s row regardless of how old its updated_at is",
    async (status) => {
      const id = `ks_migtest_${randomUUID()}`;

      await insertSource({ id, status });
      await backdate(id, "1 hour");

      await resetStaleProcessingKnowledgeSources(STALE_MS, testDb);

      const { rows } = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [
        id,
      ]);

      expect(rows[0].status).toBe(status);
    },
  );

  it("makes a reset row claimable again on the very next claim call", async () => {
    const staleId = `ks_migtest_${randomUUID()}`;

    await insertSource({ id: staleId, status: "processing" });
    await backdate(staleId, "1 hour");

    await resetStaleProcessingKnowledgeSources(STALE_MS, testDb);
    const claimed = await claimPendingKnowledgeSources(1000, testDb);

    expect(claimed.some((row) => row.id === staleId)).toBe(true);

    const { rows } = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [
      staleId,
    ]);

    expect(rows[0].status).toBe("processing");
  });
});

// SCENARIO (.planning/prose-knowledge-fisher--stale-row-reset/scenarios.md) —
// proves the claimedAt ownership token round-trips through a real timestamptz
// column (claim, then a write using the returned token succeeds) and that a
// stale token — captured before a reset reclaims the row — is rejected as a
// no-op once someone else has claimed it, against real Postgres rather than
// the unit tests' mock.
describe("migrations — claimedAt ownership token (prose-knowledge-fisher--stale-row-reset)", () => {
  const STALE_MS = 15 * 60 * 1000;

  it("lets a write through when the claim token still matches the stored updated_at", async () => {
    const sourceId = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
      [sourceId],
    );

    const claimResults = await claimPendingKnowledgeSources(1000, testDb);
    const claimed = claimResults.find((row) => row.id === sourceId);

    expect(claimed).toBeDefined();

    const changed = await markKnowledgeSourceFailed(
      sourceId,
      "source_too_long",
      claimed!.claimedAt,
      testDb,
    );

    expect(changed).toBe(true);

    const { rows } = await client.query(
      `SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`,
      [sourceId],
    );

    expect(rows[0]).toMatchObject({ status: "failed", failure_reason: "source_too_long" });
  });

  it("rejects a stale claim token as a no-op once a reset has let another scan reclaim the row", async () => {
    const sourceId = `ks_migtest_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
      [sourceId],
    );

    const firstClaimResults = await claimPendingKnowledgeSources(1000, testDb);
    const firstClaim = firstClaimResults.find((row) => row.id === sourceId);

    expect(firstClaim).toBeDefined();

    const staleToken = firstClaim!.claimedAt;

    await client.query(`UPDATE knowledge_sources SET updated_at = now() - '1 hour'::interval WHERE id = $1`, [
      sourceId,
    ]);
    await resetStaleProcessingKnowledgeSources(STALE_MS, testDb);

    const reclaimResults = await claimPendingKnowledgeSources(1000, testDb);
    const secondClaim = reclaimResults.find((row) => row.id === sourceId);

    expect(secondClaim).toBeDefined();

    await expect(
      insertKnowledgeBitsAndMarkDetected(
        sourceId,
        [{ text: "A bit from the stale attempt.", background: null }],
        staleToken,
        testDb,
      ),
    ).rejects.toThrow("knowledge_source_reclaimed");

    const failedWithStaleToken = await markKnowledgeSourceFailed(
      sourceId,
      "provider error from stale attempt",
      staleToken,
      testDb,
    );

    expect(failedWithStaleToken).toBe(false);

    const { rows: bitRows } = await client.query(
      `SELECT body FROM knowledge_bits WHERE knowledge_source_id = $1`,
      [sourceId],
    );

    expect(bitRows).toHaveLength(0);

    const { rows: sourceRows } = await client.query(
      `SELECT status FROM knowledge_sources WHERE id = $1`,
      [sourceId],
    );

    expect(sourceRows[0].status).toBe("processing");

    const succeeded = await markKnowledgeSourceBitsDetected(sourceId, secondClaim!.claimedAt, testDb);

    expect(succeeded).toBe(true);
  });
});
