import { and, eq, inArray, sql } from "drizzle-orm";
import type { PhraseBankStatus } from "@post-anki/shared";
import { selectDuePhrases, matchExistingPhraseBankEntry, type PhraseBankEntryState } from "@post-anki/core";
import { getDb } from "../db/client.js";
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
): Promise<string | null> {
  const rows = await getDb()
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
): Promise<number> {
  const result = await getDb()
    .select({ max: sql<number | null>`max(${phrases.sequenceNumber})` })
    .from(phrases)
    .where(and(eq(phrases.subjectId, subjectId), eq(phrases.level, level), eq(phrases.pack, pack)));

  return result[0]?.max ?? 0;
}

export async function createPhraseBankEntry(row: {
  id: string;
  subjectId: string;
  level: string;
  pack: string;
  phraseText: string;
  category: string | null;
}): Promise<void> {
  await getDb()
    .insert(phraseBankEntries)
    .values({ ...row, status: "new" });
}

export async function getPhraseBankEntriesByIds(ids: string[]): Promise<PhraseBankEntrySelectRow[]> {
  if (ids.length === 0) {
    return [];
  }

  return getDb().select().from(phraseBankEntries).where(inArray(phraseBankEntries.id, ids));
}

export async function updatePhraseBankEntryAfterAttempt(
  id: string,
  next: PhraseBankEntryState,
  options: { correct: boolean; justMastered: boolean },
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

  await getDb().update(phraseBankEntries).set(patch).where(eq(phraseBankEntries.id, id));
}

export async function insertPhraseBankAppearance(row: PhraseBankAppearanceInsertRow): Promise<void> {
  await getDb().insert(phraseBankAppearances).values(row);
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
