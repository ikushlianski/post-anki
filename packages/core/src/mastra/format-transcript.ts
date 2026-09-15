export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FormatTranscriptOptions {
  assistantLabel: string;
  learnerLabel?: string;
  emptyText?: string;
  maxTurns?: number;
}

// Every call site feeds this either a client-supplied array (qa-chat,
// study-chat — nothing caps what a client can send) or a full DB history
// (curriculum structure turns — no LIMIT on the query), so without a
// default cap here every one of them re-sends the whole conversation on
// every turn, growing prompt token cost linearly with conversation length.
// 24 turns (~12 exchanges) keeps recent context while bounding the worst
// case; a caller that genuinely needs the full history can opt out with
// `maxTurns: Infinity`.
const DEFAULT_MAX_TURNS = 24;

export function formatTranscript(
  turns: TranscriptTurn[],
  options: FormatTranscriptOptions,
): string {
  if (turns.length === 0) {
    return options.emptyText ?? "";
  }

  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const bounded = turns.length > maxTurns ? turns.slice(turns.length - maxTurns) : turns;
  const learnerLabel = options.learnerLabel ?? "Learner";

  return bounded
    .map((turn) => `${turn.role === "user" ? learnerLabel : options.assistantLabel}: ${turn.text}`)
    .join("\n");
}
