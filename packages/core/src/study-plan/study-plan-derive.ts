import {
  EXAM_MAX_NEW_CARDS_PER_DAY,
  EXAM_NEW_MATERIAL_SHARE,
  LONG_TERM_MAX_INTERVAL_DAYS,
  PAUSE_MIN_REVIEWS,
  PAUSE_REVIEWS_PER_NEW_CARD,
  RETENTION_MULTIPLIER_MAX,
  RETENTION_MULTIPLIER_MIN,
  DEFAULT_DESIRED_RETENTION,
  type StudyIntent,
} from "@post-anki/shared";
import { addLocalDays, diffLocalDays } from "./study-plan-dates";

export type StudyMode = "exam" | "long_term";

export interface ExamWindowInput {
  intent: StudyIntent;
  examDate: string | null;
  plannedOn: string | null;
  today: string;
}

export interface ExamWindow {
  mode: StudyMode;
  daysLeft: number | null;
  examPassed: boolean;
  maxIntervalDays: number;
  newCardsEndOn: string | null;
  examDate: string | null;
}

export function deriveRetentionMultiplier(retention: number): number {
  const raw = Math.log(retention) / Math.log(DEFAULT_DESIRED_RETENTION);

  if (!Number.isFinite(raw)) {
    return 1;
  }

  return Math.min(RETENTION_MULTIPLIER_MAX, Math.max(RETENTION_MULTIPLIER_MIN, raw));
}

export function deriveExamWindow(input: ExamWindowInput): ExamWindow {
  const longTerm: ExamWindow = {
    mode: "long_term",
    daysLeft: null,
    examPassed: false,
    maxIntervalDays: LONG_TERM_MAX_INTERVAL_DAYS,
    newCardsEndOn: null,
    examDate: input.examDate,
  };

  if (input.intent !== "exam" || !input.examDate) {
    return longTerm;
  }

  const daysLeft = diffLocalDays(input.examDate, input.today);

  if (daysLeft <= 0) {
    return { ...longTerm, daysLeft, examPassed: true };
  }

  const plannedOn = input.plannedOn ?? input.today;
  const planned = Math.max(0, diffLocalDays(input.examDate, plannedOn));
  const lastDay = addLocalDays(input.examDate, -1);
  const share = addLocalDays(plannedOn, Math.round(EXAM_NEW_MATERIAL_SHARE * planned));

  return {
    mode: "exam",
    daysLeft,
    examPassed: false,
    maxIntervalDays: Math.min(LONG_TERM_MAX_INTERVAL_DAYS, Math.max(1, daysLeft - 1)),
    newCardsEndOn: share < lastDay ? share : lastDay,
    examDate: input.examDate,
  };
}

export interface NewCardPaceInput {
  window: ExamWindow;
  explicitPerDay: number | null;
  fallbackPerDay: number;
  remainingAtDayStart: number;
  today: string;
}

export function deriveNewCardPace(input: NewCardPaceInput): { perDay: number; paced: boolean } {
  const { window, explicitPerDay, fallbackPerDay, remainingAtDayStart, today } = input;

  if (window.mode === "long_term") {
    return { perDay: explicitPerDay ?? fallbackPerDay, paced: false };
  }

  if (explicitPerDay !== null) {
    return { perDay: explicitPerDay, paced: false };
  }

  if (remainingAtDayStart <= 0) {
    return { perDay: 0, paced: true };
  }

  const endOn = window.newCardsEndOn ?? today;
  const daysForNew =
    today <= endOn ? diffLocalDays(endOn, today) + 1 : Math.max(1, (window.daysLeft ?? 1) - 1);

  return {
    perDay: Math.min(EXAM_MAX_NEW_CARDS_PER_DAY, Math.ceil(remainingAtDayStart / daysForNew)),
    paced: true,
  };
}

export function deriveNewCardPause(input: {
  mode: StudyMode;
  waitingReviews: number;
  perDay: number;
}): { paused: boolean; threshold: number } {
  const threshold = Math.max(PAUSE_MIN_REVIEWS, PAUSE_REVIEWS_PER_NEW_CARD * input.perDay);

  return { paused: input.mode === "exam" && input.waitingReviews >= threshold, threshold };
}
