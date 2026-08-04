import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAttemptToPhraseBankEntry, selectDuePhrases } from "@post-anki/core";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import { subjects, phrases, attempts, phraseBankEntries, phraseBankAppearances, languagePracticeSettings } from "../db/schema.js";
import { toEntryState } from "../practice/phrase-bank.repo.js";
import { newId } from "../shared/id.js";
import { runMigration, type MigrationSummary } from "./migrate-english-practice-data.orchestrator.js";
import {
  FIXTURE_LEVEL,
  FIXTURE_MASTERED_COLLISION_ID,
  FIXTURE_MASTERED_COLLISION_TEXT,
  FIXTURE_NEW_ENTRY_ID,
  FIXTURE_PRACTICING_ENTRY_ID,
  FIXTURE_STRUGGLING_ENTRY_ID,
  buildFixtureActivePhrases,
  buildFixtureMasteredPhrases,
  buildFixtureSourceAttempts,
  buildFixtureSourcePhrases,
  removeFixtureLearningDir,
  seedSourceFixtureDb,
  writeFixtureLearningDir,
} from "./migrate-english-practice-data.fixtures.js";

// SCENARIO 4, SCENARIO 9 (idempotency + crash-safety proof) plus the DoD's
// items (a)-(g) — no live source Neon database exists in this build
// environment (see .planning/migrate-english-practice-data/todo.md's Manual
// steps), so this test fabricates a source-shaped throwaway Postgres
// database (settings/phrases/attempts) instead, and a real migrated
// throwaway target database, matching db/migrations.integration.test.ts's
// and seed-domain-nodes.integration.test.ts's own established pattern for
// this project.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

