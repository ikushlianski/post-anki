import type { NothingExtractedStatistics, NothingExtractedWeek } from "@post-anki/shared";
import { WEEKLY_BUCKETS, weeklyWindowStart } from "../reject-reasons-statistics/reject-reasons-weekly.js";
import { readNothingExtractedRows, type RawNothingExtractedRow } from "./nothing-extracted-weekly.repo.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildNothingExtractedWeekly(
  rows: RawNothingExtractedRow[],
  now: Date = new Date(),
): NothingExtractedWeek[] {
  const start = weeklyWindowStart(now).getTime();

  return Array.from({ length: WEEKLY_BUCKETS }, (_, index) => {
    const weekStart = new Date(start + index * WEEK_MS).toISOString().slice(0, 10);
    const row = rows.find((candidate) => candidate.weekStart === weekStart);
    const processed = row?.processed ?? 0;
    const nothingExtracted = row?.nothingExtracted ?? 0;

    return { weekStart, processed, nothingExtracted, rate: processed === 0 ? 0 : nothingExtracted / processed };
  });
}

export async function getNothingExtractedStatistics(now: Date = new Date()): Promise<NothingExtractedStatistics> {
  const rows = await readNothingExtractedRows(weeklyWindowStart(now));

  return { weekly: buildNothingExtractedWeekly(rows, now) };
}
