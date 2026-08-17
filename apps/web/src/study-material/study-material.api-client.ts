import type { StudyMaterial, StudyMaterialKind } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult } from './study-material.model'

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

export async function requestStudyMaterial(
  topicId: string,
  kind: StudyMaterialKind,
): Promise<ApiResult<StudyMaterial>> {
  return request<StudyMaterial>(`/topics/${topicId}/study-materials`, {
    method: 'POST',
    body: { kind },
  })
}

export async function listStudyMaterials(
  topicId: string,
): Promise<ApiResult<StudyMaterial[]>> {
  return request<StudyMaterial[]>(`/topics/${topicId}/study-materials`)
}
