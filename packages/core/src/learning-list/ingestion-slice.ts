import type { IngestionSlice } from "@post-anki/shared";
import { allowsGeneration } from "../liveness/liveness";
import { GENERATION_DAY_MS, QUESTIONS_PER_TOPIC, SLICE_QUESTION_COUNT } from "./generation-constants";

export interface NextIngestionSliceInput {
  liveness: number | null;
  questionsAlreadyGenerated: number;
  ceiling: number;
  lastReleasedAt: string | null;
}

function isPaced(lastReleasedAt: string | null, now: string): boolean {
  if (lastReleasedAt === null) {
    return false;
  }

  const elapsedMs = new Date(now).getTime() - new Date(lastReleasedAt).getTime();

  return elapsedMs < GENERATION_DAY_MS;
}

export function nextIngestionSlice(
  input: NextIngestionSliceInput,
  now: string,
): IngestionSlice | null {
  const { liveness, questionsAlreadyGenerated, ceiling, lastReleasedAt } = input;

  if (!allowsGeneration(liveness)) {
    return null;
  }

  if (isPaced(lastReleasedAt, now)) {
    return null;
  }

  const generated = Math.max(questionsAlreadyGenerated, 0);
  const remaining = ceiling - generated;

  if (remaining <= 0) {
    return null;
  }

  const questionCount = Math.min(SLICE_QUESTION_COUNT, remaining);

  return {
    topicCount: Math.ceil(questionCount / QUESTIONS_PER_TOPIC),
    questionCount,
  };
}
