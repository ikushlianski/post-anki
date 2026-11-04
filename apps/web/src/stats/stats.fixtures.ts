import type { AiSpend, LearningStats } from './stats.types'

export const learningFixture: LearningStats = {
  today: { reviews: 12, newCards: 3 },
  daily: [
    { date: '2026-10-27', reviews: 20, newCards: 5, passed: 18, studyMs: 60000 },
    { date: '2026-10-28', reviews: 0, newCards: 0, passed: 0, studyMs: 0 },
    { date: '2026-10-29', reviews: 12, newCards: 3, passed: 10, studyMs: 40000 },
  ],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: hour === 9 ? 15 : 0 })),
  streak: { current: 4, longest: 11 },
  accuracy: { overall: 0.85, last7: 0.9 },
  env: 'development',
}

export const spendFixture: AiSpend = {
  currency: 'USD',
  estimated: true,
  days: [
    { date: '2026-10-28', cardsUsd: 0.1, chatUsd: 0.05, otherUsd: 0 },
    { date: '2026-10-29', cardsUsd: 0.2, chatUsd: 0.3, otherUsd: 0.01 },
  ],
  totals: { cardsUsd: 0.3, chatUsd: 0.35, otherUsd: 0.01 },
  byModel: [
    { modelId: 'deepseek-v4-flash', usd: 0.5 },
    { modelId: 'gpt-4o-mini', usd: 0.16 },
  ],
  triageByModel: [
    { modelId: 'openai/gpt-5', kept: 12, rejected: 3 },
    { modelId: 'anthropic/claude-x', kept: 5, rejected: 9 },
  ],
  unpriced: { calls: 7, tokens: 1200 },
  env: 'development',
}

export const emptyLearningFixture: LearningStats = {
  ...learningFixture,
  today: { reviews: 0, newCards: 0 },
  daily: [],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: 0 })),
  streak: { current: 0, longest: 0 },
  accuracy: { overall: null, last7: null },
}

export const emptySpendFixture: AiSpend = {
  ...spendFixture,
  days: [],
  totals: { cardsUsd: 0, chatUsd: 0, otherUsd: 0 },
  byModel: [],
  triageByModel: [],
  unpriced: { calls: 0, tokens: 0 },
}
