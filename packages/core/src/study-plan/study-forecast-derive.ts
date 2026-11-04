import { addLocalDays } from "./study-plan-dates";
import {
  deriveExamWindow,
  deriveNewCardPace,
  deriveNewCardPause,
  deriveRetentionMultiplier,
  type ExamWindow,
} from "./study-plan-derive";
import type { StudyIntent } from "@post-anki/shared";

const NEW_CARD_EASE = 2.5;

export interface ScheduledCardInput {
  dueOffset: number;
  intervalDays: number;
  easeFactor: number;
}

export interface StudyForecastStream {
  scheduled: ScheduledCardInput[];
  newRemaining: number;
  newUsedToday: number;
  waitingNow: number;
  intent: StudyIntent;
  examDate: string | null;
  plannedOn: string | null;
  explicitPerDay: number | null;
  fallbackPerDay: number;
  retention: number;
}

export interface StudyForecastInput {
  streams: StudyForecastStream[];
  horizonDays: number;
  today: string;
}

export interface StudyForecastDay {
  date: string;
  reviews: number;
  newCards: number;
}

export interface StudyForecastResult {
  days: StudyForecastDay[];
  averagePerDay: number;
  peakPerDay: number;
  peakOn: string | null;
  newRemaining: number;
  newFinishOn: string | null;
  finishesBeforeExam: boolean | null;
  todayPace: { perDay: number; paced: boolean; paused: boolean; threshold: number };
}

interface SimCard {
  count: number;
  intervalDays: number;
  easeFactor: number;
}

interface StreamResult {
  reviews: number[];
  newCards: number[];
  finishOffset: number | null;
  finishExtrapolated: boolean;
  lastPerDay: number;
  today: { perDay: number; paced: boolean; paused: boolean; threshold: number };
  window: ExamWindow;
}

function nextInterval(card: SimCard, multiplier: number, cap: number): number {
  const grown = Math.round(card.intervalDays * card.easeFactor * multiplier);
  const floor = multiplier < 1 ? card.intervalDays + 1 : 1;

  return Math.min(cap, Math.max(1, floor, grown));
}

function simulateStream(
  stream: StudyForecastStream,
  horizonDays: number,
  today: string,
): StreamResult {
  const multiplier = deriveRetentionMultiplier(stream.retention);
  const forgotten = 1 - stream.retention;
  const due = new Map<number, SimCard[]>();
  const push = (offset: number, card: SimCard) => {
    if (offset < horizonDays) {
      due.set(offset, [...(due.get(offset) ?? []), card]);
    }
  };

  for (const row of stream.scheduled) {
    push(Math.max(0, row.dueOffset), { count: 1, intervalDays: row.intervalDays, easeFactor: row.easeFactor });
  }

  const reviews = new Array<number>(horizonDays).fill(0);
  const newCards = new Array<number>(horizonDays).fill(0);
  let remaining = stream.newRemaining;
  let finishOffset: number | null = null;
  let lastPerDay = 0;
  let todayPace = { perDay: 0, paced: false, paused: false, threshold: 0 };
  const startWindow = deriveExamWindow({ ...stream, today });

  for (let day = 0; day < horizonDays; day += 1) {
    const date = addLocalDays(today, day);
    const window = deriveExamWindow({ ...stream, today: date });
    const cards = due.get(day) ?? [];
    const cap = window.maxIntervalDays;

    const waitingToday = cards.reduce((sum, card) => sum + card.count, 0);

    reviews[day] = waitingToday * (1 + forgotten);

    for (const card of cards) {
      const interval = nextInterval(card, multiplier, cap);

      push(day + interval, { count: card.count, intervalDays: interval, easeFactor: card.easeFactor });
    }

    const usedToday = day === 0 ? stream.newUsedToday : 0;
    const pace = deriveNewCardPace({
      window,
      explicitPerDay: stream.explicitPerDay,
      fallbackPerDay: stream.fallbackPerDay,
      remainingAtDayStart: remaining + usedToday,
      today: date,
    });
    const waiting = day === 0 ? stream.waitingNow : waitingToday;
    const pause = deriveNewCardPause({ mode: window.mode, waitingReviews: waiting, perDay: pace.perDay });
    const served = pause.paused ? 0 : Math.min(remaining, Math.max(0, pace.perDay - usedToday));

    if (day === 0) {
      todayPace = { ...pace, paused: pause.paused, threshold: pause.threshold };
    }

    lastPerDay = pace.perDay;
    newCards[day] = served;
    remaining -= served;

    if (served > 0) {
      push(day + 1, { count: served, intervalDays: 1, easeFactor: NEW_CARD_EASE });
    }

    if (remaining === 0 && finishOffset === null && stream.newRemaining > 0) {
      finishOffset = day;
    }
  }

  const extrapolated = finishOffset === null && remaining > 0 && lastPerDay > 0;

  if (extrapolated) {
    finishOffset = horizonDays - 1 + Math.ceil(remaining / lastPerDay);
  }

  return {
    reviews,
    newCards,
    finishOffset,
    finishExtrapolated: extrapolated,
    lastPerDay,
    today: todayPace,
    window: startWindow,
  };
}

export function deriveStudyForecast(input: StudyForecastInput): StudyForecastResult {
  const { horizonDays, today } = input;
  const results = input.streams.map((stream) => simulateStream(stream, horizonDays, today));
  const days: StudyForecastDay[] = Array.from({ length: horizonDays }, (_, day) => ({
    date: addLocalDays(today, day),
    reviews: Math.round(results.reduce((sum, result) => sum + (result.reviews[day] ?? 0), 0)),
    newCards: results.reduce((sum, result) => sum + (result.newCards[day] ?? 0), 0),
  }));
  const total = days.reduce((sum, day) => sum + day.reviews, 0);
  const peak = days.reduce<StudyForecastDay | null>(
    (best, day) => (best === null || day.reviews > best.reviews ? day : best),
    null,
  );
  const needing = input.streams
    .map((stream, index) => ({ stream, result: results[index]! }))
    .filter(({ stream }) => stream.newRemaining > 0);
  const stuck = needing.some(({ result }) => result.finishOffset === null);
  const lastFinish = needing.reduce((latest, { result }) => Math.max(latest, result.finishOffset ?? 0), 0);
  const newFinishOn = needing.length === 0 || stuck ? null : addLocalDays(today, lastFinish);
  const examStreams = needing.filter(({ result }) => result.window.mode === "exam");
  const finishesBeforeExam =
    examStreams.length === 0 || stuck
      ? null
      : examStreams.every(
          ({ result }) =>
            result.finishOffset !== null &&
            result.window.examDate !== null &&
            addLocalDays(today, result.finishOffset) < result.window.examDate,
        );

  return {
    days,
    averagePerDay: horizonDays === 0 ? 0 : total / horizonDays,
    peakPerDay: peak?.reviews ?? 0,
    peakOn: peak && peak.reviews > 0 ? peak.date : null,
    newRemaining: input.streams.reduce((sum, stream) => sum + stream.newRemaining, 0),
    newFinishOn,
    finishesBeforeExam,
    todayPace: {
      perDay: results.reduce((sum, result) => sum + result.today.perDay, 0),
      paced: results.some((result) => result.today.paced),
      paused: results.some((result) => result.today.paused),
      threshold: results.reduce((max, result) => Math.max(max, result.today.threshold), 0),
    },
  };
}
