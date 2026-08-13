import type { SeriesVerdictValue } from "@post-anki/shared";
import {
  FOLD_IN_QUESTION_CEILING,
  QUESTIONS_PER_KNOWN_SERIES_PART,
  QUESTIONS_PER_SERIES_PART,
  SERIES_QUESTION_CEILING_MAX,
  SERIES_QUESTION_CEILING_MIN,
} from "./generation-constants";

// `knownPartCount` is only ever set when the parts are genuinely known —
// discovered and verified (a code host's own chapter listing) or already
// safety-validated sibling URLs (resolve-known-series-parts.ts) — never an
// LLM's raw guess at `partCount`. When it is set, the ceiling is raised (never
// lowered) to guarantee at least one slice per known part, so a course shaped
// with N known modules can actually fill all N. When it is null — the
// ordinary case, an unverified partCount guess — behaviour is unchanged from
// before: clamped to the [SERIES_QUESTION_CEILING_MIN, SERIES_QUESTION_CEILING_MAX]
// band, precisely because that guess cannot be trusted to size a course on
// its own.
export function planQuestionCeiling(
  verdict: SeriesVerdictValue,
  partCount: number,
  knownPartCount: number | null = null,
): number {
  if (verdict !== "series") {
    return FOLD_IN_QUESTION_CEILING;
  }

  const parts = Number.isFinite(partCount) ? Math.floor(partCount) : 0;
  const scaled = Math.max(parts, 0) * QUESTIONS_PER_SERIES_PART;
  const clamped = Math.min(Math.max(scaled, SERIES_QUESTION_CEILING_MIN), SERIES_QUESTION_CEILING_MAX);

  if (knownPartCount === null || !Number.isFinite(knownPartCount) || knownPartCount <= 0) {
    return clamped;
  }

  const knownFloor = Math.floor(knownPartCount) * QUESTIONS_PER_KNOWN_SERIES_PART;

  return Math.max(clamped, knownFloor);
}
