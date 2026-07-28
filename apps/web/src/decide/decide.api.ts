import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { DecideBlindSpot, DecideInput, DecideSession } from './decide.model'

async function apiRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? 'GET',
    headers: authHeaders(),
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })

  if (!response.ok) {
    throw new Error(`api ${init?.method ?? 'GET'} ${path} → ${response.status}`)
  }

  return (await response.json()) as T
}

export async function decide(input: DecideInput): Promise<DecideSession> {
  return apiRequest<DecideSession>('/decide-sessions', { method: 'POST', body: input })
}

export async function listDecideSessions(): Promise<DecideSession[]> {
  return apiRequest<DecideSession[]>('/decide-sessions')
}

export async function resolveDecideBlindSpot(
  blindSpotId: string,
  status: 'accepted' | 'rejected',
): Promise<DecideBlindSpot> {
  return apiRequest<DecideBlindSpot>(`/decide-blind-spots/${blindSpotId}`, {
    method: 'PATCH',
    body: { status },
  })
}
