import { eq, max } from "drizzle-orm";
import type { CourseRefocusReason, CourseRefocusSuggestion } from "@post-anki/shared";
import {
  computeCourseRefocusCandidatesForSubject,
  isRefocusSuppressedByDismissal,
  type CourseRefocusSignal,
} from "@post-anki/core";
import { getDb } from "../db/client.js";
import {
  courseRefocusDismissals,
  curricula,
  phraseBankEntries,
  subjects,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

interface SubjectCurriculumRow {
  subjectId: string;
  subjectName: string;
  subjectKind: string;
  curriculumId: string;
  curriculumName: string;
  order: number;
  createdAt: Date;
  learningStatus: string;
}

function maxIso(...values: (Date | null | undefined)[]): string | null {
  let latest: string | null = null;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const iso = value.toISOString();

    if (!latest || iso > latest) {
      latest = iso;
    }
  }

  return latest;
}

// SCENARIO 10 — a small, fixed number of reads regardless of subject/course
// count: one query for all subjects/curricula (joined), one aggregate query
// for last-studied-at per curriculum (topics), one aggregate query for
// last-activity-at per language-practice subject (phrase bank — feeds the
// global gate only, Scenario 14), and one for active dismissals. Never N+1
// across subjects or courses, and no LLM/agent call anywhere in this path.
export async function listCourseRefocusSuggestions(): Promise<CourseRefocusSuggestion[]> {
  const db = getDb();
  const now = new Date();

  const subjectCurriculumRows: SubjectCurriculumRow[] = await db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      subjectKind: subjects.kind,
      curriculumId: curricula.id,
      curriculumName: curricula.name,
      order: curricula.order,
      createdAt: curricula.createdAt,
      learningStatus: curricula.learningStatus,
    })
    .from(subjects)
    .innerJoin(curricula, eq(curricula.subjectId, subjects.id));

  if (subjectCurriculumRows.length === 0) {
    return [];
  }

  const topicActivityRows = await db
    .select({
      curriculumId: topics.curriculumId,
      lastInteractedAt: max(topics.progressLastInteractedAt),
    })
    .from(topics)
    .groupBy(topics.curriculumId);

  const lastStudiedByCurriculum = new Map<string, string | null>();

  for (const row of topicActivityRows) {
    lastStudiedByCurriculum.set(row.curriculumId, maxIso(row.lastInteractedAt));
  }

  const phraseBankActivityRows = await db
    .select({
      subjectId: phraseBankEntries.subjectId,
      lastCorrectDate: max(phraseBankEntries.lastCorrectDate),
      lastUpdatedAt: max(phraseBankEntries.updatedAt),
    })
    .from(phraseBankEntries)
    .groupBy(phraseBankEntries.subjectId);

  const dismissalRows = await db.select().from(courseRefocusDismissals);
  const dismissedAtByKey = new Map<string, string>();

  for (const row of dismissalRows) {
    dismissedAtByKey.set(`${row.curriculumId}:${row.reason}`, row.dismissedAt.toISOString());
  }

  // The "learner is still active anywhere" gate unions BOTH activity models
  // (Scenario 14) — architecture-mentor study (topics) and language-practice
  // drilling (phrase bank), across every subject, not just one.
  let mostRecentActivityAnywhere: string | null = null;

  for (const iso of lastStudiedByCurriculum.values()) {
    if (iso && (!mostRecentActivityAnywhere || iso > mostRecentActivityAnywhere)) {
      mostRecentActivityAnywhere = iso;
    }
  }

  for (const row of phraseBankActivityRows) {
    const iso = maxIso(row.lastCorrectDate, row.lastUpdatedAt);

    if (iso && (!mostRecentActivityAnywhere || iso > mostRecentActivityAnywhere)) {
      mostRecentActivityAnywhere = iso;
    }
  }

  // SCENARIO 7 — language-practice subjects are excluded from candidate
  // generation entirely (deny-list on the one kind known not to use
  // `curricula.order`, not an allow-list — a future third `kind` defaults to
  // included).
  const rowsBySubject = new Map<string, SubjectCurriculumRow[]>();

  for (const row of subjectCurriculumRows) {
    if (row.subjectKind === "language-practice") {
      continue;
    }

    const list = rowsBySubject.get(row.subjectId) ?? [];

    list.push(row);
    rowsBySubject.set(row.subjectId, list);
  }

  const suggestions: CourseRefocusSuggestion[] = [];

  for (const [subjectId, rows] of rowsBySubject) {
    const signals: CourseRefocusSignal[] = rows.map((r) => ({
      id: r.curriculumId,
      order: r.order,
      createdAt: r.createdAt.toISOString(),
      lastStudiedAt: lastStudiedByCurriculum.get(r.curriculumId) ?? null,
      learningStatus: r.learningStatus as CourseRefocusSignal["learningStatus"],
    }));

    const candidates = computeCourseRefocusCandidatesForSubject(
      signals,
      now,
      mostRecentActivityAnywhere,
    );

    for (const candidate of candidates) {
      const dismissedAt =
        dismissedAtByKey.get(`${candidate.curriculumId}:${candidate.reason}`) ?? null;

      if (isRefocusSuppressedByDismissal(dismissedAt, now)) {
        continue;
      }

      const row = rows.find((r) => r.curriculumId === candidate.curriculumId);

      if (!row) {
        continue;
      }

      suggestions.push({
        curriculumId: candidate.curriculumId,
        subjectId,
        curriculumName: row.curriculumName,
        subjectName: row.subjectName,
        reason: candidate.reason,
        daysSinceActivity: candidate.daysSinceActivity,
      });
    }
  }

  return suggestions;
}

// SCENARIO 11 — upsert on (curriculum_id, reason), a compound
// onConflictDoUpdate target (this codebase's first — existing single-column
// upserts are streak.repo.ts/lecture.repo.ts/domain-map.repo.ts). Dismissing
// the same pair twice never creates a second row; the second call just
// refreshes `dismissedAt`, resetting the cooldown clock.
export async function dismissCourseRefocusSuggestion(
  curriculumId: string,
  reason: CourseRefocusReason,
): Promise<void> {
  const dismissedAt = new Date();

  await getDb()
    .insert(courseRefocusDismissals)
    .values({ id: newId("crd"), curriculumId, reason, dismissedAt })
    .onConflictDoUpdate({
      target: [courseRefocusDismissals.curriculumId, courseRefocusDismissals.reason],
      set: { dismissedAt },
    });
}
