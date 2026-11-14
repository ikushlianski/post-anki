import { createServerFn } from '@tanstack/react-start'

import {
  createApiTokenInputSchema,
  type CreatedApiToken,
  type ListApiTokensResponse,
} from '@post-anki/shared'
import { z } from 'zod'
import { request } from '../curriculum/api-client'

export const listApiTokens = createServerFn({ method: 'GET' }).handler(
  (): Promise<ListApiTokensResponse> => request<ListApiTokensResponse>('/api-tokens'),
)

export const createApiToken = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createApiTokenInputSchema.parse(data))
  .handler(
    ({ data }): Promise<CreatedApiToken> =>
      request<CreatedApiToken>('/api-tokens', { method: 'POST', body: data }),
  )

export const revokeApiToken = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(
    ({ data }): Promise<{ id: string; revoked: true }> =>
      request(`/api-tokens/${encodeURIComponent(data.id)}`, { method: 'DELETE' }),
  )
