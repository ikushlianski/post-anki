import type {
  ProbeOutcome,
  ProbeSessionQuestion,
  ProbeSessionStatus,
} from "@post-anki/shared";

export interface ProbeSessionProgress {
  total: number;
  answered: number;
  correct: number;
  status: ProbeSessionStatus;
}

export function deriveQuizOutcome(
  selectedIndex: number,
  correctAnswerIndex: number,
): ProbeOutcome {
  return selectedIndex === correctAnswerIndex ? "pass" : "fail";
}

export function deriveSessionProgress(
  questions: ProbeSessionQuestion[],
): ProbeSessionProgress {
  const total = questions.length;
  const answered = questions.filter((q) => q.answeredIndex !== null).length;
  const correct = questions.filter((q) => q.outcome === "pass").length;
  const status: ProbeSessionStatus =
    total > 0 && answered === total ? "completed" : "active";

  return { total, answered, correct, status };
}

export function nextUnansweredQuestion(
  questions: ProbeSessionQuestion[],
): ProbeSessionQuestion | null {
  const pending = questions
    .filter((q) => q.answeredIndex === null)
    .sort((a, b) => a.order - b.order);

  return pending[0] ?? null;
}
