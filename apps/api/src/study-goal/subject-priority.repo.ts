import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CreateSubjectPriorityInput,
  PriorityPeriodKind,
  PriorityTargetMetric,
  UpdateSubjectPriorityInput,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjectPriorities, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface SubjectPriorityRow {
  id: string;
  subjectId: string;
  periodKind: PriorityPeriodKind;
  periodKey: string;
  title: string;
  targetMetric: PriorityTargetMetric;
  targetValue: number | null;
  doneAt: Date | null;
}

const columns = {
  id: subjectPriorities.id,
  subjectId: subjectPriorities.subjectId,
  periodKind: subjectPriorities.periodKind,
  periodKey: subjectPriorities.periodKey,
  title: subjectPriorities.title,
  targetMetric: subjectPriorities.targetMetric,
  targetValue: subjectPriorities.targetValue,
  doneAt: subjectPriorities.doneAt,
};

export async function subjectExists(subjectId: string, db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId));

  return Boolean(row);
}

export async function listPrioritiesForSubjects(
  subjectIds: string[],
  period: PriorityPeriodKind | undefined,
  db: DbExecutor = getDb(),
): Promise<SubjectPriorityRow[]> {
  if (subjectIds.length === 0) {
    return [];
  }

  const rows = await db
    .select(columns)
    .from(subjectPriorities)
    .where(
      and(
        inArray(subjectPriorities.subjectId, subjectIds),
        period ? eq(subjectPriorities.periodKind, period) : undefined,
      ),
    )
    .orderBy(asc(subjectPriorities.periodKey), asc(subjectPriorities.createdAt));

  return rows as SubjectPriorityRow[];
}

export async function listPrioritiesForPeriod(
  period: PriorityPeriodKind,
  periodKey: string,
  db: DbExecutor = getDb(),
): Promise<SubjectPriorityRow[]> {
  const rows = await db
    .select(columns)
    .from(subjectPriorities)
    .where(and(eq(subjectPriorities.periodKind, period), eq(subjectPriorities.periodKey, periodKey)))
    .orderBy(asc(subjectPriorities.createdAt));

  return rows as SubjectPriorityRow[];
}

export async function insertPriority(
  subjectId: string,
  input: CreateSubjectPriorityInput,
  db: DbExecutor = getDb(),
): Promise<SubjectPriorityRow> {
  const [row] = await db
    .insert(subjectPriorities)
    .values({
      id: newId("priority"),
      subjectId,
      periodKind: input.periodKind,
      periodKey: input.periodKey,
      title: input.title,
      targetMetric: input.targetMetric,
      targetValue: input.targetMetric === "none" ? null : input.targetValue,
    })
    .returning(columns);

  return row as SubjectPriorityRow;
}

export async function getPriority(id: string, db: DbExecutor = getDb()): Promise<SubjectPriorityRow | null> {
  const [row] = await db.select(columns).from(subjectPriorities).where(eq(subjectPriorities.id, id));

  return (row as SubjectPriorityRow | undefined) ?? null;
}

export async function updatePriority(
  id: string,
  patch: UpdateSubjectPriorityInput,
  current: SubjectPriorityRow,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<SubjectPriorityRow> {
  const targetMetric = patch.targetMetric ?? current.targetMetric;
  const targetValue =
    targetMetric === "none" ? null : patch.targetValue !== undefined ? patch.targetValue : current.targetValue;
  const doneAt = patch.done === undefined ? current.doneAt : patch.done ? (current.doneAt ?? now) : null;

  const [row] = await db
    .update(subjectPriorities)
    .set({ title: patch.title ?? current.title, targetMetric, targetValue, doneAt, updatedAt: now })
    .where(eq(subjectPriorities.id, id))
    .returning(columns);

  return row as SubjectPriorityRow;
}

export async function deletePriority(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const rows = await db.delete(subjectPriorities).where(eq(subjectPriorities.id, id)).returning({ id: subjectPriorities.id });

  return rows.length > 0;
}
