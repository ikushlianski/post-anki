import type { Question, RecordAttemptInput, TopicProgress } from "@post-anki/shared";
import { deriveTopicStatus } from "./progress";

const PASS_DELTA = 25;
const FAIL_DELTA = -15;

export type AttemptOutcome = "pass" | "fail";

export function gradeAttempt(
  question: Question,
  input: RecordAttemptInput,
): AttemptOutcome {
  if (question.kind === "quick_test") {
    return Number(input.answer) === question.correctAnswerIndex ? "pass" : "fail";
  }

  return input.selfOutcome ?? "fail";
}

export function applyAttempt(
  progress: TopicProgress,
  outcome: AttemptOutcome,
  now: string,
): TopicProgress {
  const delta = outcome === "pass" ? PASS_DELTA : FAIL_DELTA;
  const maturity = clamp(progress.maturity + delta, 0, 100);
  const attempts = progress.attempts + 1;

  return {
    status: deriveTopicStatus(maturity, attempts),
    maturity,
    attempts,
    lastInteractedAt: now,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
