import { createServerFn } from '@tanstack/react-start'
import type {
  ResolveSubjectDuplicateSuggestionInput,
  SubjectDuplicateSuggestion,
  SubjectDuplicateSuggestionStatus,
  TriggerSubjectDuplicateScanResult,
} from '@post-anki/shared'

import {
  listSubjectDuplicateSuggestions as apiListSubjectDuplicateSuggestions,
  resolveSubjectDuplicateSuggestion as apiResolveSubjectDuplicateSuggestion,
  triggerSubjectDuplicateScan as apiTriggerSubjectDuplicateScan,
} from '../curriculum/api-client'

// ai-duplicate-detection (issue #63) — TanStack server-fn wrappers, mirrors
// domain-map.api.ts's shape (thin inputValidator + handler pairs around the
// api-client's raw fetch wrappers).

export const scanForDuplicates = createServerFn({ method: 'POST' }).handler(
  (): Promise<TriggerSubjectDuplicateScanResult> => apiTriggerSubjectDuplicateScan(),
)

export const listPendingDuplicateSuggestions = createServerFn({ method: 'GET' })
  .inputValidator((status?: SubjectDuplicateSuggestionStatus) => status)
  .handler(({ data }): Promise<SubjectDuplicateSuggestion[]> =>
    apiListSubjectDuplicateSuggestions(data),
  )

export const resolveDuplicateSuggestion = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { suggestionId: string; input: ResolveSubjectDuplicateSuggestionInput }) => data,
  )
  .handler(({ data }): Promise<SubjectDuplicateSuggestion> =>
    apiResolveSubjectDuplicateSuggestion(data.suggestionId, data.input),
  )
