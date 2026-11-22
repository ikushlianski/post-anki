import { and, eq, lt, sql } from "drizzle-orm";
import type { SubjectDaySkips } from "@post-anki/shared";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjectDaySkips, subjects } from "../db/schema.js";

export interface SubjectDaySkipClock {
  tz: string;
  now: Date;
}

export async function readLocalDayKey(clock: SubjectDaySkipClock, db: DbExecutor = getDb()): Promise<string> {
  const result = await db.execute<{ day_key: string }>(
    sql`select to_char(${clock.now.toISOString()}::timestamptz at time zone ${clock.tz}, 'YYYY-MM-DD') as day_key`,
  );

  return result.rows[0]!.day_key;
}

export async function listSkippedSubjects(
  clock: SubjectDaySkipClock,
  db: DbExecutor = getDb(),
): Promise<SubjectDaySkips> {
  const dayKey = await readLocalDayKey(clock, db);
  const [skipped, rows] = await Promise.all([
    db.select({ subjectId: subjectDaySkips.subjectId }).from(subjectDaySkips).where(eq(subjectDaySkips.dayKey, dayKey)),
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
  ]);
  const ids = new Set<string>();

  for (const { subjectId } of skipped) {
    for (const id of collectSubjectSubtreeIds(subjectId, rows)) {
      ids.add(id);
    }
  }

  return { dayKey, subjectIds: [...ids].sort() };
}

export async function subjectExists(subjectId: string, db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId));

  return row !== undefined;
}

export async function skipSubjectForDay(
  subjectId: string,
  clock: SubjectDaySkipClock,
  db: DbExecutor = getDb(),
): Promise<void> {
  const dayKey = await readLocalDayKey(clock, db);

  await db.insert(subjectDaySkips).values({ subjectId, dayKey }).onConflictDoNothing();
  await db.delete(subjectDaySkips).where(lt(subjectDaySkips.dayKey, sql`(${dayKey}::date - 1)`));
}

export async function unskipSubjectForDay(
  subjectId: string,
  clock: SubjectDaySkipClock,
  db: DbExecutor = getDb(),
): Promise<void> {
  const dayKey = await readLocalDayKey(clock, db);

  await db
    .delete(subjectDaySkips)
    .where(and(eq(subjectDaySkips.subjectId, subjectId), eq(subjectDaySkips.dayKey, dayKey)));
}
