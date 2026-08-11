import type {
  CaptureLearningListItemInput,
  DepthLevel,
  LearningListItem,
  LearningStatus,
  LivenessStatus,
  NudgeResponseInput,
} from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import type {
  ApiResult,
  LearningListItemWithLiveness,
} from './learning-list.model'

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

async function requestDiscardingBody(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<null>> {
  const result = await request<unknown>(path, init)

  return result.ok ? { ok: true, data: null } : result
}

async function requireOk<T>(result: ApiResult<T>, path: string): Promise<T> {
  if (!result.ok) {
    throw new Error(`api ${path} → ${result.status} ${result.code}`)
  }

  return result.data
}

export async function captureLearningListItem(
  input: CaptureLearningListItemInput,
): Promise<ApiResult<LearningListItem>> {
  return request<LearningListItem>('/learning-list-items', {
    method: 'POST',
    body: input,
  })
}

export async function listLearningListItems(): Promise<
  LearningListItemWithLiveness[]
> {
  const result = await request<LearningListItemWithLiveness[]>(
    '/learning-list-items',
  )

  return requireOk(result, '/learning-list-items')
}

export async function getLearningListItem(
  itemId: string,
): Promise<LearningListItemWithLiveness> {
  const result = await request<LearningListItemWithLiveness>(
    `/learning-list-items/${itemId}`,
  )

  return requireOk(result, `/learning-list-items/${itemId}`)
}

export async function resolveRecommendation(input: {
  itemId: string
  decision: 'approve' | 'decline'
}): Promise<ApiResult<null>> {
  return requestDiscardingBody(
    `/learning-list-items/${input.itemId}/recommendation`,
    { method: 'PATCH', body: { decision: input.decision } },
  )
}

export async function respondToNudge(
  input: NudgeResponseInput,
): Promise<ApiResult<LivenessStatus>> {
  return request<LivenessStatus>('/nudge-responses', {
    method: 'POST',
    body: input,
  })
}

export async function electTopicDepth(input: {
  topicId: string
  depth: DepthLevel
  learningStatus: LearningStatus
  depthElectedAt?: string
}): Promise<ApiResult<null>> {
  return requestDiscardingBody(`/topics/${input.topicId}`, {
    method: 'PATCH',
    body: {
      depth: input.depth,
      learningStatus: input.learningStatus,
      depthElectedAt: input.depthElectedAt,
    },
  })
}

export async function declineHeadroomOffer(input: {
  topicId: string
  headroomOfferedAt: string
}): Promise<ApiResult<null>> {
  return requestDiscardingBody(`/topics/${input.topicId}`, {
    method: 'PATCH',
    body: { headroomOfferedAt: input.headroomOfferedAt },
  })
}
