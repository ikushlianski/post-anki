import type { CardPhase, ReviewCounts } from "@/api/review-commands";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function countBucketFor(phase: CardPhase | string): keyof ReviewCounts | null {
  if (phase === "new") {
    return "new";
  }

  if (phase === "learning" || phase === "relearning") {
    return "learning";
  }

  if (phase === "review") {
    return "review";
  }

  return null;
}

export function applyGradeToCounts(counts: ReviewCounts, phase: CardPhase | string, direction: 1 | -1): ReviewCounts {
  const bucket = countBucketFor(phase);

  if (!bucket) {
    return counts;
  }

  return { ...counts, [bucket]: Math.max(0, counts[bucket] + direction) };
}

export function formatInterval(seconds: number): string {
  if (seconds < MINUTE) {
    return "<1m";
  }

  if (seconds < HOUR) {
    return `${Math.round(seconds / MINUTE)}m`;
  }

  if (seconds < DAY) {
    return `${Math.round(seconds / HOUR)}h`;
  }

  if (seconds < MONTH) {
    return `${Math.round(seconds / DAY)}d`;
  }

  return `${Math.round((seconds / MONTH) * 10) / 10}mo`;
}
