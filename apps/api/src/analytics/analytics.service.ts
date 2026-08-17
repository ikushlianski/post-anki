import type { CoverageReport, RetentionReport, WeeklyDigest } from "@post-anki/shared";
import {
  aggregateRetentionRate,
  aggregateTimeToMastery,
  buildCoverageReport,
  buildMasteryBreakdown,
  buildWeeklyDigest,
  deriveGapTimeToMastery,
  deriveRetentionRate,
  summarizeConcerns,
} from "@post-anki/core";
import {
  getCoverageInputs,
  listAnsweredProbeSessionQuestionsForGaps,
  listGapMasteryTimings,
  listGapTopicLinks,
  listMasteredAtByGapId,
  listTopicAreaLinks,
} from "./analytics.repo.js";
import { listGapsForConfirmedCurricula } from "../gap/gap.repo.js";
import { getStreak } from "../streak/streak.service.js";

const WEEKLY_DIGEST_WINDOW_DAYS = 7;
const OVERALL_KEY = "overall";

function windowStart(now: Date, windowDays: number): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
}

export async function getCoverageReport(): Promise<CoverageReport> {
  const inputs = await getCoverageInputs();

  return buildCoverageReport(inputs.areaNodes, inputs.nodes, inputs.curriculumTopics);
}

export async function getRetentionReport(since?: Date): Promise<RetentionReport> {
  const [timingRows, masteredAtByGapId, answerRows, gapTopics, topicAreas] = await Promise.all([
    listGapMasteryTimings(since),
    listMasteredAtByGapId(),
    listAnsweredProbeSessionQuestionsForGaps(since),
    listGapTopicLinks(),
    listTopicAreaLinks(),
  ]);

  const gapDurations = deriveGapTimeToMastery(timingRows);
  const gapRetentions = deriveRetentionRate(
    answerRows.map((row) => ({ gapId: row.gapId, answeredAt: row.answeredAt, outcome: row.outcome })),
    masteredAtByGapId,
  );

  const overallTimeToMastery = aggregateTimeToMastery(
    gapDurations.map((duration) => ({ key: OVERALL_KEY, hours: duration.hours })),
    [OVERALL_KEY],
  ).get(OVERALL_KEY) ?? null;

  const overallRetention = aggregateRetentionRate(
    gapRetentions.map((retention) => ({ key: OVERALL_KEY, rate: retention.rate })),
    [OVERALL_KEY],
  ).get(OVERALL_KEY) ?? null;

  const breakdown = buildMasteryBreakdown({
    gapDurations,
    gapRetentions,
    gapTopics,
    topicAreas,
  });

  return {
    overall: overallRetention,
    timeToMasteryOverall: overallTimeToMastery,
    byTopic: breakdown.byTopic,
    byArea: breakdown.byArea,
  };
}

export async function getWeeklyDigest(now: Date = new Date()): Promise<WeeklyDigest> {
  const since = windowStart(now, WEEKLY_DIGEST_WINDOW_DAYS);

  const [retentionReport, coverage, gapsForConcerns, streak] = await Promise.all([
    getRetentionReport(since),
    getCoverageReport(),
    listGapsForConfirmedCurricula(),
    getStreak(),
  ]);

  return buildWeeklyDigest({
    windowDays: WEEKLY_DIGEST_WINDOW_DAYS,
    timeToMastery: retentionReport.timeToMasteryOverall,
    retention: retentionReport.overall,
    coverage,
    concerns: summarizeConcerns(gapsForConcerns),
    streak,
  });
}
