import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  createNotionIngestionSourceInput,
  saveNotionConnectionInput,
  updateNotionIngestionSourceInput,
  type NotionConnectionCheckResult,
  type NotionConnectionStatus,
  type NotionIngestionSource,
  type NotionRunResult,
} from '@post-anki/shared'
import { ApiError, request } from '../curriculum/api-client'
import type { NotionApiResult } from './notion-api-result'

async function toResult<T>(call: () => Promise<T>): Promise<NotionApiResult<T>> {
  try {
    return { ok: true, data: await call() }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, status: error.status, code: error.code ?? null }
    }

    return { ok: false, status: 0, code: null }
  }
}

const idInput = z.object({ id: z.string().min(1) })

export const listNotionSources = createServerFn({ method: 'GET' }).handler(() =>
  toResult(async () => (await request<{ sources: NotionIngestionSource[] }>('/notion-sources')).sources),
)

export const createNotionSource = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createNotionIngestionSourceInput.parse(data))
  .handler(({ data }) =>
    toResult(() => request<NotionIngestionSource>('/notion-sources', { method: 'POST', body: data })),
  )

export const updateNotionSource = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    idInput.extend({ patch: updateNotionIngestionSourceInput }).parse(data),
  )
  .handler(({ data }) =>
    toResult(() =>
      request<NotionIngestionSource>(`/notion-sources/${encodeURIComponent(data.id)}`, {
        method: 'PATCH',
        body: data.patch,
      }),
    ),
  )

export const deleteNotionSource = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(({ data }) =>
    toResult(() =>
      request<{ deleted: boolean }>(`/notion-sources/${encodeURIComponent(data.id)}`, { method: 'DELETE' }),
    ),
  )

export const runNotionSource = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(({ data }) =>
    toResult(() =>
      request<NotionRunResult>(`/notion-sources/${encodeURIComponent(data.id)}/runs`, {
        method: 'POST',
        timeoutMs: 300_000,
      }),
    ),
  )

export const getNotionConnection = createServerFn({ method: 'GET' }).handler(() =>
  toResult(() => request<NotionConnectionStatus>('/notion-connection')),
)

export const saveNotionToken = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => saveNotionConnectionInput.parse(data))
  .handler(({ data }) =>
    toResult(() => request<NotionConnectionStatus>('/notion-connection', { method: 'PUT', body: data })),
  )

export const removeNotionToken = createServerFn({ method: 'POST' }).handler(() =>
  toResult(() => request<NotionConnectionStatus>('/notion-connection', { method: 'DELETE' })),
)

export const checkNotionConnection = createServerFn({ method: 'POST' }).handler(() =>
  toResult(() => request<NotionConnectionCheckResult>('/notion-connection/checks', { method: 'POST' })),
)
