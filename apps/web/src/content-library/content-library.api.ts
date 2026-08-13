import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { resolveSourceDuplicateSuggestionInput, sourceDuplicateSuggestionStatusSchema } from '@post-anki/shared'

import * as api from './content-library.api-client'

const sourceIdInput = z.string().min(1)

const resolveSuggestionInput = z.object({
  suggestionId: z.string().min(1),
  input: resolveSourceDuplicateSuggestionInput,
})

export const listLibrarySources = createServerFn({ method: 'GET' }).handler(() =>
  api.listLibrarySources(),
)

export const refetchSource = createServerFn({ method: 'POST' })
  .inputValidator((sourceId: unknown) => sourceIdInput.parse(sourceId))
  .handler(({ data }) => api.refetchSource(data))

export const triggerSourceDuplicateScan = createServerFn({ method: 'POST' }).handler(() =>
  api.triggerSourceDuplicateScan(),
)

export const listSourceDuplicateSuggestions = createServerFn({ method: 'GET' })
  .inputValidator((status?: unknown) => sourceDuplicateSuggestionStatusSchema.optional().parse(status))
  .handler(({ data }) => api.listSourceDuplicateSuggestions(data))

export const resolveSourceDuplicateSuggestion = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => resolveSuggestionInput.parse(data))
  .handler(({ data }) => api.resolveSourceDuplicateSuggestion(data.suggestionId, data.input))
