import type {
  CreateStudySessionInput,
  EndStudySessionInput,
  ListStudySessionsResponse,
  QuestionKind,
  RecordStudySessionAnswerInput,
  StudySession,
  StudySessionConsistency,
  StudySessionPushResponse,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult } from './study-session.model'

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
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

async function requireOk<T>(result: ApiResult<T>, path: string): Promise<T> {
  if (!result.ok) {
    throw new Error(`api ${path} → ${result.status} ${result.code}`)
  }

  return result.data
}

export async function listStudySessions(): Promise<ListStudySessionsResponse> {
  const result = await request<ListStudySessionsResponse>('/study-sessions')

  return requireOk(result, '/study-sessions')
}

export async function getStudySessionConsistency(
  windowDays?: number,
): Promise<StudySessionConsistency> {
  const query = windowDays ? `?windowDays=${windowDays}` : ''
  const result = await request<StudySessionConsistency>(`/study-sessions/consistency${query}`)

  return requireOk(result, '/study-sessions/consistency')
}

export async function createStudySession(
  input: CreateStudySessionInput,
): Promise<ApiResult<StudySession>> {
  return request<StudySession>('/study-sessions', { method: 'POST', body: input })
}

export async function getStudySession(sessionId: string): Promise<ApiResult<StudySession>> {
  return request<StudySession>(`/study-sessions/${sessionId}`)
}

export async function startStudySession(sessionId: string): Promise<ApiResult<StudySession>> {
  return request<StudySession>(`/study-sessions/${sessionId}/start`, { method: 'PATCH' })
}

export async function endStudySession(
  sessionId: string,
  input: EndStudySessionInput,
): Promise<ApiResult<StudySession>> {
  return request<StudySession>(`/study-sessions/${sessionId}/end`, {
    method: 'PATCH',
    body: input,
  })
}

export async function recordStudySessionAnswer(
  sessionId: string,
  input: RecordStudySessionAnswerInput,
): Promise<ApiResult<StudySession>> {
  return request<StudySession>(`/study-sessions/${sessionId}/answers`, {
    method: 'PATCH',
    body: input,
  })
}

export async function getStudySessionPush(input: {
  sessionId: string
  excludeGapIds: string[]
  mode: QuestionKind
}): Promise<ApiResult<StudySessionPushResponse>> {
  const params = new URLSearchParams()

  if (input.excludeGapIds.length > 0) {
    params.set('excludeGapIds', input.excludeGapIds.join(','))
  }

  params.set('mode', input.mode)

  return request<StudySessionPushResponse>(
    `/study-sessions/${input.sessionId}/push?${params.toString()}`,
  )
}
