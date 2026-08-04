import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 2, 3, 4 (.planning/phrase-bank-concurrency-fix/scenarios.md) — the
// three real-DB concurrency race proofs. These exercise generatePhraseBatch
// and gradeAttempts end to end against the project's real e2e Postgres (not
// mocked), with only the Mastra agent call mocked for determinism — the same
// vi.mock("../mastra/mastra.js", ...) shape the existing orchestrator unit
// tests already use. DATABASE_URL must point at an e2e Postgres already
// migrated to the tip of apps/api/src/db/migrations/ (see spec.md's
// Implementation order — this file assumes the migration already ran).
//
// Non-negotiable per spec.md's Definition of Done: every concurrency case
// asserts BOTH concurrent calls resolve successfully (Promise.all, never
// Promise.allSettled, no swallowed rejection) as its own explicit assertion
// BEFORE any row is inspected — a test that tolerated one call silently
// failing and only checked "no duplicates among whatever landed" would pass
// vacuously even with no lock at all.

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

const dbName = `pb_concurrency_${randomUUID().replace(/-/g, "_")}`;
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

beforeEach(() => {
  vi.clearAllMocks();
});

function newSubjectId(prefix: string): string {
  return `sub_${prefix}_${randomUUID()}`;
}

function genericPhraseBatchItem(index: number) {
  return {
    russian: `Тестовое предложение ${index}`,
    referenceEnglish: `Test sentence ${index}`,
    domain: "Everyday" as const,
    targetPhraseBankEntryId: null,
    newTargetPhrase: null,
  };
}

describe("SCENARIO 2 — concurrent batch generation never produces duplicate sequence numbers", () => {
  it("two concurrent generatePhraseBatch calls for the identical scope both succeed and leave 20 distinct sequence numbers", async () => {
    const subjectId = newSubjectId("s2");
    const level = "B1_B2";
    const pack = "General";

    mockGenerateAgent.mockResolvedValue({
      object: { phrases: Array.from({ length: 10 }, (_, i) => genericPhraseBatchItem(i)) },
    });

    const [rowsA, rowsB] = await Promise.all([
      generatePhraseBatch(subjectId, level, pack),
      generatePhraseBatch(subjectId, level, pack),
    ]);

    expect(rowsA).toHaveLength(10);
    expect(rowsB).toHaveLength(10);

    const { rows } = await client.query(
      `SELECT sequence_number FROM phrases WHERE subject_id = $1 AND level = $2 AND pack = $3`,
      [subjectId, level, pack],
    );

    expect(rows).toHaveLength(20);

    const sequenceNumbers = rows.map((r) => Number(r.sequence_number)).sort((a, b) => a - b);

    expect(new Set(sequenceNumbers).size).toBe(20);
    expect(sequenceNumbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    const dupCheck = await client.query(
      `SELECT sequence_number, count(*) FROM phrases
       WHERE subject_id = $1 AND level = $2 AND pack = $3
       GROUP BY sequence_number HAVING count(*) > 1`,
      [subjectId, level, pack],
    );

    expect(dupCheck.rows).toHaveLength(0);

    const nullCheck = await client.query(
      `SELECT count(*) FROM phrases WHERE subject_id = $1 AND level = $2 AND pack = $3 AND sequence_number IS NULL`,
      [subjectId, level, pack],
    );

    expect(Number(nullCheck.rows[0].count)).toBe(0);

    mockGenerateAgent.mockResolvedValue({
      object: { phrases: Array.from({ length: 10 }, (_, i) => genericPhraseBatchItem(i)) },
    });

    const rowsC = await generatePhraseBatch(subjectId, level, pack);

    expect(rowsC.map((r) => r.sequenceNumber).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, i) => 21 + i),
    );
  });
});