// Mirrors apps/api/src/domain-map/seed-domain-nodes.integration.test.ts's
// own createMigratedTestDb — a throwaway database migrated to the tip of
// this project's real schema, standing in for DATABASE_URL. Kept inline in
// this test file, not the shared fixtures module, because this project's
// dependency-cruiser rule "no-raw-sql-outside-db-layer" restricts importing
// 'pg' to apps/api/src/db/ and test files.
async function createMigratedTargetDb(
  baseDatabaseUrl: string,
  label: string,
): Promise<{
  dbName: string;
  adminPool: pg.Pool;
  pool: pg.Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
}> {
  const dbName = `mepd_target_${label}_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new pg.Pool({ connectionString: baseDatabaseUrl });

  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const pool = new pg.Pool({ connectionString: withDatabaseName(baseDatabaseUrl, dbName) });
  const db = drizzle(pool, { schema });

  await migrate(db, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });

  return { dbName, adminPool, pool, db };
}

// A throwaway database holding ONLY the three raw source tables
// (settings/phrases/attempts), matching english-advanced's real column
// shapes — never this project's own Drizzle schema. Stands in for
// SOURCE_DATABASE_URL.
async function createSourceFixtureDb(
  baseDatabaseUrl: string,
  label: string,
): Promise<{ dbName: string; adminPool: pg.Pool; pool: pg.Pool }> {
  const dbName = `mepd_source_${label}_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new pg.Pool({ connectionString: baseDatabaseUrl });

  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const pool = new pg.Pool({ connectionString: withDatabaseName(baseDatabaseUrl, dbName) });

  await pool.query(`
    CREATE TABLE settings (
      id integer PRIMARY KEY,
      level text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE phrases (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL,
      level text NOT NULL,
      position integer NOT NULL,
      russian text NOT NULL,
      reference_english text NOT NULL,
      domain text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE attempts (
      id uuid PRIMARY KEY,
      phrase_id uuid NOT NULL REFERENCES phrases(id),
      user_answer text NOT NULL,
      score integer NOT NULL,
      verdict text NOT NULL,
      feedback text NOT NULL,
      native_alternatives text[] NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return { dbName, adminPool, pool };
}

async function dropTestDb(dbName: string, adminPool: pg.Pool, pool: pg.Pool): Promise<void> {
  await pool.end();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}

describe("migrate-english-practice-data — idempotent import against source-shaped fixtures", () => {
  let sourceDbName: string;
  let sourceAdminPool: pg.Pool;
  let sourcePool: pg.Pool;
  let targetDbName: string;
  let targetAdminPool: pg.Pool;
  let targetPool: pg.Pool;
  let db: ReturnType<typeof drizzle<typeof import("../db/schema.js")>>;
  let learningDir: string;
  let subjectId: string;
  let liveCollisionEntryId: string;

  let firstRun: MigrationSummary;
  let secondRun: MigrationSummary;

  beforeAll(async () => {
    const source = await createSourceFixtureDb(BASE_DATABASE_URL, "idem");
    sourceDbName = source.dbName;
    sourceAdminPool = source.adminPool;
    sourcePool = source.pool;

    const sourcePhrases = buildFixtureSourcePhrases();
    const sourceAttempts = buildFixtureSourceAttempts(sourcePhrases);
    await seedSourceFixtureDb(sourcePool, FIXTURE_LEVEL, sourcePhrases, sourceAttempts);

    const active = buildFixtureActivePhrases();
    const mastered = buildFixtureMasteredPhrases();
    learningDir = await writeFixtureLearningDir(active, mastered);

    const target = await createMigratedTargetDb(BASE_DATABASE_URL, "idem");
    targetDbName = target.dbName;
    targetAdminPool = target.adminPool;
    targetPool = target.pool;
    db = target.db;

    subjectId = newId("sub");
    await db.insert(subjects).values({ id: subjectId, name: "English" });

    // Decision 16 / SCENARIO 11 fixture — a LIVE (non-imported) active entry
    // whose normalized text matches the mastered import
    // FIXTURE_MASTERED_COLLISION_ID's own text, differing only in
    // case/whitespace, seeded BEFORE the migration runs (simulating a batch
    // generated live between the subject's kind flip and this migration).
    liveCollisionEntryId = newId("pbentry");
    await db.insert(phraseBankEntries).values({
      id: liveCollisionEntryId,
      subjectId,
      level: FIXTURE_LEVEL,
      pack: "General",
      phraseText: "break the ice",
      category: "idioms",
      status: "practicing",
      masteryStage: 1,
      correctCountInCycle: 1,
      incorrectCountInCycle: 0,
    });

    firstRun = await runMigration({ dryRun: false, sourcePool, db, learningDir });
    secondRun = await runMigration({ dryRun: false, sourcePool, db, learningDir });
  }, 60_000);

  afterAll(async () => {
    await removeFixtureLearningDir(learningDir);
    await dropTestDb(sourceDbName, sourceAdminPool, sourcePool);
    await dropTestDb(targetDbName, targetAdminPool, targetPool);
  }, 30_000);

  it("(a) the first run creates the expected row counts in every target table", () => {
    expect(firstRun.phrases).toEqual({ toCreate: 12, alreadyPresent: 0 });
    expect(firstRun.attempts).toEqual({ toCreate: 12, alreadyPresent: 0 });
    expect(firstRun.phraseBankEntries.toCreate).toBe(6);
    expect(firstRun.phraseBankEntries.activeToCreate).toBe(4);
    expect(firstRun.phraseBankEntries.masteredToCreate).toBe(2);
    expect(firstRun.phraseBankAppearances).toEqual({ toCreate: 9, alreadyPresent: 0 });
  });

  it("(a) the created rows are actually present in the target database", async () => {
    const phraseRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(phrases)
      .where(sql`${phrases.id} LIKE 'phrase_import_%'`);
    expect(Number(phraseRows[0]!.count)).toBe(12);

    const attemptRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(attempts)
      .where(sql`${attempts.id} LIKE 'attempt_import_%'`);
    expect(Number(attemptRows[0]!.count)).toBe(12);

    const entryRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(phraseBankEntries)
      .where(sql`${phraseBankEntries.id} LIKE 'pbe_import_%'`);
    expect(Number(entryRows[0]!.count)).toBe(6);

    const appearanceRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(phraseBankAppearances)
      .where(sql`${phraseBankAppearances.id} LIKE 'pba_import_%'`);
    expect(Number(appearanceRows[0]!.count)).toBe(9);
  });

  it("(b) the second run creates exactly zero new rows in every target table", () => {
    expect(secondRun.phrases).toEqual({ toCreate: 0, alreadyPresent: 12 });
    expect(secondRun.attempts).toEqual({ toCreate: 0, alreadyPresent: 12 });
    expect(secondRun.phraseBankEntries.toCreate).toBe(0);
    expect(secondRun.phraseBankEntries.alreadyPresent).toBe(6);
    expect(secondRun.phraseBankAppearances).toEqual({ toCreate: 0, alreadyPresent: 9 });
  });

  it("(b) row counts are identical before/after the second run", async () => {
    const phraseCount = await db.select({ count: sql<number>`count(*)` }).from(phrases);
    const attemptCount = await db.select({ count: sql<number>`count(*)` }).from(attempts);
    const entryCount = await db.select({ count: sql<number>`count(*)` }).from(phraseBankEntries);
    const appearanceCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(phraseBankAppearances);

    expect(Number(phraseCount[0]!.count)).toBe(12);
    expect(Number(attemptCount[0]!.count)).toBe(12);
    // 6 imported + 1 pre-seeded live collision entry.
    expect(Number(entryCount[0]!.count)).toBe(7);
    expect(Number(appearanceCount[0]!.count)).toBe(9);
  });

  it("(c) every migrated phrases row has targetPhraseBankEntryId: null", async () => {
    const rows = await db
      .select({ targetPhraseBankEntryId: phrases.targetPhraseBankEntryId })
      .from(phrases)
      .where(sql`${phrases.id} LIKE 'phrase_import_%'`);

    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.targetPhraseBankEntryId === null)).toBe(true);
  });

  it("(d) an imported struggling/practicing entry's scheduledForSentenceCount equals the level's post-import max sequenceNumber exactly, and lastCorrectAtSentenceCount is null", async () => {
    const rows = await db
      .select()
      .from(phraseBankEntries)
      .where(sql`${phraseBankEntries.id} LIKE 'pbe_import_%'`);

    const practicing = rows.find((r) => r.id === `pbe_import_${FIXTURE_PRACTICING_ENTRY_ID}`);
    const struggling = rows.find((r) => r.id === `pbe_import_${FIXTURE_STRUGGLING_ENTRY_ID}`);

    expect(practicing?.status).toBe("practicing");
    expect(practicing?.scheduledForSentenceCount).toBe(8);
    expect(practicing?.lastCorrectAtSentenceCount).toBeNull();

    // Isolation checked before masteryStage (SCENARIO 2) — this entry has
    // masteryStage: 1 (nonzero) and mode: "isolation" in the fixture, and
    // must still classify as struggling, never practicing.
    expect(struggling?.status).toBe("struggling");
    expect(struggling?.scheduledForSentenceCount).toBe(8);
    expect(struggling?.lastCorrectAtSentenceCount).toBeNull();
  });

  it("(e) an imported new entry is excluded from selectDuePhrases at any currentSequenceNumber", async () => {
    const rows = await db
      .select()
      .from(phraseBankEntries)
      .where(eq(phraseBankEntries.subjectId, subjectId));

    const entries = rows.map(toEntryState);
    const newEntryId = `pbe_import_${FIXTURE_NEW_ENTRY_ID}`;

    for (const currentSequenceNumber of [0, 1, 8, 100, 100_000]) {
      const due = selectDuePhrases(entries, currentSequenceNumber, 50);
      expect(due.some((d) => d.id === newEntryId)).toBe(false);
    }

    expect(rows.some((r) => r.id === newEntryId)).toBe(true);
  });

  it("(f) the recycled entry's first post-import correct attempt advances masteryStage by exactly one", async () => {
    const rows = await db
      .select()
      .from(phraseBankEntries)
      .where(eq(phraseBankEntries.id, `pbe_import_${FIXTURE_PRACTICING_ENTRY_ID}`));

    const entry = rows[0]!;
    const entryState = toEntryState(entry);

    expect(entryState.scheduledForSentenceCount).toBe(8);
    expect(entryState.masteryStage).toBe(1);

    const result = applyAttemptToPhraseBankEntry(entryState, {
      sequenceNumber: entryState.scheduledForSentenceCount! + 1,
      verdict: "Ok",
    });

    expect(result.entry.masteryStage).toBe(entryState.masteryStage + 1);
  });

  it("(g) a mastered import colliding on text with a live active entry inserts as its own separate row", async () => {
    const rows = await db
      .select()
      .from(phraseBankEntries)
      .where(sql`lower(trim(${phraseBankEntries.phraseText})) = lower(trim(${FIXTURE_MASTERED_COLLISION_TEXT}))`);

    expect(rows).toHaveLength(2);

    const mastered = rows.find((r) => r.status === "mastered");
    const live = rows.find((r) => r.status !== "mastered");

    expect(mastered?.id).toBe(`pbe_import_${FIXTURE_MASTERED_COLLISION_ID}`);
    expect(live?.id).toBe(liveCollisionEntryId);
    // The live entry's own progress was never touched.
    expect(live?.status).toBe("practicing");
    expect(live?.masteryStage).toBe(1);
  });

  it("flips the subject's kind to language-practice and upserts languagePracticeSettings to the source level", async () => {
    const subjectRows = await db.select().from(subjects).where(eq(subjects.id, subjectId));
    expect(subjectRows[0]?.kind).toBe("language-practice");

    const settingsRows = await db
      .select()
      .from(languagePracticeSettings)
      .where(eq(languagePracticeSettings.subjectId, subjectId));
    expect(settingsRows[0]?.level).toBe(FIXTURE_LEVEL);
    expect(settingsRows[0]?.pack).toBe("General");
  });
});

describe("migrate-english-practice-data — SCENARIO 6: missing prerequisite subject fails loudly", () => {
  let sourceDbName: string;
  let sourceAdminPool: pg.Pool;
  let sourcePool: pg.Pool;
  let targetDbName: string;
  let targetAdminPool: pg.Pool;
  let targetPool: pg.Pool;
  let db: ReturnType<typeof drizzle<typeof import("../db/schema.js")>>;
  let learningDir: string;

  beforeAll(async () => {
    const source = await createSourceFixtureDb(BASE_DATABASE_URL, "nosubj");
    sourceDbName = source.dbName;
    sourceAdminPool = source.adminPool;
    sourcePool = source.pool;

    const sourcePhrases = buildFixtureSourcePhrases();
    const sourceAttempts = buildFixtureSourceAttempts(sourcePhrases);
    await seedSourceFixtureDb(sourcePool, FIXTURE_LEVEL, sourcePhrases, sourceAttempts);

    learningDir = await writeFixtureLearningDir(
      buildFixtureActivePhrases(),
      buildFixtureMasteredPhrases(),
    );

    const target = await createMigratedTargetDb(BASE_DATABASE_URL, "nosubj");
    targetDbName = target.dbName;
    targetAdminPool = target.adminPool;
    targetPool = target.pool;
    db = target.db;
  }, 60_000);

  afterAll(async () => {
    await removeFixtureLearningDir(learningDir);
    await dropTestDb(sourceDbName, sourceAdminPool, sourcePool);
    await dropTestDb(targetDbName, targetAdminPool, targetPool);
  }, 30_000);

  it("throws and inserts nothing when no subject named English exists", async () => {
    await expect(runMigration({ dryRun: false, sourcePool, db, learningDir })).rejects.toThrow(
      /English/,
    );

    const rows = await db.select().from(phraseBankEntries);
    expect(rows).toHaveLength(0);
  });
});
