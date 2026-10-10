import type { CardPhase, IntervalPreview, ReviewGrade } from "@post-anki/shared";
import { deriveLearningStep, RELEARNING_STEPS_SECONDS } from "./knowledge-bit-learning-steps.js";

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 180;
const DEFAULT_EASE_FACTOR = 2.5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GradeScheduleState {
  easeFactor: number;
  intervalDays: number;
  phase: CardPhase;
  learningStep: number;
  lapses: number;
}

export interface GradeScheduleResult extends GradeScheduleState {
  dueAt: Date;
  wasNew: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function nextReviewedState(
  current: GradeScheduleState,
  grade: ReviewGrade,
): { intervalDays: number; easeFactor: number } {
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
  const phase = current?.phase ?? "new";

  if (phase !== "review") {
    const step = deriveLearningStep(
      {
        phase: phase as "new" | "learning" | "relearning",
        learningStep: current?.learningStep ?? 0,
        intervalDays: current?.intervalDays ?? 0,
      },
      grade,
      now,
    );

    return {
      easeFactor: current?.easeFactor ?? DEFAULT_EASE_FACTOR,
      lapses: current?.lapses ?? 0,
      ...step,
      wasNew: current === null,
    };
  }

  const state = current as GradeScheduleState;
  const easeFactor = clamp(
    nextReviewedState(state, grade).easeFactor,
    MIN_EASE_FACTOR,
    MAX_EASE_FACTOR,
  );

  if (grade === "again") {
    return {
      easeFactor,
      intervalDays: MIN_INTERVAL_DAYS,
      phase: "relearning",
      learningStep: 0,
      lapses: state.lapses + 1,
      dueAt: new Date(now.getTime() + (RELEARNING_STEPS_SECONDS[0] ?? 0) * 1000),
      wasNew: false,
    };
  }

  const intervalDays = clamp(
    nextReviewedState(state, grade).intervalDays,
    MIN_INTERVAL_DAYS,
    MAX_INTERVAL_DAYS,
  );

  return {
    easeFactor,
    intervalDays,
    phase: "review",
    learningStep: 0,
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    wasNew: false,
  };
}

export function previewGradeIntervals(
  current: GradeScheduleState | null,
  now: Date,
): IntervalPreview {
  const seconds = (grade: ReviewGrade): number =>
    Math.round((deriveGradeSchedule(current, grade, now).dueAt.getTime() - now.getTime()) / 1000);

  return {
    again: seconds("again"),
    hard: seconds("hard"),
    good: seconds("good"),
    easy: seconds("easy"),
  };
}
