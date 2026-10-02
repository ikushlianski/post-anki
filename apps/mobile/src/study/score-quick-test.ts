import type { ProbeQuestion } from "@post-anki/shared";

export type SelfOutcome = "pass" | "fail";

// Mirrors the web client's apps/web/src/curriculum/probe-answer.tsx
// `chooseOption`: the opening question (no gapId yet) never has a scored
// outcome to report, only the gap-probing questions that follow it do.
export function scoreQuickTestSelection(
  question: Pick<ProbeQuestion, "correctAnswerIndex" | "gapId">,
  selectedIndex: number,
): SelfOutcome | undefined {
  if (question.gapId === null) {
    return undefined;
  }

  return question.correctAnswerIndex != null && selectedIndex === question.correctAnswerIndex
    ? "pass"
    : "fail";
}
