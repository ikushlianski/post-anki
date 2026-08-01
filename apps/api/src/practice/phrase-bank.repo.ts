import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PhraseBankStatus } from "@post-anki/shared";
import { selectDuePhrases, matchExistingPhraseBankEntry, type PhraseBankEntryState } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { phraseBankAppearances, phraseBankEntries, phrases } from "../db/schema.js";

export type PhraseBankEntrySelectRow = typeof phraseBankEntries.$inferSelect;
export type PhraseBankEntryInsertRow = typeof phraseBankEntries.$inferInsert;
export type PhraseBankAppearanceInsertRow = typeof phraseBankAppearances.$inferInsert;

export interface DuePhraseBankEntry extends PhraseBankEntryState {
  id: string;
  phraseText: string;
  category: string | null;
}

export function toEntryState(row: PhraseBankEntrySelectRow): DuePhraseBankEntry {
  return {
    id: row.id,
    phraseText: row.phraseText,
    category: row.category,
    status: row.status as PhraseBankStatus,
    masteryStage: row.masteryStage,
    correctCountInCycle: row.correctCountInCycle,
    incorrectCountInCycle: row.incorrectCountInCycle,
    lastCorrectAtSentenceCount: row.lastCorrectAtSentenceCount,
    scheduledForSentenceCount: row.scheduledForSentenceCount,
  };
}

function scopeFilter(subjectId: string, level: string, pack: string) {
  return and(
    eq(phraseBankEntries.subjectId, subjectId),
    eq(phraseBankEntries.level, level),
    eq(phraseBankEntries.pack, pack),
  );
}

// The single lock both phrase-bank write paths take as their transaction's
// first statement, so neither can be part-way through acquiring the scope's
// phrase_bank_entries rows when the other starts. Generation locks those rows
// implicitly — the phrases -> phrase_bank_entries FK makes every insert take
// FOR KEY SHARE on the referenced row, in the model's generation order —
// while grading locks them explicitly with FOR UPDATE in id order. Those two
// orders can disagree, and FOR KEY SHARE conflicts with FOR UPDATE, so
// without this shared outer lock a concurrent generate+grade over the same
// recycled entries can deadlock (40P01). Keyed identically on both paths;
// keep the key formula here only, never inlined at a call site.
export async function lockPhraseBankScope(
  subjectId: string,
  level: string,
  pack: string,
  db: DbExecutor,
): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${subjectId} || ${level} || ${pack})::bigint)`,
  );
}

export async function dueEntriesForScope(
  subjectId: string,
  level: string,
  pack: string,
  currentSequenceNumber: number,
  maxDue: number,
): Promise<DuePhraseBankEntry[]> {
  const rows = await getDb()
    .select()
    .from(phraseBankEntries)
    .where(scopeFilter(subjectId, level, pack));

  return selectDuePhrases(rows.map(toEntryState), currentSequenceNumber, maxDue);
}

export async function matchExistingEntryId(
  subjectId: string,
  level: string,
  pack: string,
  phraseText: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const rows = await db
    .select({
      id: phraseBankEntries.id,
      phraseText: phraseBankEntries.phraseText,
      status: phraseBankEntries.status,
    })
    .from(phraseBankEntries)
    .where(scopeFilter(subjectId, level, pack));

  return matchExistingPhraseBankEntry(
    rows.map((row) => ({ id: row.id, phraseText: row.phraseText, status: row.status as PhraseBankStatus })),
    phraseText,
  );
}

export async function nextSequenceBase(
  subjectId: string,
  level: string,
  pack: string,
  db: DbExecutor = getDb(),
): Promise<number> {
  const result = await db
    .select({ max: sql<number | null>`max(${phrases.sequenceNumber})` })
    .from(phrases)
    .where(and(eq(phrases.subjectId, subjectId), eq(phrases.level, level), eq(phrases.pack, pack)));

  return result[0]?.max ?? 0;
}

export async function createPhraseBankEntry(
  row: {
    id: string;
    subjectId: string;
    level: string;
    pack: string;
    phraseText: string;
    category: string | null;
  },
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.insert(phraseBankEntries).values({ ...row, status: "new" });
}

export async function getPhraseBankEntriesByIds(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<PhraseBankEntrySelectRow[]> {
  if (ids.length === 0) {
    return [];
  }

  return db.select().from(phraseBankEntries).where(inArray(phraseBankEntries.id, ids));
}

// SELECT ... FOR UPDATE, rows locked in id order — a second, concurrent
// grading call touching the same entry/entries blocks on this read until the
// first transaction commits, closing the lost-mastery-update race
// (architecture.md's "Race 3"). Ordering by id is deadlock avoidance: when
// one grading call touches more than one entry, two concurrent calls that
// both touch {A, B} always acquire them in the same order.
export async function getPhraseBankEntriesByIdsForUpdate(
  ids: string[],
  db: DbExecutor,
): Promise<PhraseBankEntrySelectRow[]> {
  if (ids.length === 0) {
    return [];
  }

  return db
    .select()
    .from(phraseBankEntries)
    .where(inArray(phraseBankEntries.id, ids))
    .orderBy(asc(phraseBankEntries.id))
    .for("update");
}

export async function updatePhraseBankEntryAfterAttempt(
  id: string,
  next: PhraseBankEntryState,
  options: { correct: boolean; justMastered: boolean },
  db: DbExecutor = getDb(),
): Promise<void> {
  const now = new Date();

  const patch: Partial<PhraseBankEntryInsertRow> = {
    status: next.status,
    masteryStage: next.masteryStage,
    correctCountInCycle: next.correctCountInCycle,
    incorrectCountInCycle: next.incorrectCountInCycle,
    lastCorrectAtSentenceCount: next.lastCorrectAtSentenceCount,
    scheduledForSentenceCount: next.scheduledForSentenceCount,
    updatedAt: now,
  };

  if (options.correct) {
    patch.lastCorrectDate = now;
  }

  if (options.justMastered) {
    patch.masteredAt = now;
  }

  await db.update(phraseBankEntries).set(patch).where(eq(phraseBankEntries.id, id));
}

export async function insertPhraseBankAppearance(
  row: PhraseBankAppearanceInsertRow,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.insert(phraseBankAppearances).values(row);
}

export async function getPhraseBankSummary(
  subjectId: string,
  level: string,
  pack: string,
): Promise<{ active: PhraseBankEntrySelectRow[]; mastered: PhraseBankEntrySelectRow[] }> {
  const rows = await getDb()
    .select()
    .from(phraseBankEntries)
    .where(scopeFilter(subjectId, level, pack));

  return {
    active: rows.filter((row) => row.status !== "mastered"),
    mastered: rows.filter((row) => row.status === "mastered"),
  };
}
