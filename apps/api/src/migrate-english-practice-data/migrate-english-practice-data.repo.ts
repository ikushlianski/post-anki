import { eq, inArray } from "drizzle-orm";
import type { Pack, PracticeLevel } from "@post-anki/shared";
import { domainSchema, practiceLevelSchema, verdictSchema } from "@post-anki/shared";
import { matchExistingEntryId, nextSequenceBase } from "../practice/phrase-bank.repo.js";
import type { DbExecutor } from "../db/client.js";
import {
  attempts,
  languagePracticeSettings,
  phraseBankAppearances,
  phraseBankEntries,
  phrases,
  subjects,
} from "../db/schema.js";

// Reused directly (SCENARIO 12's ordering guarantee, SCENARIO 11's collision
// check) rather than duplicated — see migrate-english-practice-data.orchestrator.ts.
export { matchExistingEntryId, nextSequenceBase };

// ---------------------------------------------------------------------------
// Source reads (SOURCE_DATABASE_URL — the source app's own tables
// (settings/phrases/attempts) are not part of this project's Drizzle schema,
// so these are raw SQL against a Neon Postgres shaped like
// english-advanced's own src/practice/practice.server.ts).
//
// Typed against this minimal structural interface, not pg.Pool directly:
// this project's dependency-cruiser rule "no-raw-sql-outside-db-layer"
// restricts importing the 'pg' package to apps/api/src/db/ (plus test
// files) — every other module goes through that layer instead. This file
// still needs to accept a caller-supplied pool for a database outside this
// app's own schema, so it depends on the shape it actually uses (a real
// pg.Pool satisfies this structurally, no cast needed) rather than the
// whole 'pg' module.
// ---------------------------------------------------------------------------

export interface SourceQueryPool {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface SourceSettingsRow {
  level: PracticeLevel;
}

export interface SourcePhraseRow {
  id: string;
  batch_id: string;
  level: PracticeLevel;
  position: number;
  russian: string;
  reference_english: string;
  domain: "Tech" | "SmallTalk" | "Everyday";
  created_at: Date;
}

export interface SourceAttemptRow {
  id: string;
  phrase_id: string;
  user_answer: string;
  score: number;
  verdict: "Ok" | "NeedsReview" | "NeedsDeepDive";
  feedback: string;
  native_alternatives: string[];
  created_at: Date;
}

export async function readSourceSettings(pool: SourceQueryPool): Promise<SourceSettingsRow> {
  const result = await pool.query<{ level: string }>("SELECT level FROM settings WHERE id = 1");
  const row = result.rows[0];

  if (!row) {
    throw new Error(
      "migrate-english-practice-data: source settings row (id=1) not found — is SOURCE_DATABASE_URL pointing at the right database?",
    );
  }

  return { level: practiceLevelSchema.parse(row.level) };
}

export async function readSourcePhrases(pool: SourceQueryPool): Promise<SourcePhraseRow[]> {
  const result = await pool.query<{
    id: string;
    batch_id: string;
    level: string;
    position: number;
    russian: string;
    reference_english: string;
    domain: string;
    created_at: Date;
  }>(
    "SELECT id, batch_id, level, position, russian, reference_english, domain, created_at FROM phrases ORDER BY created_at ASC",
  );

  return result.rows.map((row) => ({
    ...row,
    level: practiceLevelSchema.parse(row.level),
    domain: domainSchema.parse(row.domain),
  }));
}

export async function readSourceAttempts(pool: SourceQueryPool): Promise<SourceAttemptRow[]> {
  const result = await pool.query<{
    id: string;
    phrase_id: string;
    user_answer: string;
    score: number;
    verdict: string;
    feedback: string;
    native_alternatives: string[];
    created_at: Date;
  }>(
    "SELECT id, phrase_id, user_answer, score, verdict, feedback, native_alternatives, created_at FROM attempts ORDER BY created_at ASC",
  );

  return result.rows.map((row) => ({
    ...row,
    verdict: verdictSchema.parse(row.verdict),
  }));
}

// ---------------------------------------------------------------------------
// Target reads/writes (DATABASE_URL, this project's own Drizzle schema).
// Every function takes an explicit DbExecutor — never a default getDb()
// parameter — so the live write path can run every statement through the
// same transaction (Decision 13, mirroring generate-phrase-batch.orchestrator.ts's
// own "Design-integrity requirement" for linkOrCreateTargetPhrases).
// ---------------------------------------------------------------------------

// SCENARIO 1 — fails loudly if no subject named "English" exists yet, rather
// than creating one implicitly.
export async function findSubjectIdByName(name: string, db: DbExecutor): Promise<string | null> {
  const row = (await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.name, name)))[0];

  return row?.id ?? null;
}

