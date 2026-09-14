export interface DailyDigestInput {
  dueQueueCount: number;
  gapsDueCount: number;
  questionText: string;
}

export function formatDailyDigest(input: DailyDigestInput): string {
  const summaryLines: string[] = [];

  if (input.dueQueueCount > 0) {
    summaryLines.push(
      `📚 ${input.dueQueueCount} topic${input.dueQueueCount === 1 ? "" : "s"} due for review`,
    );
  }

  if (input.gapsDueCount > 0) {
    summaryLines.push(
      `🔁 ${input.gapsDueCount} gap${input.gapsDueCount === 1 ? "" : "s"} due to resurface`,
    );
  }

  if (summaryLines.length === 0) {
    return input.questionText;
  }

  return [...summaryLines, "", input.questionText].join("\n");
}
