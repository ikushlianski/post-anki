import { collectSubjectSubtreeIds } from "@post-anki/core";
import {
  currentPeriodKey,
  isPeriodKeyReal,
  periodLocalRange,
  type CreateSubjectPriorityInput,
  ListSubjectPrioritiesQuery,
  PriorityPeriodKind,
  SubjectPriority,
  SubjectPriorityList,
  UpdateSubjectPriorityInput,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import {
  countReviewsBySubject,
  countSourcesBySubject,
  getRangeWindow,
} from "./study-goal-activity.repo.js";
import {
  EMPTY_PROGRESS,
  currentForMetric,
  isTargetMet,
  mergeActivity,
  rollUpProgress,
  type DirectActivity,
  type SubjectNode,
} from "./study-goal-progress.js";
import {
  deletePriority,
  getPriority,
  insertPriority,
  listPrioritiesForPeriod,
  listPrioritiesForSubjects,
  subjectExists,
  updatePriority,
  type SubjectPriorityRow,
} from "./subject-priority.repo.js";

export type PriorityMutation =
  | { ok: true; priority: SubjectPriority }
  | { ok: false; error: "subject_not_found" | "priority_not_found" | "invalid_period_key" };

async function activityFor(
  row: SubjectPriorityRow,
  tz: string,
  cache: Map<string, Map<string, DirectActivity>>,
): Promise<Map<string, DirectActivity>> {
  const cacheKey = `${row.periodKind}:${row.periodKey}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const window = await getRangeWindow(tz, periodLocalRange(row.periodKind, row.periodKey));
  const [reviews, notes] = await Promise.all([countReviewsBySubject(window), countSourcesBySubject(window)]);
  const merged = mergeActivity(reviews, notes);

  cache.set(cacheKey, merged);

  return merged;
}

async function withProgress(
  rows: SubjectPriorityRow[],
  subjectRows: SubjectNode[],
  tz: string,
): Promise<SubjectPriority[]> {
  const cache = new Map<string, Map<string, DirectActivity>>();
  const result: SubjectPriority[] = [];

  for (const row of rows) {
    const direct = await activityFor(row, tz, cache);
    const progress = subjectRows.some((subject) => subject.id === row.subjectId)
      ? rollUpProgress(row.subjectId, subjectRows, direct)
      : EMPTY_PROGRESS;
    const current = currentForMetric(row.targetMetric, progress);

    result.push({
      ...row,
      doneAt: row.doneAt ? row.doneAt.toISOString() : null,
      progress,
      current,
      targetMet: isTargetMet(current, row.targetValue, row.doneAt),
    });
  }

  return result;
}

async function readSubjectNodes(): Promise<SubjectNode[]> {
  return getDb().select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects);
}

export async function listSubjectPriorities(
  subjectId: string,
  query: ListSubjectPrioritiesQuery,
): Promise<SubjectPriorityList | null> {
  if (!(await subjectExists(subjectId))) {
    return null;
  }

  const subjectRows = await readSubjectNodes();
  const ids = query.includeDescendants ? collectSubjectSubtreeIds(subjectId, subjectRows) : [subjectId];
  const rows = await listPrioritiesForSubjects(ids, query.period);

  return { priorities: await withProgress(rows, subjectRows, query.tz) };
}

export async function listCurrentPriorities(
  period: PriorityPeriodKind,
  tz: string,
  now: Date,
): Promise<SubjectPriorityList> {
  const rows = await listPrioritiesForPeriod(period, currentPeriodKey(period, now, tz));

  return { priorities: await withProgress(rows, await readSubjectNodes(), tz) };
}

export async function createSubjectPriority(
  subjectId: string,
  input: CreateSubjectPriorityInput,
  tz: string,
): Promise<PriorityMutation> {
  if (!isPeriodKeyReal(input.periodKind, input.periodKey)) {
    return { ok: false, error: "invalid_period_key" };
  }

  if (!(await subjectExists(subjectId))) {
    return { ok: false, error: "subject_not_found" };
  }

  const row = await insertPriority(subjectId, input);
  const [priority] = await withProgress([row], await readSubjectNodes(), tz);

  return { ok: true, priority: priority! };
}

export async function updateSubjectPriority(
  id: string,
  patch: UpdateSubjectPriorityInput,
  tz: string,
): Promise<PriorityMutation> {
  const current = await getPriority(id);

  if (!current) {
    return { ok: false, error: "priority_not_found" };
  }

  const row = await updatePriority(id, patch, current, new Date());
  const [priority] = await withProgress([row], await readSubjectNodes(), tz);

  return { ok: true, priority: priority! };
}

export async function removeSubjectPriority(id: string): Promise<boolean> {
  return deletePriority(id);
}
