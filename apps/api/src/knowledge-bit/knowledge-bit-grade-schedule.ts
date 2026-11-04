import {
  LONG_TERM_MAX_INTERVAL_DAYS,
  type CardPhase,
  type IntervalPreview,
  type ReviewGrade,
} from "@post-anki/shared";
import {
  DEFAULT_STEP_OPTIONS,
  deriveLearningStep,
  type StepOptions,
} from "./knowledge-bit-learning-steps.js";

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = LONG_TERM_MAX_INTERVAL_DAYS;
const DEFAULT_EASE_FACTOR = 2.5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleOptions extends StepOptions {
  maxIntervalDays?: number;
  retentionMultiplier?: number;
}

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

export function applyRetention(
  grade: ReviewGrade,
  raw: number,
  base: number,
  ease: number,
  multiplier: number,
): number {
  if (multiplier === 1) {
    return raw;
  }

  const scaled = raw * multiplier;

  if (multiplier > 1) {
    return scaled;
  }

  const good = Math.max(base * ease * multiplier, base + 1);

  switch (grade) {
    case "hard":
      return Math.max(scaled, base);
    case "good":
      return good;
    case "easy":
      return Math.max(scaled, good + 1);
    case "again":
      return raw;
  }
}

// Anki-style four-grade rule for self-graded review; the typed mode keeps computeNextSchedule.
export function deriveGradeSchedule(
  current: GradeScheduleState | null,
  grade: ReviewGrade,
  now: Date,
  options: ScheduleOptions = DEFAULT_STEP_OPTIONS,
): GradeScheduleResult {
  const maxInterval = options.maxIntervalDays ?? MAX_INTERVAL_DAYS;
  const multiplier = options.retentionMultiplier ?? 1;
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
      options,
    );

    const capped =
      step.phase === "review" && step.intervalDays > maxInterval
        ? { ...step, intervalDays: maxInterval, dueAt: new Date(now.getTime() + maxInterval * DAY_MS) }
        : step;

    return {
      easeFactor: current?.easeFactor ?? DEFAULT_EASE_FACTOR,
      lapses: current?.lapses ?? 0,
      ...capped,
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
      dueAt: new Date(now.getTime() + (options.relearningSteps[0] ?? 0) * 1000),
      wasNew: false,
    };
  }

  const base = Math.max(state.intervalDays, MIN_INTERVAL_DAYS);
  const intervalDays = clamp(
    applyRetention(
      grade,
      nextReviewedState(state, grade).intervalDays,
      base,
      state.easeFactor,
      multiplier,
    ),
    MIN_INTERVAL_DAYS,
    Math.max(MIN_INTERVAL_DAYS, maxInterval),
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
  options: ScheduleOptions = DEFAULT_STEP_OPTIONS,
): IntervalPreview {
  const seconds = (grade: ReviewGrade): number =>
    Math.round((deriveGradeSchedule(current, grade, now, options).dueAt.getTime() - now.getTime()) / 1000);

  return {
    again: seconds("again"),
    hard: seconds("hard"),
    good: seconds("good"),
    easy: seconds("easy"),
  };
}
