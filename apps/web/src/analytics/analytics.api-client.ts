import type {
  ChatQueueOutcomesStatistics,
  CoverageReport,
  RetentionReport,
  NothingExtractedStatistics,
  RejectReasonsStatistics,
  ReviewStatistics,
  ReviewStatisticsQuery,
  WeeklyDigest,
  WeeklyDigestCard,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

async function request<T>(path: string): Promise<T> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}${path}`, { headers: authHeaders() })

  if (!response.ok) {
    throw new Error(`api GET ${path} → ${response.status}`)
  }

  return (await response.json()) as T
}

export async function getCoverageReport(): Promise<CoverageReport> {
  return request<CoverageReport>('/analytics/coverage')
}

export async function getRetentionReport(): Promise<RetentionReport> {
  return request<RetentionReport>('/analytics/retention')
}

export async function getWeeklyDigest(): Promise<WeeklyDigest> {
  return request<WeeklyDigest>('/analytics/digest')
}

export async function getReviewStatistics(query: ReviewStatisticsQuery): Promise<ReviewStatistics> {
  const params = new URLSearchParams({
    tz: query.tz,
    forecastDays: String(query.forecastDays),
    historyDays: String(query.historyDays),
  })

  if (query.subjectId) {
    params.set('subjectId', query.subjectId)
  }

  return request<ReviewStatistics>(`/analytics/review-statistics?${params.toString()}`)
}

export async function getRejectReasonsStatistics(): Promise<RejectReasonsStatistics> {
  return request<RejectReasonsStatistics>('/analytics/reject-reasons')
}

export async function getNothingExtractedStatistics(): Promise<NothingExtractedStatistics> {
  return request<NothingExtractedStatistics>('/analytics/nothing-extracted')
}

export async function getWeeklyDigestCard(): Promise<WeeklyDigestCard> {
  return request<WeeklyDigestCard>('/analytics/weekly-digest')
}

export async function getChatQueueOutcomesStatistics(): Promise<ChatQueueOutcomesStatistics> {
  return request<ChatQueueOutcomesStatistics>('/analytics/chat-queue-outcomes')
}
