import type {
  LibrarySource,
  RefetchSourceResult,
  ResolveSourceDuplicateSuggestionInput,
  SourceDuplicateSuggestion,
  SourceDuplicateSuggestionStatus,
  TriggerSourceDuplicateScanResult,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult } from './content-library.model'

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

export async function listLibrarySources(): Promise<LibrarySource[]> {
  const result = await request<LibrarySource[]>('/sources')

  return requireOk(result, '/sources')
}

export async function refetchSource(sourceId: string): Promise<ApiResult<RefetchSourceResult>> {
  return request<RefetchSourceResult>(`/sources/${sourceId}/refetch`, { method: 'POST' })
}

export async function triggerSourceDuplicateScan(): Promise<
  ApiResult<TriggerSourceDuplicateScanResult>
> {
  return request<TriggerSourceDuplicateScanResult>('/source-duplicate-scans', {
    method: 'POST',
  })
}

export async function listSourceDuplicateSuggestions(
  status?: SourceDuplicateSuggestionStatus,
): Promise<SourceDuplicateSuggestion[]> {
  const query = status ? `?status=${status}` : ''
  const result = await request<SourceDuplicateSuggestion[]>(
    `/source-duplicate-suggestions${query}`,
  )

  return requireOk(result, '/source-duplicate-suggestions')
}

export async function resolveSourceDuplicateSuggestion(
  suggestionId: string,
  input: ResolveSourceDuplicateSuggestionInput,
): Promise<ApiResult<SourceDuplicateSuggestion>> {
  return request<SourceDuplicateSuggestion>(`/source-duplicate-suggestions/${suggestionId}`, {
    method: 'PATCH',
    body: input,
  })
}
