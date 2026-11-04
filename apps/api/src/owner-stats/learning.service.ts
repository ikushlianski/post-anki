import type { OwnerStatsLearning, OwnerStatsLearningQuery } from "@post-anki/shared";
import { loadEnv } from "../shared/env.js";
import { readOrCreateStreak } from "../streak/streak.repo.js";
import {
  readLearningRows,
  type LearningAccuracyRow,
  type LearningDailyRow,
  type LearningHourlyRow,
} from "./learning.repo.js";

export function localDateOf(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function addLocalDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);

  moment.setUTCDate(moment.getUTCDate() + days);

  return moment.toISOString().slice(0, 10);
}

export function fillDaily(rows: LearningDailyRow[], today: string, days: number): LearningDailyRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  return Array.from({ length: days }, (_, index) => {
    const date = addLocalDays(today, index - (days - 1));

    return byDate.get(date) ?? { date, reviews: 0, newCards: 0, passed: 0, studyMs: 0 };
  });
}

export function fillHourly(rows: LearningHourlyRow[]): LearningHourlyRow[] {
  const byHour = new Map(rows.map((row) => [row.hour, row.reviews]));

  return Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: byHour.get(hour) ?? 0 }));
}

function rateOf(passed: number, total: number): number | null {
  return total === 0 ? null : passed / total;
}

export function foldAccuracy(row: LearningAccuracyRow): OwnerStatsLearning["accuracy"] {
  return {
    overall: rateOf(row.overallPassed, row.overallTotal),
    last7: rateOf(row.last7Passed, row.last7Total),
  };
}

export async function getOwnerStatsLearning(
  query: OwnerStatsLearningQuery,
  now: Date = new Date(),
): Promise<OwnerStatsLearning> {
  const today = localDateOf(now, query.tz);

  const [rows, streak] = await Promise.all([
    readLearningRows({
      tz: query.tz,
      startDate: addLocalDays(today, -(query.days - 1)),
      last7StartDate: addLocalDays(today, -6),
    }),
    readOrCreateStreak(),
  ]);

  const daily = fillDaily(rows.daily, today, query.days);
  const todayRow = daily[daily.length - 1]!;

  return {
    env: loadEnv().NODE_ENV ?? "development",
    today: { reviews: todayRow.reviews, newCards: todayRow.newCards },
    daily,
    hourly: fillHourly(rows.hourly),
    streak: { current: streak.currentStreak, longest: streak.longestStreak },
    accuracy: foldAccuracy(rows.accuracy),
  };
}
