import type { ReviewGrade } from "@post-anki/shared";

export const LEARNING_STEPS_SECONDS = [60, 600];
export const RELEARNING_STEPS_SECONDS = [600];
export const GRADUATING_INTERVAL_DAYS = 1;
export const EASY_INTERVAL_DAYS = 4;
export const LEARN_AHEAD_SECONDS = 1200;

const DAY_SECONDS = 24 * 60 * 60;

export type StepPhase = "new" | "learning" | "relearning";

export interface LearningStepState {
  phase: StepPhase;
  learningStep: number;
  intervalDays: number;
}

export interface LearningStepResult {
  phase: "learning" | "relearning" | "review";
  learningStep: number;
  intervalDays: number;
  dueAt: Date;
}

const after = (now: Date, seconds: number): Date => new Date(now.getTime() + seconds * 1000);

function hardDelay(steps: number[], step: number): number {
  const current = steps[step] ?? steps[steps.length - 1] ?? 0;

  if (step > 0) {
    return current;
  }

  const second = steps[1];

  return second === undefined ? current * 1.5 : (current + second) / 2;
}

export function deriveLearningStep(
  state: LearningStepState,
  grade: ReviewGrade,
  now: Date,
): LearningStepResult {
  const relearning = state.phase === "relearning";
  const phase = relearning ? "relearning" : "learning";
  const steps = relearning ? RELEARNING_STEPS_SECONDS : LEARNING_STEPS_SECONDS;
  const last = steps.length - 1;
  const step = state.phase === "new" ? 0 : Math.min(Math.max(state.learningStep, 0), last);
  const keepInterval = relearning ? state.intervalDays : 0;
  const stay = (learningStep: number, seconds: number): LearningStepResult => ({
    phase,
    learningStep,
    intervalDays: keepInterval,
    dueAt: after(now, seconds),
  });
  const graduate = (days: number): LearningStepResult => ({
    phase: "review",
    learningStep: 0,
    intervalDays: days,
    dueAt: after(now, days * DAY_SECONDS),
  });
  const base = Math.max(state.intervalDays, GRADUATING_INTERVAL_DAYS);

  switch (grade) {
    case "again":
      return stay(0, steps[0] ?? 0);
    case "hard":
      return stay(step, hardDelay(steps, step));
    case "good":
      if (step < last) {
        return stay(step + 1, steps[step + 1] ?? 0);
      }

      return graduate(relearning ? base : GRADUATING_INTERVAL_DAYS);
    case "easy":
      return graduate(relearning ? base + 1 : EASY_INTERVAL_DAYS);
  }
}
