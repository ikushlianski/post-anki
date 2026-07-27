import type {
  Phrase,
  PhraseBankUpdate,
  PracticeAttempt,
  PracticeSettings,
  SubmitAttemptsInput,
  UpdatePracticeSettingsInput,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

type GradedAttempt = Omit<PracticeAttempt, 'createdAt'>

export interface SubmitAttemptsResult {
  attempts: GradedAttempt[]
  phraseBankUpdates: PhraseBankUpdate[]
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
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

export async function getPracticeSettings(subjectId: string): Promise<PracticeSettings> {
  return request(`/subjects/${subjectId}/practice-settings`)
}

export async function updatePracticeSettings(
  input: UpdatePracticeSettingsInput & { subjectId: string },
): Promise<PracticeSettings> {
  const { subjectId, ...patch } = input

  return request(`/subjects/${subjectId}/practice-settings`, {
    method: 'PATCH',
    body: patch,
  })
}

export async function generatePhraseBatch(
  subjectId: string,
): Promise<{ batchId: string; phrases: Phrase[] }> {
  const result = await request<{ phrases: Phrase[] }>(
    `/subjects/${subjectId}/phrase-batches`,
    { method: 'POST' },
  )
  const batchId = result.phrases[0]?.batchId

  if (!batchId) {
    throw new Error('phrase batch generation returned no phrases')
  }

  return { batchId, phrases: result.phrases }
}

export async function submitAttempts(
  input: SubmitAttemptsInput & { subjectId: string },
): Promise<SubmitAttemptsResult> {
  const { subjectId, ...body } = input

  return request<SubmitAttemptsResult>(`/subjects/${subjectId}/attempts`, {
    method: 'POST',
    body,
  })
}
