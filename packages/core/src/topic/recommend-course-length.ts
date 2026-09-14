import type { DepthLevel } from "@post-anki/shared";

export type CourseLengthRecommendation = "short" | "long";

export interface CourseLengthSignal {
  recommendation: CourseLengthRecommendation;
  alreadyKnownRatio: number;
}

// A learner already testing working/deep on most topics needs a short
// course filling gaps, not a full-length one re-teaching what they know.
const SHORT_COURSE_ALREADY_KNOWN_THRESHOLD = 0.6;

export function recommendCourseLength(electedDepths: DepthLevel[]): CourseLengthSignal {
  if (electedDepths.length === 0) {
    return { recommendation: "long", alreadyKnownRatio: 0 };
  }

  const alreadyKnown = electedDepths.filter(
    (depth) => depth === "deep" || depth === "working",
  ).length;
  const alreadyKnownRatio = alreadyKnown / electedDepths.length;

  return {
    recommendation:
      alreadyKnownRatio >= SHORT_COURSE_ALREADY_KNOWN_THRESHOLD ? "short" : "long",
    alreadyKnownRatio,
  };
}
