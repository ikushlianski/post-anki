import type { SeriesVerdictValue } from "@post-anki/shared";
import {
  FOLD_IN_QUESTION_CEILING,
  QUESTIONS_PER_SERIES_PART,
  SERIES_QUESTION_CEILING_MAX,
  SERIES_QUESTION_CEILING_MIN,
} from "./generation-constants";

export function planQuestionCeiling(
  verdict: SeriesVerdictValue,
  partCount: number,
): number {
  if (verdict !== "series") {
    return FOLD_IN_QUESTION_CEILING;
  }

  const parts = Number.isFinite(partCount) ? Math.floor(partCount) : 0;
  const scaled = Math.max(parts, 0) * QUESTIONS_PER_SERIES_PART;

  if (scaled < SERIES_QUESTION_CEILING_MIN) {
    return SERIES_QUESTION_CEILING_MIN;
  }

  if (scaled > SERIES_QUESTION_CEILING_MAX) {
    return SERIES_QUESTION_CEILING_MAX;
  }

  return scaled;
}
