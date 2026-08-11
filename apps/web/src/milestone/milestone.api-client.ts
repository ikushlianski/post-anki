import type { Milestone } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult } from './milestone.model'

async function request<T>(path: string): Promise<ApiResult<T>> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  })

  if (!response.ok) {
    const body = await response
      .clone()
      .json()
      .then((parsed: { error?: string; message?: unknown }) => parsed)
      .catch(() => ({}) as { error?: string; message?: unknown })

    return {
      ok: false,
      status: response.status,
      code: body.error ?? 'request_failed',
      message: typeof body.message === 'string' ? body.message : null,
    }
  }

  return { ok: true, data: (await response.json()) as T }
}

export async function listMilestones(): Promise<ApiResult<Milestone[]>> {
  return request<Milestone[]>('/milestones')
}
