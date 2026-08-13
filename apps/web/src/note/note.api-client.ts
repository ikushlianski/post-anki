import type {
  CaptureNoteInput,
  Concern,
  Note,
  NoteNodeType,
  NoteReviewResponse,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult } from './note.model'

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

export async function captureNote(
  input: CaptureNoteInput,
): Promise<ApiResult<Note>> {
  return request<Note>('/notes', { method: 'POST', body: input })
}

export async function listNotesForNode(
  nodeType: NoteNodeType,
  nodeId: string,
): Promise<ApiResult<Note[]>> {
  const query = new URLSearchParams({ nodeType, nodeId }).toString()

  return request<Note[]>(`/notes?${query}`)
}

export interface SearchNotesParams {
  query: string
  concern?: Concern
  domainNodeId?: string
}

export async function searchNotes(
  params: SearchNotesParams,
): Promise<ApiResult<Note[]>> {
  const search = new URLSearchParams({ query: params.query })

  if (params.concern) {
    search.set('concern', params.concern)
  }

  if (params.domainNodeId) {
    search.set('domainNodeId', params.domainNodeId)
  }

  return request<Note[]>(`/notes/search?${search.toString()}`)
}

export async function reviewNote(
  excludeIds: string[],
): Promise<ApiResult<NoteReviewResponse>> {
  const search =
    excludeIds.length > 0
      ? `?${new URLSearchParams({ excludeIds: excludeIds.join(',') }).toString()}`
      : ''

  return request<NoteReviewResponse>(`/notes/review${search}`)
}
