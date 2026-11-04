import type { OwnerStatsLearning, ReviewCounts } from "@post-anki/shared";

export interface StreakSummary {
  counts: ReviewCounts;
  stats: Pick<OwnerStatsLearning, "streak" | "accuracy">;
}

export function cardsDueCount(counts: ReviewCounts): number {
  return counts.learning + counts.review;
}

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export function formatStreakReply(summary: StreakSummary, webBaseUrl?: string): string {
  const due = cardsDueCount(summary.counts);
  const { streak, accuracy } = summary.stats;
  const accuracyLine =
    accuracy.last7 === null
      ? "🎯 No reviews in the last 7 days yet"
      : `🎯 ${Math.round(accuracy.last7 * 100)}% correct over the last 7 days`;
  const lines = [
    `🗂 ${due} ${due === 1 ? "card" : "cards"} due`,
    `🔥 Streak: ${days(streak.current)} (longest ${days(streak.longest)})`,
    accuracyLine,
  ];

  if (webBaseUrl && due > 0) lines.push(`${webBaseUrl.replace(/\/+$/, "")}/knowledge/review`);

  return lines.join("\n");
}
