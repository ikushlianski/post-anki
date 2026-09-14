import type { DepthLevel } from "@post-anki/shared";

export interface TopicCalibrationAnswer {
  topicId: string;
  correct: boolean;
}

export interface ElectedTopicDepth {
  topicId: string;
  depth: DepthLevel;
}

// A single correct answer on a 4-option question is ~25% likely to be a
// lucky guess — the deepest band needs at least this many correct answers
// before it's trustworthy signal rather than a coin flip.
const MIN_QUESTIONS_FOR_DEEP = 2;

// A topic's calibration accuracy elects its starting depth — reusing the
// existing awareness/working/deep ladder rather than inventing a second
// depth concept (spec's "Decisions made autonomously"). Thresholds:
// perfect record across at least 2 questions -> deep (a single correct
// answer is a ~25% coin flip on a 4-option question, not enough evidence
// for the deepest band), majority-correct -> working, anything else
// (including zero answers correct) -> awareness. Topics the calibration
// quiz never asked about are simply absent from the result — the caller
// decides what an unelected topic defaults to.
export function electDepthFromCalibration(
  answers: TopicCalibrationAnswer[],
): ElectedTopicDepth[] {
  const byTopic = new Map<string, { correct: number; total: number }>();

  for (const answer of answers) {
    const tally = byTopic.get(answer.topicId) ?? { correct: 0, total: 0 };

    tally.total += 1;

    if (answer.correct) {
      tally.correct += 1;
    }

    byTopic.set(answer.topicId, tally);
  }

  return Array.from(byTopic.entries()).map(([topicId, tally]) => ({
    topicId,
    depth: depthForAccuracy(tally.correct, tally.total),
  }));
}

function depthForAccuracy(correct: number, total: number): DepthLevel {
  if (total === 0) {
    return "awareness";
  }

  const accuracy = correct / total;

  if (accuracy >= 1 && total >= MIN_QUESTIONS_FOR_DEEP) {
    return "deep";
  }

  if (accuracy >= 0.5) {
    return "working";
  }

  return "awareness";
}