describe("SCENARIO 3 — concurrent batch generation never creates a duplicate phrase-bank entry", () => {
  it("two concurrent calls that both introduce the identical new phrase text land exactly one phrase_bank_entries row", async () => {
    const subjectId = newSubjectId("s3");
    const level = "B1_B2";
    const pack = "General";

    mockGenerateAgent.mockResolvedValue({
      object: {
        phrases: [
          {
            russian: "Я тону в работе",
            referenceEnglish: "I'm drowning in work",
            domain: "Everyday" as const,
            targetPhraseBankEntryId: null,
            newTargetPhrase: { text: "drowning in work", category: "idioms" },
          },
          {
            russian: "Сжигаю масло в полночь",
            referenceEnglish: "Burning the midnight oil",
            domain: "Everyday" as const,
            targetPhraseBankEntryId: null,
            newTargetPhrase: { text: "burning the midnight oil", category: "idioms" },
          },
        ],
      },
    });

    const [rowsA, rowsB] = await Promise.all([
      generatePhraseBatch(subjectId, level, pack),
      generatePhraseBatch(subjectId, level, pack),
    ]);

    expect(rowsA).toHaveLength(2);
    expect(rowsB).toHaveLength(2);

    const { rows: drowningRows } = await client.query(
      `SELECT id FROM phrase_bank_entries
       WHERE subject_id = $1 AND level = $2 AND pack = $3 AND lower(phrase_text) = lower($4)`,
      [subjectId, level, pack, "drowning in work"],
    );

    expect(drowningRows).toHaveLength(1);
    const drowningEntryId = drowningRows[0]!.id as string;

    expect(rowsA[0]!.targetPhraseBankEntryId).toBe(drowningEntryId);
    expect(rowsB[0]!.targetPhraseBankEntryId).toBe(drowningEntryId);

    const { rows: burningRows } = await client.query(
      `SELECT id FROM phrase_bank_entries
       WHERE subject_id = $1 AND level = $2 AND pack = $3 AND lower(phrase_text) = lower($4)`,
      [subjectId, level, pack, "burning the midnight oil"],
    );

    expect(burningRows).toHaveLength(1);
    expect(burningRows[0]!.id).not.toBe(drowningEntryId);
  });

  // Not a concurrency case — a same-text unique index alone (no status
  // predicate) would also reject this SEQUENTIAL, single-call scenario,
  // which matchExistingPhraseBankEntry's own comparison explicitly allows
  // (it excludes status === "mastered" from matching, so a mastered phrase
  // re-encountered later is meant to start a fresh entry, not error out).
  // Pinning this here because the unique index this plan adds is what could
  // silently break it.
  it("a mastered entry's phrase text can be introduced again as a fresh entry without erroring", async () => {
    const subjectId = newSubjectId("s3-mastered");
    const level = "B1_B2";
    const pack = "General";

    await client.query(
      `INSERT INTO phrase_bank_entries
         (id, subject_id, level, pack, phrase_text, status, mastery_stage, correct_count_in_cycle, incorrect_count_in_cycle)
       VALUES ($1, $2, $3, $4, 'drowning in work', 'mastered', 3, 3, 0)`,
      [`pbentry_${randomUUID()}`, subjectId, level, pack],
    );

    mockGenerateAgent.mockResolvedValue({
      object: {
        phrases: [
          {
            russian: "Я снова тону в работе",
            referenceEnglish: "I'm drowning in work again",
            domain: "Everyday" as const,
            targetPhraseBankEntryId: null,
            newTargetPhrase: { text: "drowning in work", category: "idioms" },
          },
        ],
      },
    });

    await expect(generatePhraseBatch(subjectId, level, pack)).resolves.toHaveLength(1);

    const { rows } = await client.query(
      `SELECT id, status FROM phrase_bank_entries
       WHERE subject_id = $1 AND level = $2 AND pack = $3 AND lower(trim(phrase_text)) = lower(trim($4))`,
      [subjectId, level, pack, "drowning in work"],
    );

    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "mastered")).toHaveLength(1);
    expect(rows.filter((r) => r.status !== "mastered")).toHaveLength(1);
  });
});

describe("SCENARIO 4 — concurrent grading against the same phrase-bank entry never loses a mastery transition", () => {
  it("two concurrent gradeAttempts calls both count, and a third sequential correct attempt reaches mastered", async () => {
    const subjectId = newSubjectId("s4");
    const level = "B1_B2";
    const pack = "General";

    const entryId = `pbentry_${randomUUID()}`;

    await client.query(
      `INSERT INTO phrase_bank_entries
         (id, subject_id, level, pack, phrase_text, status, mastery_stage, correct_count_in_cycle, incorrect_count_in_cycle, last_correct_at_sentence_count, scheduled_for_sentence_count)
       VALUES ($1, $2, $3, $4, 'get to the bottom of', 'practicing', 0, 0, 0, NULL, NULL)`,
      [entryId, subjectId, level, pack],
    );

    const phraseAt = async (sequenceNumber: number): Promise<string> => {
      const id = `phrase_${randomUUID()}`;

      await client.query(
        `INSERT INTO phrases
           (id, subject_id, batch_id, level, pack, position, russian, reference_english, domain, target_phrase_bank_entry_id, sequence_number)
         VALUES ($1, $2, $3, $4, $5, 1, 'Разберись с этим', 'Get to the bottom of it', 'Tech', $6, $7)`,
        [id, subjectId, `batch_${randomUUID()}`, level, pack, entryId, sequenceNumber],
      );

      return id;
    };

    const phraseSeq1 = await phraseAt(1);
    const phraseSeq9 = await phraseAt(9);
    const phraseSeq20 = await phraseAt(20);

    mockGradeAgent.mockResolvedValue({
      object: { gradedAnswers: [{ score: 9, verdict: "Ok", feedback: "Nice.", nativeAlternatives: [] }] },
    });

    const [resultA, resultB] = await Promise.all([
      gradeAttempts(subjectId, level, [{ phraseId: phraseSeq1, userAnswer: "Get to the bottom of it" }]),
      gradeAttempts(subjectId, level, [{ phraseId: phraseSeq9, userAnswer: "Get to the bottom of it" }]),
    ]);

    expect(resultA.phraseBankUpdates).toHaveLength(1);
    expect(resultB.phraseBankUpdates).toHaveLength(1);

    const { rows: afterConcurrent } = await client.query(
      `SELECT correct_count_in_cycle, mastery_stage, status FROM phrase_bank_entries WHERE id = $1`,
      [entryId],
    );

    expect(afterConcurrent[0]!.correct_count_in_cycle).toBe(2);
    expect(afterConcurrent[0]!.mastery_stage).toBe(2);
    expect(afterConcurrent[0]!.status).toBe("practicing");

    const appearanceCount = await client.query(
      `SELECT count(*) FROM phrase_bank_appearances WHERE phrase_bank_entry_id = $1`,
      [entryId],
    );

    expect(Number(appearanceCount.rows[0].count)).toBe(2);

    mockGradeAgent.mockResolvedValue({
      object: { gradedAnswers: [{ score: 10, verdict: "Ok", feedback: "Mastered.", nativeAlternatives: [] }] },
    });

    await gradeAttempts(subjectId, level, [{ phraseId: phraseSeq20, userAnswer: "Get to the bottom of it" }]);

    const { rows: afterThird } = await client.query(
      `SELECT correct_count_in_cycle, mastery_stage, status FROM phrase_bank_entries WHERE id = $1`,
      [entryId],
    );

    expect(afterThird[0]!.mastery_stage).toBe(3);
    expect(afterThird[0]!.status).toBe("mastered");
  });
});
