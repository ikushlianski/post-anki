import type { DepthLevel } from "@post-anki/shared";

export interface TopicCalibrationAnswer {
  topicId: string;
  correct: boolean;
}

export interface ElectedTopicDepth {
  topicId: string;
  depth: DepthLevel;
}

// A topic's calibration accuracy elects its starting depth — reusing the
// existing awareness/working/deep ladder rather than inventing a second
// depth concept (spec's "Decisions made autonomously"). Thresholds:
// perfect record -> deep, majority-correct -> working, anything else
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

  if (accuracy >= 1) {
    return "deep";
  }

  if (accuracy >= 0.5) {
    return "working";
  }

  return "awareness";
}
