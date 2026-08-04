import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The cross-path deadlock proof named in
// docs/architecture/phrase-bank-concurrency-fix/review.md — the case the
// original fix's own self-critique wrongly ruled out. Generation locks the
// scope's phrase_bank_entries rows implicitly, through the
// phrases -> phrase_bank_entries FK (every insert carrying a non-null
// target takes FOR KEY SHARE on the referenced row, in the model's
// generation order); grading locks the same rows explicitly with FOR UPDATE
// in id order. FOR KEY SHARE conflicts with FOR UPDATE, so when those two
// orders disagree the two transactions can each hold one row and wait on the
// other, and Postgres aborts one of them with 40P01.
//
// The real-world window for that interleaving is narrow, so this test forces
// it with a third connection that holds the lower-id entry just long enough
// for both write paths to queue up behind it in the order that produces the
// cycle. Every step waits on an observed lock-wait state in
// pg_stat_activity rather than on a sleep — a timing-based version of this
// test would go quietly non-reproducing the moment the machine got slower.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `pb_deadlock_${randomUUID().replace(/-/g, "_")}`;
const TEST_DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

// Tags the orchestrators' own pool connections so the lock-wait polling below
// can count exactly them, and never a connection belonging to another
// integration test file running at the same time.
const POOL_APP_NAME = `pb-deadlock-${randomUUID().slice(0, 8)}`;
const taggedUrl = new URL(TEST_DATABASE_URL);

taggedUrl.searchParams.set("application_name", POOL_APP_NAME);

