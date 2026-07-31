import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  DepthLevel,
  DocScanResult,
  DocScanSuggestionsResponse,
  DomainNode,
  DomainNodeTreeItem,
  DomainPriorityReviewStatus,
  DomainPrioritySuggestion,
  DomainPrioritySuggestionStatus,
  DomainSuggestionStatus,
  DomainSupersessionSuggestion,
  DomainTopicSuggestion,
  MergeDomainNodesResult,
} from '@post-anki/shared'

import {
  getDomainMap,
  getDomainPriorityReviewStatus,
  listDocScanSuggestions,
  listPrioritySuggestions,
  listSubjects,
  mergeDomainNodes as apiMergeDomainNodes,
  resolveDomainSupersessionSuggestion,
  resolveDomainTopicSuggestion,
  resolvePrioritySuggestion,
  setCurriculumDomainNode,
  triggerDocScan,
  triggerDomainPriorityReview,
  updateDomainNodeTargetDepth,
} from '../curriculum/api-client'
import type { Curriculum, Subject } from '../curriculum/model'

// SSR-first, loader-seeded — deliberately not Electric-dependent (see
// spec.md's own note on subject.$subjectId.map.tsx: this view has no
// live-multi-client requirement, so it stays on the simpler
// loader/router.invalidate() pattern rather than reintroducing the
// Electric-only-read risk the batch-practice-electric-fallback item fixed
// elsewhere).
export const getDomainMapForSubject = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DomainNodeTreeItem[]> => getDomainMap(data))

// No dedicated GET /subjects/:id endpoint exists — mirrors getBoard()'s own
// approach of listing every subject and finding the one needed, rather than
// adding a new backend route for a single lookup this route alone needs.
export const getSubjectForMap = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(async ({ data }): Promise<Subject | null> => {
    const subjects = await listSubjects()

    return subjects.find((subject) => subject.id === data) ?? null
  })

// domain-node-merge (issue #61) — absorbs a source domain node into a target,
// same server-fn wrapper shape as changeCurriculumPlacement below.
export const mergeDomainNodes = createServerFn({ method: 'POST' })
  .inputValidator((data: { targetDomainNodeId: string; sourceDomainNodeId: string }) => data)
  .handler(({ data }): Promise<MergeDomainNodesResult> =>
    apiMergeDomainNodes(data.targetDomainNodeId, data.sourceDomainNodeId),
  )

export const changeCurriculumPlacement = createServerFn({ method: 'POST' })
  .inputValidator((data: { curriculumId: string; domainNodeId: string | null }) => data)
  .handler(({ data }): Promise<Curriculum> =>
    setCurriculumDomainNode(data.curriculumId, data.domainNodeId),
  )

// domain-priority-review (issue #52) additions below.

export const setDomainNodeTargetDepth = createServerFn({ method: 'POST' })
  .inputValidator((data: { nodeId: string; targetDepth: DepthLevel | null }) => data)
  .handler(({ data }): Promise<DomainNode> =>
    updateDomainNodeTargetDepth(data.nodeId, data.targetDepth),
  )

export const triggerPriorityReview = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DomainPrioritySuggestion[]> => triggerDomainPriorityReview(data))

export const getPrioritySuggestions = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { subjectId: string; status?: DomainPrioritySuggestionStatus }) => data,
  )
  .handler(({ data }): Promise<DomainPrioritySuggestion[]> =>
    listPrioritySuggestions(data.subjectId, data.status),
  )

export const resolveSuggestionStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { suggestionId: string; status: 'accepted' | 'rejected' }) => data)
  .handler(({ data }): Promise<DomainPrioritySuggestion> =>
    resolvePrioritySuggestion(data.suggestionId, data.status),
  )

export const getPriorityReviewStatus = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DomainPriorityReviewStatus> => getDomainPriorityReviewStatus(data))

// doc-changelog-scan (issue #49) additions below.

export const runDocScan = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DocScanResult> => triggerDocScan(data))

export const getDocScanSuggestions = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { subjectId: string; status?: DomainSuggestionStatus }) => data,
  )
  .handler(({ data }): Promise<DocScanSuggestionsResponse> =>
    listDocScanSuggestions(data.subjectId, data.status),
  )

export const resolveDocScanTopicSuggestion = createServerFn({ method: 'POST' })
  .inputValidator((data: { suggestionId: string; status: 'accepted' | 'rejected' }) => data)
  .handler(({ data }): Promise<DomainTopicSuggestion> =>
    resolveDomainTopicSuggestion(data.suggestionId, data.status),
  )

export const resolveDocScanSupersessionSuggestion = createServerFn({ method: 'POST' })
  .inputValidator((data: { suggestionId: string; status: 'accepted' | 'rejected' }) => data)
  .handler(({ data }): Promise<DomainSupersessionSuggestion> =>
    resolveDomainSupersessionSuggestion(data.suggestionId, data.status),
  )
