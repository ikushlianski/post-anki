import type {
  LearningPath,
  LearningPathDetail,
  ListRoleTemplatesResponse,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type { ApiResult, CreateLearningPathResponse, StepPushResult } from './learning-path.model'

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

export async function listRoleTemplates(): Promise<ListRoleTemplatesResponse> {
  const result = await request<ListRoleTemplatesResponse>('/role-templates')

  return requireOk(result, '/role-templates')
}

export async function createLearningPath(input: {
  roleTemplateId: string
}): Promise<ApiResult<CreateLearningPathResponse>> {
  return request<CreateLearningPathResponse>('/learning-paths', {
    method: 'POST',
    body: input,
  })
}

export async function listLearningPaths(input: {
  onlyActive: boolean
}): Promise<LearningPath[]> {
  const query = input.onlyActive ? '?status=active' : ''
  const result = await request<LearningPath[]>(`/learning-paths${query}`)

  return requireOk(result, '/learning-paths')
}

export async function getLearningPath(
  pathId: string,
): Promise<ApiResult<LearningPathDetail>> {
  return request<LearningPathDetail>(`/learning-paths/${pathId}`)
}

export async function abandonLearningPath(
  pathId: string,
): Promise<ApiResult<LearningPath>> {
  return request<LearningPath>(`/learning-paths/${pathId}`, {
    method: 'PATCH',
    body: { status: 'abandoned' },
  })
}

export async function getLearningPathStepPush(input: {
  pathId: string
  stepDomainNodeId: string
}): Promise<ApiResult<StepPushResult>> {
  return request<StepPushResult>(
    `/learning-paths/${input.pathId}/steps/${input.stepDomainNodeId}/push`,
  )
}
