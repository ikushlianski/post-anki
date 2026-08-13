import type { IngestionSlice } from "@post-anki/shared";
import { allowsGeneration } from "../liveness/liveness";
import { GENERATION_DAY_MS, QUESTIONS_PER_TOPIC, SLICE_QUESTION_COUNT } from "./generation-constants";

export interface NextIngestionSliceInput {
  liveness: number | null;
  questionsAlreadyGenerated: number;
  ceiling: number;
  lastReleasedAt: string | null;
  unansweredCount: number;
}

// Pacing exists to stop the system burning tokens generating content for a
// topic the learner isn't actually studying — GENERATION_DAY_MS's 24h
// cooldown assumes a dormant learner between releases. That assumption is
// false the moment nothing currently released is left unanswered
// (`unansweredCount === 0`): finishing everything on offer is the strongest
// engagement signal there is, the opposite of the dormancy this cooldown
// guards against. So the cooldown is skipped only in that case — while any
// unanswered (or not-yet-generated) released content remains, the 24h wait
// applies exactly as before. `unansweredCount` is deliberately opaque here —
// the caller decides what granularity "unanswered" means (see
// slice-release.ts's own count) — this function only ever compares it to
// zero. This is strictly an exception to the pacing check: it never touches
// the liveness gate (allowsGeneration, checked before this function runs)
// or the question ceiling (checked after) — those still bound generation
// for an exhausted learner exactly as for a paced one.
function isPaced(lastReleasedAt: string | null, now: string, unansweredCount: number): boolean {
  if (lastReleasedAt === null) {
    return false;
  }

  if (unansweredCount === 0) {
    return false;
  }

  const elapsedMs = new Date(now).getTime() - new Date(lastReleasedAt).getTime();

  return elapsedMs < GENERATION_DAY_MS;
}

export function nextIngestionSlice(
  input: NextIngestionSliceInput,
  now: string,
): IngestionSlice | null {
  const { liveness, questionsAlreadyGenerated, ceiling, lastReleasedAt, unansweredCount } = input;

  if (!allowsGeneration(liveness)) {
    return null;
  }

  if (isPaced(lastReleasedAt, now, unansweredCount)) {
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
