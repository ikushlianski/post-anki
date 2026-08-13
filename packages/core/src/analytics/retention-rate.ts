import { groupAndAggregate, type KeyedValue } from "./aggregate-numbers";

export interface ProbeAnswerForRetention {
  gapId: string;
  answeredAt: string;
  outcome: "pass" | "fail";
}

export interface GapRetention {
  gapId: string;
  correctCount: number;
  totalCount: number;
  rate: number | null;
}

export function deriveRetentionRate(
  answers: ProbeAnswerForRetention[],
  masteredAtByGapId: Map<string, string>,
): GapRetention[] {
  const buckets = new Map<string, { correct: number; total: number }>();

  for (const gapId of masteredAtByGapId.keys()) {
    buckets.set(gapId, { correct: 0, total: 0 });
  }

  for (const answer of answers) {
    const masteredAt = masteredAtByGapId.get(answer.gapId);

    if (masteredAt === undefined) {
      continue;
    }

    if (Date.parse(answer.answeredAt) <= Date.parse(masteredAt)) {
      continue;
    }

    const bucket = buckets.get(answer.gapId)!;
    bucket.total += 1;

    if (answer.outcome === "pass") {
      bucket.correct += 1;
    }
  }

  return [...buckets.entries()].map(([gapId, { correct, total }]) => ({
    gapId,
    correctCount: correct,
    totalCount: total,
    rate: total === 0 ? null : correct / total,
  }));
}

export interface RetentionSummary {
  count: number;
  avgRate: number;
  medianRate: number;
}

export interface KeyedGapRetention {
  key: string;
  rate: number | null;
}

export function aggregateRetentionRate(
  entries: KeyedGapRetention[],
  keys: string[],
): Map<string, RetentionSummary | null> {
  const keyedValues: KeyedValue[] = entries.map((entry) => ({ key: entry.key, value: entry.rate }));
  const aggregates = groupAndAggregate(keyedValues, keys);
  const result = new Map<string, RetentionSummary | null>();

  for (const [key, aggregate] of aggregates) {
    result.set(
      key,
      aggregate === null
        ? null
        : { count: aggregate.count, avgRate: aggregate.avg, medianRate: aggregate.median },
    );
  }

  return result;
}
