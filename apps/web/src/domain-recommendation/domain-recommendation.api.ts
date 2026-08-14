import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { DomainRecommendation, DomainRecommendationStatus } from '@post-anki/shared'

import {
  listDomainRecommendations,
  resolveDomainRecommendation,
  triggerDomainRecommendations,
} from '../curriculum/api-client'
import type { ResolveDocScanSuggestionResult } from '../curriculum/api-client'

// deepen-widen-recommendations (issue #90) — three server functions wrapping
// the domain-recommendation routes, same shape as domain-map.api.ts's own
// priority-review additions.

export const triggerRecommendations = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DomainRecommendation[]> => triggerDomainRecommendations(data))

export const getDomainRecommendations = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { subjectId: string; status?: DomainRecommendationStatus }) => data,
  )
  .handler(({ data }): Promise<DomainRecommendation[]> =>
    listDomainRecommendations(data.subjectId, data.status),
  )

// A 409 already_resolved arrives here as an outcome, not a thrown error
// (mirrors resolveDocScanTopicSuggestion's own posture) — the panel's catch
// block stays reserved for real failures.
export const resolveRecommendation = createServerFn({ method: 'POST' })
  .inputValidator((data: { recommendationId: string; status: 'accepted' | 'rejected' }) => data)
  .handler(({ data }): Promise<ResolveDocScanSuggestionResult<DomainRecommendation>> =>
    resolveDomainRecommendation(data.recommendationId, data.status),
  )
