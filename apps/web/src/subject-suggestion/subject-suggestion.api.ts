import { createServerFn } from '@tanstack/react-start'
import type {
  ResolveSubjectSuggestionInput,
  SubjectSuggestion,
  SubjectSuggestionStatus,
  TriggerSubjectSuggestionScanResult,
} from '@post-anki/shared'

import {
  listSubjectSuggestions as apiListSubjectSuggestions,
  resolveSubjectSuggestion as apiResolveSubjectSuggestion,
  triggerSubjectSuggestionScan as apiTriggerSubjectSuggestionScan,
  type ResolveSubjectSuggestionResult,
} from '../curriculum/api-client'

export const runSubjectSuggestionScan = createServerFn({ method: 'POST' }).handler(
  (): Promise<TriggerSubjectSuggestionScanResult> => apiTriggerSubjectSuggestionScan(),
)

export const listPendingSubjectSuggestions = createServerFn({ method: 'GET' })
  .inputValidator((status?: SubjectSuggestionStatus) => status)
  .handler(({ data }): Promise<SubjectSuggestion[]> => apiListSubjectSuggestions(data))

export const resolveSubjectSuggestion = createServerFn({ method: 'POST' })
  .inputValidator((data: { suggestionId: string; input: ResolveSubjectSuggestionInput }) => data)
  .handler(
    ({ data }): Promise<ResolveSubjectSuggestionResult> =>
      apiResolveSubjectSuggestion(data.suggestionId, data.input),
  )
