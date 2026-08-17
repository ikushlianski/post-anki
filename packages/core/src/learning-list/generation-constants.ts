export const FOLD_IN_QUESTION_CEILING = 6;

export const SERIES_QUESTION_CEILING_MIN = 20;

export const SERIES_QUESTION_CEILING_MAX = 30;

export const QUESTIONS_PER_SERIES_PART = 3;

export const SLICE_TOPIC_COUNT = 3;

export const QUESTIONS_PER_TOPIC = 2;

export const SLICE_QUESTION_COUNT = SLICE_TOPIC_COUNT * QUESTIONS_PER_TOPIC;

// A "known" part (a code host's own chapter listing, or sibling URLs that
// already passed the safety guard — see resolve-known-series-parts.ts) is
// going to become a real module in the course, not a guess. Its ceiling
// contribution is therefore SLICE_QUESTION_COUNT itself, not the smaller
// QUESTIONS_PER_SERIES_PART budget above: that smaller number exists only to
// keep an LLM's unverified partCount guess from inflating the ceiling, and
// that reasoning does not apply once the parts are verified. This floor
// deliberately can exceed SERIES_QUESTION_CEILING_MAX — the max exists for
// the same unverified-guess reason — but it still stays bounded in practice,
// because the known part count itself is capped upstream (MAX_DISCOVERED_CHAPTERS
// and MAX_CAPTURED_SIBLINGS both cap around a dozen parts).
export const QUESTIONS_PER_KNOWN_SERIES_PART = SLICE_QUESTION_COUNT;

export const HEADROOM_OFFER_COOLDOWN_DAYS = 30;

export const GENERATION_DAY_MS = 24 * 60 * 60 * 1000;
