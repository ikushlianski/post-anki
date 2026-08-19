import type * as be from '@post-anki/shared'

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

export async function getHomeSummary(): Promise<be.HomeSummary | null> {
  try {
    return await request<be.HomeSummary>('/home/summary')
  } catch {
    return null
  }
}
