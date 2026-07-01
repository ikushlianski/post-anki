import type {
  AnswerProbeSessionResult,
  ProbeSession,
  ProbeSessionQuestion,
} from "@post-anki/shared";

export interface QuizProgress {
  answered: number;
  total: number;
  correct: number;
}

export function formatQuestion(
  question: ProbeSessionQuestion,
  progress: QuizProgress,
): string {
  const lines: string[] = [
    `❓ Question ${progress.answered + 1}/${progress.total}`,
    "",
    question.prompt,
    "",
  ];

  question.options.forEach((opt, i) => lines.push(`${i + 1}. ${opt}`));
  lines.push("", `Score so far: ${progress.correct}/${progress.answered}`);

  return lines.join("\n");
}

export function formatAnswerReveal(
  result: AnswerProbeSessionResult,
  question: ProbeSessionQuestion,
): string {
  const head = result.outcome === "pass" ? "✅ Correct" : "❌ Not quite";
  const correctText =
    question.options[result.correctAnswerIndex] ?? "(unavailable)";
  const lines: string[] = [head, "", `Answer: ${correctText}`];

  if (result.coveredGapLabels.length > 0) {
    lines.push(`Covered: ${result.coveredGapLabels.join(", ")}`);
  }

  lines.push("", `Progress: ${result.answered}/${result.total} · ${result.correct} correct`);

  return lines.join("\n");
}

export function formatQuizComplete(
  result: AnswerProbeSessionResult,
  scopeLabel: string,
): string {
  const percent =
    result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;

  return [
    "🎉 Quiz complete",
    "",
    scopeLabel,
    `Final score: ${result.correct}/${result.total} (${percent}%)`,
  ].join("\n");
}

export function firstUnanswered(
  session: ProbeSession,
): ProbeSessionQuestion | null {
  const pending = session.questions
    .filter((q) => q.answeredIndex === null)
    .sort((a, b) => a.order - b.order);

  return pending[0] ?? null;
}

export function findQuestion(
  session: ProbeSession,
  questionId: string,
): ProbeSessionQuestion | null {
  return session.questions.find((q) => q.id === questionId) ?? null;
}
