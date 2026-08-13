export interface SessionAnswerCounters {
  questionsAnswered: number;
  questionsCorrect: number;
}

export function recordSessionAnswer(
  current: SessionAnswerCounters,
  correct: boolean,
): SessionAnswerCounters {
  return {
    questionsAnswered: current.questionsAnswered + 1,
    questionsCorrect: current.questionsCorrect + (correct ? 1 : 0),
  };
}
