import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  attempts,
  curricula,
  courseRefocusDismissals,
  phraseBankAppearances,
  subjects,
  topics,
} from "../db/schema.js";
import {
  computeCourseRefocusCandidatesForSubject,
  isRefocusSuppressedByDismissal,
  STALE_DAYS,
  RECENT_DAYS,
  ACTIVE_WINDOW_DAYS,
} from "@post-anki/core";
import type { CourseRefocusSuggestion } from "@post-anki/shared";

interface CourseData {
  id: string;
  name: string;
  order: number;
  learningStatus: string;
  createdAt: Date;
  lastStudiedAt: Date | null;
}

interface SubjectCoursesData {
  subjectId: string;
  subjectName: string;
  courses: CourseData[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

async function listActivityDaysAnywhere(windowStart: Date): Promise<Date[]> {
  const db = getDb();

  const [topicDays, attemptDays, phraseBankDays] = await Promise.all([
    db
      .select({ latest: sql<Date | string>`max(${topics.progressLastInteractedAt})` })
      .from(topics)
      .where(gte(topics.progressLastInteractedAt, windowStart))
      .groupBy(sql`date_trunc('day', ${topics.progressLastInteractedAt})`),
    db
      .select({ latest: sql<Date | string>`max(${attempts.createdAt})` })
      .from(attempts)
      .where(gte(attempts.createdAt, windowStart))
      .groupBy(sql`date_trunc('day', ${attempts.createdAt})`),
    db
      .select({ latest: sql<Date | string>`max(${phraseBankAppearances.createdAt})` })
      .from(phraseBankAppearances)
      .where(gte(phraseBankAppearances.createdAt, windowStart))
      .groupBy(sql`date_trunc('day', ${phraseBankAppearances.createdAt})`),
  ]);

  return [...topicDays, ...attemptDays, ...phraseBankDays]
    .filter((row) => row.latest !== null)
    .map((row) => toDate(row.latest));
}

export async function listCourseRefocusSuggestions(): Promise<CourseRefocusSuggestion[]> {
  const now = new Date();
  const thresholds = {
    staleDays: STALE_DAYS,
    recentDays: RECENT_DAYS,
    activeWindowDays: ACTIVE_WINDOW_DAYS,
  };

  const db = getDb();
  const rows = await db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      subjectKind: subjects.kind,
      curriculumId: curricula.id,
      curriculumName: curricula.name,
      curriculumOrder: curricula.order,
      curriculumStatus: curricula.learningStatus,
      curriculumCreatedAt: curricula.createdAt,
      topicProgressLastInteractedAt: topics.progressLastInteractedAt,
    })
    .from(subjects)
    .innerJoin(curricula, eq(curricula.subjectId, subjects.id))
    .leftJoin(topics, eq(topics.curriculumId, curricula.id))
    .orderBy(curricula.id, desc(topics.progressLastInteractedAt));

  const dismissals = await db
    .select({
      curriculumId: courseRefocusDismissals.curriculumId,
      reason: courseRefocusDismissals.reason,
      dismissedAt: courseRefocusDismissals.dismissedAt,
    })
    .from(courseRefocusDismissals);

  const dismissalMap = new Map<
    string,
    Map<string, Date>
  >();
  for (const dismissal of dismissals) {
    if (!dismissalMap.has(dismissal.curriculumId)) {
      dismissalMap.set(dismissal.curriculumId, new Map());
    }
    dismissalMap.get(dismissal.curriculumId)!.set(dismissal.reason, dismissal.dismissedAt);
  }

  const subjectGroupsMap = new Map<string, SubjectCoursesData>();
  for (const row of rows) {
    if (row.subjectKind === "language-practice") {
      continue;
    }

    if (!subjectGroupsMap.has(row.subjectId)) {
      subjectGroupsMap.set(row.subjectId, {
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        courses: [],
      });
    }

    const subjectData = subjectGroupsMap.get(row.subjectId)!;
    const courseId = row.curriculumId;
    const existingCourse = subjectData.courses.find((c) => c.id === courseId);

    if (!existingCourse) {
      subjectData.courses.push({
        id: courseId,
        name: row.curriculumName,
        order: row.curriculumOrder,
        learningStatus: row.curriculumStatus,
        createdAt: row.curriculumCreatedAt,
        lastStudiedAt: row.topicProgressLastInteractedAt,
      });
    } else if (row.topicProgressLastInteractedAt && (!existingCourse.lastStudiedAt || row.topicProgressLastInteractedAt > existingCourse.lastStudiedAt)) {
      existingCourse.lastStudiedAt = row.topicProgressLastInteractedAt;
    }
  }

  const activityWindowStart = new Date(now.getTime() - STALE_DAYS * MS_PER_DAY);
  const activityAnywhere = await listActivityDaysAnywhere(activityWindowStart);

  const suggestions: CourseRefocusSuggestion[] = [];

  for (const subjectData of subjectGroupsMap.values()) {
    const candidates = computeCourseRefocusCandidatesForSubject(
      subjectData.courses,
      now,
      activityAnywhere,
      thresholds,
    );

    for (const candidate of candidates) {
      const course = subjectData.courses.find((c) => c.id === candidate.curriculumId);
      if (!course) continue;

      const dismissedAt = dismissalMap.get(candidate.curriculumId)?.get(candidate.reason) ?? null;
      const isSupressed = isRefocusSuppressedByDismissal(dismissedAt, now, RECENT_DAYS);

      if (!isSupressed) {
        suggestions.push({
          curriculumId: candidate.curriculumId,
          subjectId: subjectData.subjectId,
          subjectName: subjectData.subjectName,
          courseName: course.name,
          reason: candidate.reason,
          dismissedAt: dismissedAt?.toISOString() ?? null,
        });
      }
    }
  }

  return suggestions;
}

export async function dismissCourseRefocusSuggestion(
  curriculumId: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(courseRefocusDismissals)
    .values({
      id: `${curriculumId}-${reason}-${Date.now()}`,
      curriculumId,
      reason,
      dismissedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [courseRefocusDismissals.curriculumId, courseRefocusDismissals.reason],
      set: {
        dismissedAt: new Date(),
      },
    });
}
