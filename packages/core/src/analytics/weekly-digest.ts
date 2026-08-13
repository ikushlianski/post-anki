import type { ConcernSummary, Streak } from "@post-anki/shared";
import type { TimeToMasterySummary } from "./gap-time-to-mastery";
import type { RetentionSummary } from "./retention-rate";
import type { CoverageArea } from "./coverage-report";

export interface WeeklyDigest {
  windowDays: number;
  timeToMastery: TimeToMasterySummary | null;
  retention: RetentionSummary | null;
  coverage: CoverageArea[];
  concerns: ConcernSummary[];
  streak: Streak;
}

export function buildWeeklyDigest(input: {
  windowDays: number;
  timeToMastery: TimeToMasterySummary | null;
  retention: RetentionSummary | null;
  coverage: CoverageArea[];
  concerns: ConcernSummary[];
  streak: Streak;
}): WeeklyDigest {
  return {
    windowDays: input.windowDays,
    timeToMastery: input.timeToMastery,
    retention: input.retention,
    coverage: input.coverage,
    concerns: input.concerns,
    streak: input.streak,
  };
}
