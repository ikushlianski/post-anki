import type { GoalStreak, ProgressView, SessionSummary, TodayView, WeeklySummary } from '@post-anki/shared'

export const goalStreak = (overrides: Partial<GoalStreak> = {}): GoalStreak => ({
  status: 'active',
  current: 5,
  longest: 9,
  restDaysLeft: 2,
  pausedUntil: null,
  comeback: false,
  previousStreak: 0,
  activeDaysLast30: 20,
  ...overrides,
})

export const todayView = (overrides: Partial<TodayView> = {}): TodayView => ({
  date: '2090-03-10',
  reviewsDone: 2,
  threshold: 5,
  thresholdIsGoal: false,
  dayQualified: false,
  streak: goalStreak(),
  ...overrides,
})

export const sessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  doneToday: 30,
  goalTarget: 25,
  goalMet: true,
  bonus: 5,
  newlySolid: 12,
  tomorrowDue: 18,
  tomorrowMinutes: 6,
  streak: goalStreak(),
  surprise: null,
  ...overrides,
})

export const weeklySummary = (overrides: Partial<WeeklySummary> = {}): WeeklySummary => ({
  weekStart: '2090-03-06',
  weekEnd: '2090-03-12',
  goalDays: 3,
  activeDays: 4,
  reviews: 80,
  reviewsLastWeek: 100,
  newlySolid: 7,
  focusMet: 1,
  focusTotal: 2,
  nextWeekKey: '2090-W11',
  needsNextWeekPriorities: true,
  ...overrides,
})

export const progressView = (overrides: Partial<ProgressView> = {}): ProgressView => ({
  heatmap: [
    { date: '2090-03-08', reviews: 0 },
    { date: '2090-03-09', reviews: 5 },
    { date: '2090-03-10', reviews: 20 },
  ],
  dailyAverage: 12.5,
  solidByWeek: [],
  solidThisWeek: 4,
  retentionOlderCards: 88,
  retentionSample: 40,
  subjects: [
    {
      subjectId: 's1',
      subjectName: 'Math',
      totalCards: 10,
      masteredCards: 4,
      percent: 40,
      solidThisWeek: 2,
      solidThisMonth: 3,
      reviewsThisWeek: 30,
      reviewsLastWeek: 20,
    },
  ],
  ...overrides,
})
