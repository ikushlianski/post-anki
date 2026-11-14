import type { GradeScheduleResult, GradeScheduleState } from "./knowledge-bit-grade-schedule.js";

export const KNOWN_CARD_MIN_INTERVAL_DAYS = 180;
export const KNOWN_CARD_MAX_INTERVAL_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EASE_FACTOR = 2.5;

export function deriveKnownSchedule(
  current: GradeScheduleState | null,
  now: Date,
  random: () => number = Math.random,
): GradeScheduleResult {
  const span = KNOWN_CARD_MAX_INTERVAL_DAYS - KNOWN_CARD_MIN_INTERVAL_DAYS + 1;
  const intervalDays = KNOWN_CARD_MIN_INTERVAL_DAYS + Math.min(span - 1, Math.floor(random() * span));

  return {
    easeFactor: current?.easeFactor ?? DEFAULT_EASE_FACTOR,
    intervalDays,
    phase: "review",
    learningStep: 0,
    lapses: current?.lapses ?? 0,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    wasNew: current === null,
  };
}
