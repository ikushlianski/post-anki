import type { StudyForecast } from '@post-anki/shared'

export const examForecast: StudyForecast = {
  intent: 'exam',
  examDate: '2026-12-20',
  daysLeft: 40,
  examPassed: false,
  desiredRetention: 0.9,
  recentRetention: 0.88,
  maxIntervalDays: 39,
  hasCards: true,
  newCards: {
    perDay: 10,
    paced: true,
    pausedToday: false,
    pauseThreshold: 200,
    remaining: 300,
    finishOn: '2026-11-30',
    finishesBeforeExam: true,
  },
  reviews: { dueToday: 34, averagePerDay: 52.4, peakPerDay: 80, peakOn: '2026-11-04', horizonDays: 40 },
  days: [],
}

export const emptyForecast: StudyForecast = {
  ...examForecast,
  intent: 'long_term',
  examDate: null,
  daysLeft: null,
  maxIntervalDays: 180,
  hasCards: false,
  recentRetention: null,
  newCards: { ...examForecast.newCards, perDay: 20, paced: false, remaining: 0, finishOn: null, finishesBeforeExam: null },
  reviews: { dueToday: 0, averagePerDay: 0, peakPerDay: 0, peakOn: null, horizonDays: 30 },
}
