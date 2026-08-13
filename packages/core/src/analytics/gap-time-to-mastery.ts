import { groupAndAggregate, type KeyedValue } from "./aggregate-numbers";

const HOURS_PER_MS = 1000 * 60 * 60;

export interface GapMasteryTiming {
  gapId: string;
  createdAt: string;
  masteredAt: string | null;
}

export interface GapTimeToMastery {
  gapId: string;
  hours: number | null;
}

export interface TimeToMasterySummary {
  count: number;
  avgHours: number;
  medianHours: number;
}

export function deriveGapTimeToMastery(rows: GapMasteryTiming[]): GapTimeToMastery[] {
  return rows.map((row) => ({
    gapId: row.gapId,
    hours:
      row.masteredAt === null
        ? null
        : (Date.parse(row.masteredAt) - Date.parse(row.createdAt)) / HOURS_PER_MS,
  }));
}

export interface KeyedGapDuration {
  key: string;
  hours: number | null;
}

export function aggregateTimeToMastery(
  entries: KeyedGapDuration[],
  keys: string[],
): Map<string, TimeToMasterySummary | null> {
  const keyedValues: KeyedValue[] = entries.map((entry) => ({ key: entry.key, value: entry.hours }));
  const aggregates = groupAndAggregate(keyedValues, keys);
  const result = new Map<string, TimeToMasterySummary | null>();

  for (const [key, aggregate] of aggregates) {
    result.set(
      key,
      aggregate === null
        ? null
        : { count: aggregate.count, avgHours: aggregate.avg, medianHours: aggregate.median },
    );
  }

  return result;
}
