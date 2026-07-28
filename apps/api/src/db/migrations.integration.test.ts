import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "./assert-local-db-target.js";

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
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

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

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);

  testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  const db = drizzle(testPool);

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
