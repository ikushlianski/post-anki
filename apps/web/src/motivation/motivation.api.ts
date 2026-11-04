import { createServerFn } from '@tanstack/react-start'
import {
  pauseStreakInput,
  updateMotivationSettingsInput,
  type GoalStreak,
  type MotivationSettings,
  type ProgressView,
  type SessionSummary,
  type TodayView,
  type WeeklySummary,
} from '@post-anki/shared'
import { request } from '../curriculum/api-client'

export const getMotivationSettings = createServerFn({ method: 'GET' }).handler(
  (): Promise<MotivationSettings> => request<MotivationSettings>('/motivation/settings'),
)

export const saveMotivationSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateMotivationSettingsInput.parse(data))
  .handler(
    ({ data }): Promise<MotivationSettings> =>
      request<MotivationSettings>('/motivation/settings', { method: 'PUT', body: data }),
  )

export const getMotivationToday = createServerFn({ method: 'GET' }).handler(
  (): Promise<TodayView> => request<TodayView>('/motivation/today'),
)

export const pauseGoalStreak = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => pauseStreakInput.parse(data))
  .handler(
    ({ data }): Promise<GoalStreak> => request<GoalStreak>('/motivation/streak/pause', { method: 'PUT', body: data }),
  )

export const getSessionSummary = createServerFn({ method: 'GET' }).handler(
  (): Promise<SessionSummary> => request<SessionSummary>('/motivation/session-summary'),
)

export const getMotivationProgress = createServerFn({ method: 'GET' }).handler(
  (): Promise<ProgressView> => request<ProgressView>('/motivation/progress'),
)

export const getWeeklySummary = createServerFn({ method: 'GET' }).handler(
  (): Promise<WeeklySummary> => request<WeeklySummary>('/motivation/weekly-summary'),
)
