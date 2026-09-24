import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolvePlacementSuggestionInput, type PendingPlacementSuggestion } from '@post-anki/shared'

import {
  listPendingPlacementSuggestions,
  resolvePlacementSuggestion,
  type ResolvePlacementSuggestionResult,
} from '../curriculum/api-client'

const resolvePlacementSuggestionStatusInput = z
  .object({ bitId: z.string().min(1) })
  .and(resolvePlacementSuggestionInput)

export const getPendingPlacementSuggestions = createServerFn({ method: 'GET' }).handler(
  (): Promise<PendingPlacementSuggestion[]> => listPendingPlacementSuggestions(),
)

export const resolvePlacementSuggestionStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => resolvePlacementSuggestionStatusInput.parse(data))
  .handler(({ data }): Promise<ResolvePlacementSuggestionResult> =>
    data.status === 'accepted'
      ? resolvePlacementSuggestion(data.bitId, 'accepted', data.moduleId, data.title)
      : resolvePlacementSuggestion(data.bitId, 'rejected'),
  )
