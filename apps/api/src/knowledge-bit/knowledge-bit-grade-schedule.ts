import type { ReviewGrade } from "@post-anki/shared";

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 180;
const DEFAULT_EASE_FACTOR = 2.5;
const NEW_CARD_INTERVAL_DAYS = 1;
const NEW_CARD_EASY_INTERVAL_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GradeScheduleState {
  easeFactor: number;
  intervalDays: number;
}

export interface GradeScheduleResult extends GradeScheduleState {
  dueAt: Date;
  phase: "review";
  wasNew: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function nextReviewedState(current: GradeScheduleState, grade: ReviewGrade): GradeScheduleState {
  const base = Math.max(current.intervalDays, MIN_INTERVAL_DAYS);
  const ease = current.easeFactor;

  switch (grade) {
    case "again":
      return { intervalDays: MIN_INTERVAL_DAYS, easeFactor: ease - 0.2 };
    case "hard":
      return { intervalDays: base * 1.2, easeFactor: ease - 0.15 };
    case "good":
      return { intervalDays: base * ease, easeFactor: ease };
    case "easy":
      return { intervalDays: base * ease * 1.3, easeFactor: ease + 0.15 };
  }
}

// Anki-style four-grade rule for self-graded review; the typed mode keeps computeNextSchedule.
export function deriveGradeSchedule(
  current: GradeScheduleState | null,
  grade: ReviewGrade,
  now: Date,
): GradeScheduleResult {
  const next = current
    ? nextReviewedState(current, grade)
    : {
        easeFactor: DEFAULT_EASE_FACTOR,
        intervalDays: grade === "easy" ? NEW_CARD_EASY_INTERVAL_DAYS : NEW_CARD_INTERVAL_DAYS,
      };
  const intervalDays = clamp(next.intervalDays, MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
  const easeFactor = clamp(next.easeFactor, MIN_EASE_FACTOR, MAX_EASE_FACTOR);

  return {
    easeFactor,
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    phase: "review",
    wasNew: current === null,
  };
}
