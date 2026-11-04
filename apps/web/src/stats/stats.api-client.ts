import type { ZodType } from 'zod'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import {
  aiSpendSchema,
  learningStatsSchema,
  type AiSpend,
  type LearningStats,
  type StatsQuery,
} from './stats.types'

async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}${path}`, { headers: authHeaders() })

  if (!response.ok) {
    throw new Error(`api GET ${path} → ${response.status}`)
  }

  return schema.parse(await response.json())
}

function queryString(query: StatsQuery): string {
  return new URLSearchParams({ tz: query.tz, days: String(query.days) }).toString()
}

export async function getLearningStats(query: StatsQuery): Promise<LearningStats> {
  return request(`/stats/learning?${queryString(query)}`, learningStatsSchema)
}

export async function getAiSpend(query: StatsQuery): Promise<AiSpend> {
  return request(`/stats/ai-spend?${queryString(query)}`, aiSpendSchema)
}
