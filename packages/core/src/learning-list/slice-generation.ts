import type { DepthLevel } from "@post-anki/shared";
import { QUESTIONS_PER_TOPIC } from "./generation-constants";

export interface GeneratedGapCandidate {
  label: string;
  depth: DepthLevel;
}

export interface GeneratedTopicCandidate {
  title: string;
  summary: string | null;
  gaps: GeneratedGapCandidate[];
}

export interface TruncatedSliceTopic {
  title: string;
  summary: string | null;
  gaps: GeneratedGapCandidate[];
}

function cleanTopic(topic: GeneratedTopicCandidate): TruncatedSliceTopic | null {
  const title = topic.title.trim();

  if (title.length === 0) {
    return null;
  }

  const gaps = topic.gaps
    .filter((gap) => gap.label.trim().length > 0)
    .slice(0, QUESTIONS_PER_TOPIC)
    .map((gap) => ({ label: gap.label.trim(), depth: gap.depth }));

  return { title, summary: topic.summary, gaps };
}

// The one guard between the slice-generation agent's raw structured output
// and any database write: caps the topic count to the slice's own
// `topicCount`, caps each topic's gaps to `QUESTIONS_PER_TOPIC`, and caps the
// running total of gaps across topics to `questionCount` — the ceiling is a
// hard stop independent of what the model proposes. A topic left with zero
// gaps after truncation is dropped entirely rather than written empty.
export function truncateSliceGeneration(
  topics: GeneratedTopicCandidate[],
  topicCount: number,
  questionCount: number,
): TruncatedSliceTopic[] {
  const cleaned = topics
    .map(cleanTopic)
    .filter((topic): topic is TruncatedSliceTopic => topic !== null)
    .slice(0, Math.max(topicCount, 0));

  let budget = Math.max(questionCount, 0);
  const result: TruncatedSliceTopic[] = [];

  for (const topic of cleaned) {
    if (budget <= 0) {
      break;
    }

    const gaps = topic.gaps.slice(0, budget);

    if (gaps.length === 0) {
      continue;
    }

    budget -= gaps.length;
    result.push({ title: topic.title, summary: topic.summary, gaps });
  }

  return result;
}
