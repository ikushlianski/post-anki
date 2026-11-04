import { masteryPercent, retentionPercent, addDays } from "@post-anki/core";
import {
  currentPeriodKey,
  periodLocalRange,
  type ProgressView,
  type SubjectMastery,
} from "@post-anki/shared";
import { countReviewsBySubject, getRangeWindow } from "../study-goal/study-goal-activity.repo.js";
import {
  countSolidByLocalWeek,
  readOlderCardRetention,
  reviewCountsByLocalDay,
} from "./motivation-activity.repo.js";
import { countSolidBySubject, readSubjectCardTotals } from "./motivation-mastery.repo.js";
import { readMotivationSettings } from "./motivation-settings.repo.js";
import { localDateString } from "./motivation-time.js";

const WEEKS_SHOWN = 12;
const RETENTION_DAYS = 90;

function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index - (count - 1)));
}

export async function readProgressView(now: Date, days: number): Promise<ProgressView> {
  const { timeZone: tz } = await readMotivationSettings();
  const today = localDateString(now, tz);
  const week = periodLocalRange("week", currentPeriodKey("week", now, tz));
  const month = periodLocalRange("month", currentPeriodKey("month", now, tz));
  const lastWeek = { start: addDays(week.start, -7), end: week.start };
  const firstWeek = addDays(week.start, -7 * (WEEKS_SHOWN - 1));
  const [counts, solidWeeks, retention, totals, solidWeek, solidMonth, reviewsWeek, reviewsLastWeek] =
    await Promise.all([
      reviewCountsByLocalDay(tz, { start: addDays(today, -(days - 1)), end: addDays(today, 1) }),
      getRangeWindow(tz, { start: firstWeek, end: week.end }).then((window) => countSolidByLocalWeek(tz, window)),
      getRangeWindow(tz, { start: addDays(today, -RETENTION_DAYS), end: addDays(today, 1) }).then(readOlderCardRetention),
      readSubjectCardTotals(),
      getRangeWindow(tz, week).then(countSolidBySubject),
      getRangeWindow(tz, month).then(countSolidBySubject),
      getRangeWindow(tz, week).then(countReviewsBySubject),
      getRangeWindow(tz, lastWeek).then(countReviewsBySubject),
    ]);
  const heatmap = lastDays(today, days).map((date) => ({ date, reviews: counts.get(date) ?? 0 }));
  const activeDays = heatmap.filter((day) => day.reviews > 0).length;
  const totalReviews = heatmap.reduce((sum, day) => sum + day.reviews, 0);
  const solidByWeek = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const weekStart = addDays(firstWeek, index * 7);

    return { weekStart, solid: solidWeeks.get(weekStart) ?? 0 };
  });
  const subjects: SubjectMastery[] = totals.map((subject) => ({
    ...subject,
    percent: masteryPercent(subject.masteredCards, subject.totalCards),
    solidThisWeek: solidWeek.get(subject.subjectId) ?? 0,
    solidThisMonth: solidMonth.get(subject.subjectId) ?? 0,
    reviewsThisWeek: reviewsWeek.get(subject.subjectId)?.reviews ?? 0,
    reviewsLastWeek: reviewsLastWeek.get(subject.subjectId)?.reviews ?? 0,
  }));

  return {
    heatmap,
    dailyAverage: activeDays === 0 ? 0 : Math.round((totalReviews / activeDays) * 10) / 10,
    solidByWeek,
    solidThisWeek: solidByWeek[solidByWeek.length - 1]?.solid ?? 0,
    retentionOlderCards: retentionPercent(retention.recalled, retention.total),
    retentionSample: retention.total,
    subjects,
  };
}