process.env.DATABASE_URL = taggedUrl.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const mockGenerateAgent = vi.fn();
const mockGradeAgent = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { phraseBatchGenerate: "phraseBatchGenerate", gradeBatch: "gradeBatch" },
  getMastra: () => ({
    getAgent: (key: string) => ({
      generate: key === "phraseBatchGenerate" ? mockGenerateAgent : mockGradeAgent,
    }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { generatePhraseBatch } = await import("./generate-phrase-batch.orchestrator.js");
const { gradeAttempts } = await import("./grade-attempts.orchestrator.js");

const LEVEL = "B1_B2";
const PACK = "General";

let client: pg.Client;
let blocker: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  blocker = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await Promise.all([client.connect(), blocker.connect()]);
}, 30_000);

afterAll(async () => {
  await blocker?.end();
  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function waitForLockWaiters(expected: number): Promise<void> {
  const deadline = Date.now() + 20_000;

  for (;;) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE application_name = $1 AND wait_event_type = 'Lock'`,
      [POOL_APP_NAME],
    );

    if (Number(rows[0]!.waiting) >= expected) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for ${expected} phrase-bank write path(s) to be blocked on a lock ` +
          `(saw ${rows[0]!.waiting}) — the interleaving this test constructs never formed`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function seedRecycledScope(subjectId: string): Promise<{ lowEntryId: string; highEntryId: string; lowPhraseId: string; highPhraseId: string }> {
  // Ids chosen so "low" sorts first: grading's FOR UPDATE walks the entries in
  // id order, while generation below is made to reference them in the opposite
  // order. That disagreement is the whole point of the test.
  const lowEntryId = `pbentry_aaaa_${randomUUID()}`;
  const highEntryId = `pbentry_zzzz_${randomUUID()}`;

  for (const [entryId, text] of [
    [lowEntryId, "get to the bottom of"],
    [highEntryId, "circle back on"],
  ]) {
    await client.query(
      `INSERT INTO phrase_bank_entries
         (id, subject_id, level, pack, phrase_text, status, mastery_stage, correct_count_in_cycle, incorrect_count_in_cycle, last_correct_at_sentence_count, scheduled_for_sentence_count)
       VALUES ($1, $2, $3, $4, $5, 'practicing', 1, 1, 0, NULL, 1)`,
      [entryId, subjectId, LEVEL, PACK, text],
    );
  }

  const batchId = `batch_${randomUUID()}`;

  const insertPhrase = async (entryId: string, sequenceNumber: number): Promise<string> => {
    const id = `phrase_${randomUUID()}`;

    await client.query(
      `INSERT INTO phrases
         (id, subject_id, batch_id, level, pack, position, russian, reference_english, domain, target_phrase_bank_entry_id, sequence_number)
       VALUES ($1, $2, $3, $4, $5, $6, 'Разберись с этим', 'Get to the bottom of it', 'Tech', $7, $8)`,
      [id, subjectId, batchId, LEVEL, PACK, sequenceNumber, entryId, sequenceNumber],
    );

    return id;
  };

  const lowPhraseId = await insertPhrase(lowEntryId, 1);
  const highPhraseId = await insertPhrase(highEntryId, 2);

  return { lowEntryId, highEntryId, lowPhraseId, highPhraseId };
}

describe("a generate and a grade running concurrently over the same recycled phrase-bank entries", () => {
  it("both complete instead of one being aborted as a deadlock victim", async () => {
    const subjectId = `sub_deadlock_${randomUUID()}`;
    const { lowEntryId, highEntryId, lowPhraseId, highPhraseId } = await seedRecycledScope(subjectId);

    // Generation order is deliberately the reverse of id order: the batch's
    // first phrase recycles the higher-id entry, so the FK's FOR KEY SHARE
    // locks land high-then-low while grading's FOR UPDATE takes low-then-high.
    mockGenerateAgent.mockResolvedValue({
      object: {
        phrases: [
          {
            russian: "Вернёмся к этому позже",
            referenceEnglish: "Let's circle back on this",
            domain: "Everyday" as const,
            targetPhraseBankEntryId: highEntryId,
            newTargetPhrase: null,
          },
          {
            russian: "Разберись с этим",
            referenceEnglish: "Get to the bottom of it",
            domain: "Everyday" as const,
            targetPhraseBankEntryId: lowEntryId,
            newTargetPhrase: null,
          },
        ],
      },
    });

    mockGradeAgent.mockResolvedValue({
      object: {
        gradedAnswers: [
          { score: 9, verdict: "Ok", feedback: "Nice.", nativeAlternatives: [] },
          { score: 9, verdict: "Ok", feedback: "Nice.", nativeAlternatives: [] },
        ],
      },
    });

    await blocker.query("BEGIN");

    let settled: PromiseSettledResult<unknown>[] = [];

    try {
      await blocker.query(`SELECT id FROM phrase_bank_entries WHERE id = $1 FOR UPDATE`, [lowEntryId]);

      const gradePromise = gradeAttempts(subjectId, LEVEL, [
        { phraseId: lowPhraseId, userAnswer: "Get to the bottom of it" },
        { phraseId: highPhraseId, userAnswer: "Let's circle back on this" },
      ]);

      await waitForLockWaiters(1);

      const generatePromise = generatePhraseBatch(subjectId, LEVEL, PACK);

      await waitForLockWaiters(2);

      await blocker.query("COMMIT");

      settled = await Promise.allSettled([gradePromise, generatePromise]);
    } finally {
      // Rolling back a committed transaction is a harmless no-op warning; not
      // rolling back an uncommitted one leaves the row locked and hangs every
      // later connection against this database.
      await blocker.query("ROLLBACK").catch(() => undefined);
    }

    const failures = settled
      .filter((entry): entry is PromiseRejectedResult => entry.status === "rejected")
      .map((entry) => String(entry.reason));

    expect(failures).toEqual([]);

    const { rows: phraseRows } = await client.query(
      `SELECT count(*)::int AS total FROM phrases WHERE subject_id = $1`,
      [subjectId],
    );

    expect(phraseRows[0]!.total).toBe(4);

    const { rows: entryRows } = await client.query(
      `SELECT id, correct_count_in_cycle FROM phrase_bank_entries WHERE id = ANY($1)`,
      [[lowEntryId, highEntryId]],
    );

    expect(entryRows).toHaveLength(2);
    expect(entryRows.every((row) => Number(row.correct_count_in_cycle) === 2)).toBe(true);
  }, 60_000);
});
