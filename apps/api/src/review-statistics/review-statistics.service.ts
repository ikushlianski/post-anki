import type { ReviewStatistics, ReviewStatisticsQuery } from "@post-anki/shared";
import { readDueForecast, readLocalToday } from "./review-statistics-forecast.repo.js";
import { readReviewHistory } from "./review-statistics-history.repo.js";
import { resolveSubjectScope } from "./review-statistics-subject-scope.js";

const DAILY_GRANULARITY_MAX_DAYS = 90;

export function pickGranularity(historyDays: number): "day" | "week" {
  return historyDays === 0 || historyDays > DAILY_GRANULARITY_MAX_DAYS ? "week" : "day";
}

export function addLocalDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);

  moment.setUTCDate(moment.getUTCDate() + days);

  return moment.toISOString().slice(0, 10);
}

export function emptyReviewStatistics(query: ReviewStatisticsQuery, today: string): ReviewStatistics {
  return {
    forecast: {
      overdue: 0,
      days: Array.from({ length: query.forecastDays }, (_, offset) => ({ date: addLocalDays(today, offset), count: 0 })),
    },
    retention: { granularity: pickGranularity(query.historyDays), overallRate: null, points: [] },
    answerButtons: { total: 0, counts: { again: 0, hard: 0, good: 0, easy: 0 } },
    range: { earliestReviewDate: null },
  };
}

function rateOf(passed: number, total: number): number | null {
  return total === 0 ? null : passed / total;
}

export async function getReviewStatistics(
  query: ReviewStatisticsQuery,
  now: Date = new Date(),
): Promise<ReviewStatistics> {
  const scope = await resolveSubjectScope(query.subjectId);
  const granularity = pickGranularity(query.historyDays);

  if (scope.empty) {
    return emptyReviewStatistics(query, await readLocalToday(query.tz, now));
  }

  const [forecast, history] = await Promise.all([
    readDueForecast({ tz: query.tz, now, horizonDays: query.forecastDays, subjectIds: scope.subjectIds }),
    readReviewHistory({
      tz: query.tz,
      now,
      historyDays: query.historyDays,
      granularity,
      subjectIds: scope.subjectIds,
    }),
  ]);

  const countByOffset = new Map(forecast.dayCounts.map((row) => [row.offset, row.count]));
  const byGrade = new Map(history.gradeCounts.map((row) => [row.grade, row.count]));
  const counts = {
    again: byGrade.get("again") ?? 0,
    hard: byGrade.get("hard") ?? 0,
    good: byGrade.get("good") ?? 0,
    easy: byGrade.get("easy") ?? 0,
  };
  const retentionTotal = history.retention.reduce((sum, row) => sum + row.total, 0);
  const retentionPassed = history.retention.reduce((sum, row) => sum + row.passed, 0);

  return {
    forecast: {
      overdue: forecast.overdue,
      days: Array.from({ length: query.forecastDays }, (_, offset) => ({
        date: addLocalDays(forecast.today, offset),
        count: countByOffset.get(offset) ?? 0,
      })),
    },
    retention: {
      granularity,
      overallRate: rateOf(retentionPassed, retentionTotal),
      points: history.retention.map((row) => ({ ...row, rate: rateOf(row.passed, row.total) })),
    },
    answerButtons: { total: counts.again + counts.hard + counts.good + counts.easy, counts },
    range: { earliestReviewDate: history.earliestReviewDate },
  };
}