export async function flipSubjectKindToLanguagePractice(
  subjectId: string,
  db: DbExecutor,
): Promise<void> {
  await db.update(subjects).set({ kind: "language-practice" }).where(eq(subjects.id, subjectId));
}

// Decision 9 — a true upsert, not a plain insert: getOrCreatePracticeSettings
// may have already lazily created a default (B1_B2/General) row before this
// script runs, and that default must be overwritten with the source's real
// last-known level, not left in place.
export async function upsertLanguagePracticeSettings(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
  db: DbExecutor,
): Promise<void> {
  await db
    .insert(languagePracticeSettings)
    .values({ subjectId, level, pack })
    .onConflictDoUpdate({
      target: languagePracticeSettings.subjectId,
      set: { level, pack, updatedAt: new Date() },
    });
}

export async function existingPhraseIds(ids: string[], db: DbExecutor): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await db.select({ id: phrases.id }).from(phrases).where(inArray(phrases.id, ids));

  return new Set(rows.map((r) => r.id));
}

export async function existingAttemptIds(ids: string[], db: DbExecutor): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await db.select({ id: attempts.id }).from(attempts).where(inArray(attempts.id, ids));

  return new Set(rows.map((r) => r.id));
}

export async function existingPhraseBankEntryIds(ids: string[], db: DbExecutor): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ id: phraseBankEntries.id })
    .from(phraseBankEntries)
    .where(inArray(phraseBankEntries.id, ids));

  return new Set(rows.map((r) => r.id));
}

export async function existingPhraseBankAppearanceIds(
  ids: string[],
  db: DbExecutor,
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ id: phraseBankAppearances.id })
    .from(phraseBankAppearances)
    .where(inArray(phraseBankAppearances.id, ids));

  return new Set(rows.map((r) => r.id));
}

export type MigratedPhraseInsertRow = typeof phrases.$inferInsert;
export type MigratedAttemptInsertRow = typeof attempts.$inferInsert;
export type MigratedPhraseBankEntryInsertRow = typeof phraseBankEntries.$inferInsert;
export type MigratedPhraseBankAppearanceInsertRow = typeof phraseBankAppearances.$inferInsert;

export async function insertMigratedPhrases(
  rows: MigratedPhraseInsertRow[],
  db: DbExecutor,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await db.insert(phrases).values(rows);
}

export async function insertMigratedAttempts(
  rows: MigratedAttemptInsertRow[],
  db: DbExecutor,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await db.insert(attempts).values(rows);
}

export async function insertMigratedPhraseBankEntries(
  rows: MigratedPhraseBankEntryInsertRow[],
  db: DbExecutor,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await db.insert(phraseBankEntries).values(rows);
}

// SCENARIO 9 — must run after every referenced phrase_bank_entries row is
// already inserted (the one real insert-order dependency in this migration).
export async function insertMigratedPhraseBankAppearances(
  rows: MigratedPhraseBankAppearanceInsertRow[],
  db: DbExecutor,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await db.insert(phraseBankAppearances).values(rows);
}
