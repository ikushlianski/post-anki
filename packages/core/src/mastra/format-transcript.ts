export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FormatTranscriptOptions {
  assistantLabel: string;
  learnerLabel?: string;
  emptyText?: string;
}

export function formatTranscript(
  turns: TranscriptTurn[],
  options: FormatTranscriptOptions,
): string {
  if (turns.length === 0) {
    return options.emptyText ?? "";
  }

  const learnerLabel = options.learnerLabel ?? "Learner";

  return turns
    .map((turn) => `${turn.role === "user" ? learnerLabel : options.assistantLabel}: ${turn.text}`)
    .join("\n");
}
