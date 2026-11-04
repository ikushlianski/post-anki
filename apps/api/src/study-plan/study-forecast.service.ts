import {
  deriveStudyForecast,
  type ResolvedStudyPlan,
  type StudyForecastStream,
} from "@post-anki/core";
import type { StudyForecast } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { countNewCardsReviewedTodayBySubject, getLocalDayWindow } from "../knowledge-bit/knowledge-bit-review.repo.js";
import { readReviewHistory } from "../review-statistics/review-statistics-history.repo.js";
import { resolveSubjectScope } from "../review-statistics/review-statistics-subject-scope.js";
import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readPlanDayCounts, type PlanDayCounts } from "./study-plan-day.repo.js";
import { readForecastCardRows, type ForecastCardRow } from "./study-forecast.repo.js";
import { formatLocalDate, readStudyPlanClock } from "./study-plan-today.js";
import { windowForPlan } from "./study-plan-window.js";

const LONG_TERM_HORIZON_DAYS = 30;
const EXAM_MAX_HORIZON_DAYS = 90;
const RECENT_RETENTION_DAYS = 30;

function buildStreams(
  rows: ForecastCardRow[],
  counts: Map<string | null, PlanDayCounts>,
  used: Map<string | null, number>,
  subjectIds: string[],
  planOf: (subjectId: string | null) => ResolvedStudyPlan,
  localize: (iso: string) => string,
): StudyForecastStream[] {
  const ids = new Set<string | null>([
    ...subjectIds.filter((id) => (counts.get(id)?.fresh ?? 0) > 0),
    ...rows.map((row) => row.subjectId),
  ]);

  return [...ids].map((subjectId) => {
    const plan = planOf(subjectId);

    return {
      scheduled: rows.filter((row) => row.subjectId === subjectId),
      newRemaining: counts.get(subjectId)?.fresh ?? 0,
      newUsedToday: used.get(subjectId) ?? 0,
      waitingNow: counts.get(subjectId)?.waiting ?? 0,
      intent: plan.intent,
      examDate: plan.examDate,
      plannedOn: plan.plannedAt ? localize(plan.plannedAt) : null,
      explicitPerDay: plan.explicitPerDay,
      fallbackPerDay: plan.options.effective.newCardsPerDay,
      retention: plan.desiredRetention,
    };
  });
}

export async function getStudyForecast(
  subjectId: string,
  requestedTz: string | undefined,
  now: Date = new Date(),
): Promise<StudyForecast | null> {
  const db = getDb();
  const scope = await resolveSubjectScope(subjectId, db);

  if (scope.empty || !scope.subjectIds) {
    return null;
  }

  const subjectIds = scope.subjectIds;
  const configured = await readStudyPlanClock(now, db);
  const tz = requestedTz ?? configured.timeZone;
  const clock = { today: formatLocalDate(now, tz), timeZone: tz };
  const resolver = await loadStudyOptionsResolver(db);
  const plan = resolver.resolvePlan(subjectId);
  const window = windowForPlan(plan, clock);
  const horizonDays =
    window.mode === "exam"
      ? Math.max(1, Math.min(window.daysLeft ?? LONG_TERM_HORIZON_DAYS, EXAM_MAX_HORIZON_DAYS))
      : LONG_TERM_HORIZON_DAYS;
  const { startsAt } = await getLocalDayWindow(tz, now, db);
  const [rows, counts, used, history] = await Promise.all([
    readForecastCardRows({ tz, now, horizonDays, subjectIds }, db),
    readPlanDayCounts(now, db),
    countNewCardsReviewedTodayBySubject(startsAt, db),
    readReviewHistory(
      { tz, now, historyDays: RECENT_RETENTION_DAYS, granularity: "day", subjectIds },
      db,
    ),
  ]);
  const streams = buildStreams(
    rows,
    counts,
    used,
    subjectIds,
    (id) => resolver.resolvePlan(id),
    (iso) => formatLocalDate(new Date(iso), tz),
  );
  const forecast = deriveStudyForecast({ streams, horizonDays, today: clock.today });
  const total = history.retention.reduce((sum, row) => sum + row.total, 0);
  const passed = history.retention.reduce((sum, row) => sum + row.passed, 0);

  return {
    intent: plan.intent,
    examDate: plan.examDate,
    daysLeft: window.daysLeft === null ? null : Math.max(0, window.daysLeft),
    examPassed: window.examPassed,
    desiredRetention: plan.desiredRetention,
    recentRetention: total === 0 ? null : passed / total,
    maxIntervalDays: window.maxIntervalDays,
    hasCards: rows.length > 0 || forecast.newRemaining > 0,
    newCards: {
      perDay: forecast.todayPace.perDay,
      paced: forecast.todayPace.paced,
      pausedToday: forecast.todayPace.paused,
      pauseThreshold: forecast.todayPace.threshold,
      remaining: forecast.newRemaining,
      finishOn: forecast.newFinishOn,
      finishesBeforeExam: forecast.finishesBeforeExam,
    },
    reviews: {
      dueToday: rows.filter((row) => row.dueOffset <= 0).length,
      averagePerDay: Math.round(forecast.averagePerDay * 10) / 10,
      peakPerDay: forecast.peakPerDay,
      peakOn: forecast.peakOn,
      horizonDays,
    },
    days: forecast.days,
  };
}
