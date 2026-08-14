import type * as be from '@post-anki/shared'
import type {
  AttemptResult,
  Concern,
  ConcernSummary,
  CreateCurriculumInput,
  CreateSubjectInput,
  Curriculum,
  CurriculumDetail,
  CurriculumDomainNodeMapping,
  CurriculumStatus,
  DailyPushResult,
  Depth,
  Gap,
  LearningStatus,
  Lecture,
  LectureSourceCandidate,
  Module,
  NodeType,
  Question,
  QuestionKind,
  SourceDraft,
  Speed,
  Subject,
  Tag,
  TagChip,
  Topic,
  TopicCardSet,
  TopicProgress,
} from './model'

const DEFAULT_API_BASE_URL = 'http://localhost:8030'

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL

  return (url && url.trim() !== '' ? url : DEFAULT_API_BASE_URL).replace(/\/$/, '')
}

export function authHeaders(): Record<string, string> {
  const secret = process.env.API_SHARED_SECRET
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (secret && secret.trim() !== '') {
    headers.authorization = `Bearer ${secret}`
  }

  return headers
}

// Carries the HTTP status and the API's own `error` code (e.g.
// `not_shaping_structure`, `turn_in_progress`) alongside the usual `Error`
// shape, so a caller that needs to distinguish specific error responses
// (rather than treat every failure generically) can — see
// `submitStructureTurn` below for the one caller that currently does.
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
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
    const code = await response
      .clone()
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined)

    throw new ApiError(
      response.status,
      code,
      `api ${init?.method ?? 'GET'} ${path} → ${response.status}`,
    )
  }

  return (await response.json()) as T
}

const DEPTH_FROM_BE: Record<string, Depth> = {
  awareness: 'aware',
  working: 'working',
  deep: 'deep',
}

const DEPTH_TO_BE: Record<Depth, string> = {
  aware: 'awareness',
  working: 'working',
  deep: 'deep',
}

function mapDepth(beDepth: string): Depth {
  return DEPTH_FROM_BE[beDepth] ?? 'working'
}

function mapDepthNullable(beDepth: string | null): Depth | null {
  return beDepth === null ? null : mapDepth(beDepth)
}

function mapCurriculumDomainNodeMapping(
  mapping: be.CurriculumDomainNodeMapping,
): CurriculumDomainNodeMapping {
  return {
    id: mapping.id,
    curriculumId: mapping.curriculumId,
    domainNodeId: mapping.domainNodeId,
    depth: mapDepthNullable(mapping.depth),
    status: mapping.status,
    source: mapping.source,
    createdAt: mapping.createdAt,
    resolvedAt: mapping.resolvedAt,
  }
}

function mapGap(gap: be.Gap): Gap {
  return {
    id: gap.id,
    topicId: gap.topicId,
    label: gap.label,
    status: gap.state,
    depth: mapDepth(gap.depth),
    origin: gap.origin,
    wanted: gap.wanted,
    concern: gap.concern,
    socratic: '',
    // Generalized recall-gap mastery tracking (issue #57) — display
    // precedence: GapRow renders THIS status when present, never falling
    // back to `status` (spec.md Decision 2 addendum).
    mastery: gap.mastery ?? null,
  }
}

function mapProgress(
  progress: be.TopicProgress,
  gapsTotal = 0,
  gapsCovered = 0,
): TopicProgress {
  return {
    status: progress.status,
    maturity: progress.maturity,
    gapsTotal,
    gapsCovered,
    attempts: progress.attempts,
    lastInteractedAt: progress.lastInteractedAt,
  }
}

function mapTag(tag: be.Tag): Tag {
  return {
    id: tag.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
  }
}

function mapTagChip(tag: be.TagChip): TagChip {
  return {
    id: tag.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
    assignmentId: tag.assignmentId,
  }
}

function mapTopic(topic: be.Topic): Topic {
  const gaps = (topic.gaps ?? []).map(mapGap)
  const gapsCovered = gaps.filter((gap) => gap.status === 'covered').length

  return {
    id: topic.id,
    moduleId: topic.moduleId,
    title: topic.title,
    summary: topic.summary,
    order: topic.order,
    priority: topic.priority,
    included: topic.included,
    selfGrade: topic.selfGrade as Topic['selfGrade'],
    targetDepth: mapDepth(topic.depth),
    learningStatus: topic.learningStatus,
    gaps,
    progress: mapProgress(topic.progress, gaps.length, gapsCovered),
    tags: (topic.tags ?? []).map(mapTagChip),
    depthElectedAt: topic.depthElectedAt,
    headroomOfferedAt: topic.headroomOfferedAt ?? null,
  }
}

function mapModule(module: be.Module): Module {
  return {
    id: module.id,
    curriculumId: module.curriculumId,
    title: module.title,
    order: module.order,
    priority: module.priority,
    learningStatus: module.learningStatus,
    level: module.level,
    topics: module.topics.map(mapTopic),
    progress: module.progress,
    tags: (module.tags ?? []).map(mapTagChip),
  }
}

const STATUS_FROM_BE: Record<string, CurriculumStatus> = {
  draft: 'draft',
  curating: 'curating',
  awaiting_source_approval: 'awaiting_source_approval',
  shaping_structure: 'shaping_structure',
  ready: 'ready',
  confirmed: 'confirmed',
  failed: 'failed',
}

function mapCurriculum(curriculum: be.Curriculum): Curriculum {
  return {
    id: curriculum.id,
    subjectId: curriculum.subjectId,
    name: curriculum.name,
    description: curriculum.description,
    status: STATUS_FROM_BE[curriculum.status] ?? 'curating',
    learningStatus: curriculum.learningStatus,
    speed: curriculum.speed,
    hinting: curriculum.hinting,
    defaultDepth: mapDepth(curriculum.defaultDepth),
    origin: curriculum.origin,
    strictOrder: curriculum.strictOrder,
    preAssessmentCompletedAt: curriculum.preAssessmentCompletedAt,
    domainNodeId: curriculum.domainNodeId,
    order: curriculum.order,
  }
}

export async function listSubjects(): Promise<Subject[]> {
  return request<be.Subject[]>('/subjects')
}

export async function getDomainMap(subjectId: string): Promise<be.DomainNodeTreeItem[]> {
  return request<be.DomainNodeTreeItem[]>(`/subjects/${subjectId}/domain-map`)
}

// domain-node-merge (issue #61) — absorbs sourceDomainNodeId into
// targetDomainNodeId: every curriculum and every direct child of the source
// move onto the target, the source row is deleted. Same shape as
// mergeSubjects/mergeCurricula/mergeTags below.
export async function mergeDomainNodes(
  targetDomainNodeId: string,
  sourceDomainNodeId: string,
): Promise<be.MergeDomainNodesResult> {
  return request<be.MergeDomainNodesResult>(`/domain-nodes/${targetDomainNodeId}/merge`, {
    method: 'POST',
    body: { sourceDomainNodeId },
  })
}

// domain-priority-review (issue #52) — sets or clears (null) a domain
// node's target depth directly, independent of the review flow.
export async function updateDomainNodeTargetDepth(
  nodeId: string,
  targetDepth: be.DepthLevel | null,
): Promise<be.DomainNode> {
  return request<be.DomainNode>(`/domain-nodes/${nodeId}`, {
    method: 'PATCH',
    body: { targetDepth },
  })
}

// The manual "trigger a review" action — one cheap agent call, returns the
// freshly inserted suggestions. Propagates ApiError on failure (502 from
// the backend when the agent call itself fails) rather than swallowing it.
export async function triggerDomainPriorityReview(
  subjectId: string,
): Promise<be.DomainPrioritySuggestion[]> {
  return request<be.DomainPrioritySuggestion[]>(
    `/subjects/${subjectId}/domain-priority-reviews`,
    { method: 'POST' },
  )
}

export async function listPrioritySuggestions(
  subjectId: string,
  status?: be.DomainPrioritySuggestionStatus,
): Promise<be.DomainPrioritySuggestion[]> {
  const query = status ? `?status=${status}` : ''

  return request<be.DomainPrioritySuggestion[]>(
    `/subjects/${subjectId}/domain-priority-suggestions${query}`,
  )
}

export async function resolvePrioritySuggestion(
  suggestionId: string,
  status: 'accepted' | 'rejected',
): Promise<be.DomainPrioritySuggestion> {
  return request<be.DomainPrioritySuggestion>(
    `/domain-priority-suggestions/${suggestionId}`,
    { method: 'PATCH', body: { status } },
  )
}

export async function getDomainPriorityReviewStatus(
  subjectId: string,
): Promise<be.DomainPriorityReviewStatus> {
  return request<be.DomainPriorityReviewStatus>(
    `/subjects/${subjectId}/domain-priority-review-status`,
  )
}

// doc-changelog-scan (issue #49) additions below.

export async function triggerDocScan(subjectId: string): Promise<be.DocScanResult> {
  return request<be.DocScanResult>(`/subjects/${subjectId}/doc-scans`, { method: 'POST' })
}

export async function listDocScanSuggestions(
  subjectId: string,
  status?: be.DomainSuggestionStatus,
): Promise<be.DocScanSuggestionsResponse> {
  const query = status ? `?status=${status}` : ''

  return request<be.DocScanSuggestionsResponse>(
    `/subjects/${subjectId}/doc-scan-suggestions${query}`,
  )
}

/**
 * Both doc-scan resolve routes answer 409 `already_resolved` when the
 * suggestion is no longer pending — the second tab, or the same user's own
 * double-click. That is not a failure: the decision the caller asked for has
 * been made, just not by this request, so the caller should drop the row
 * exactly as it would on a 200 rather than leave it listed.
 *
 * Translated here into a plain discriminated result rather than left as a
 * thrown `ApiError` for two reasons. It follows what `submitStructureTurn` /
 * `resolveSupplementalResearch` already do with their own 409 guard codes
 * below — narrow on `status` AND `code`, so an unrelated 409 still throws and
 * `request()` keeps throwing on every non-2xx for every other caller. And the
 * consumers are server functions whose return value crosses the
 * TanStack RPC boundary, where an `Error` subclass loses its class identity
 * and an `instanceof` check on the client would silently never match — a
 * serializable object survives that crossing, an exception type does not.
 */
export type ResolveDocScanSuggestionResult<T> =
  | { outcome: 'resolved'; suggestion: T }
  | { outcome: 'already_resolved' }

async function resolveDocScanSuggestion<T>(
  path: string,
  status: 'accepted' | 'rejected',
): Promise<ResolveDocScanSuggestionResult<T>> {
  try {
    const suggestion = await request<T>(path, { method: 'PATCH', body: { status } })

    return { outcome: 'resolved', suggestion }
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.code === 'already_resolved') {
      return { outcome: 'already_resolved' }
    }

    throw err
  }
}

export async function resolveDomainTopicSuggestion(
  suggestionId: string,
  status: 'accepted' | 'rejected',
): Promise<ResolveDocScanSuggestionResult<be.DomainTopicSuggestion>> {
  return resolveDocScanSuggestion<be.DomainTopicSuggestion>(
    `/domain-topic-suggestions/${suggestionId}`,
    status,
  )
}

export async function resolveDomainSupersessionSuggestion(
  suggestionId: string,
  status: 'accepted' | 'rejected',
): Promise<ResolveDocScanSuggestionResult<be.DomainSupersessionSuggestion>> {
  return resolveDocScanSuggestion<be.DomainSupersessionSuggestion>(
    `/domain-supersession-suggestions/${suggestionId}`,
    status,
  )
}

// deepen-widen-recommendations (issue #90) additions below.

export async function triggerDomainRecommendations(
  subjectId: string,
): Promise<be.DomainRecommendation[]> {
  return request<be.DomainRecommendation[]>(`/subjects/${subjectId}/domain-recommendations`, {
    method: 'POST',
  })
}

export async function listDomainRecommendations(
  subjectId: string,
  status?: be.DomainRecommendationStatus,
): Promise<be.DomainRecommendation[]> {
  const query = status ? `?status=${status}` : ''

  return request<be.DomainRecommendation[]>(
    `/subjects/${subjectId}/domain-recommendations${query}`,
  )
}

// Mirrors resolveDocScanSuggestion's own already_resolved-as-outcome shape
// (not a thrown error) — SCENARIO 8's second tab gets a clean outcome to
// render from, not a caught exception.
export async function resolveDomainRecommendation(
  recommendationId: string,
  status: 'accepted' | 'rejected',
): Promise<ResolveDocScanSuggestionResult<be.DomainRecommendation>> {
  return resolveDocScanSuggestion<be.DomainRecommendation>(
    `/domain-recommendations/${recommendationId}`,
    status,
  )
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  return request<be.Subject>('/subjects', { method: 'POST', body: input })
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await request(`/subjects/${subjectId}`, { method: 'DELETE' })
}

export interface MergeSubjectsResult {
  targetSubjectId: string
  sourceSubjectId: string
  curriculaMoved: number
  domainNodesMoved: number
}

export async function mergeSubjects(
  targetSubjectId: string,
  sourceSubjectId: string,
): Promise<MergeSubjectsResult> {
  return request<MergeSubjectsResult>(`/subjects/${targetSubjectId}/merge`, {
    method: 'POST',
    body: { sourceSubjectId },
  })
}

export async function listCurricula(): Promise<Curriculum[]> {
  const list = await request<be.Curriculum[]>('/curricula')

  return list.map(mapCurriculum)
}

export async function createCurriculum(
  input: CreateCurriculumInput,
): Promise<Curriculum> {
  const created = await request<be.Curriculum>('/curricula', {
    method: 'POST',
    body: input,
  })

  return mapCurriculum(created)
}

export async function setCurriculumDomainNode(
  curriculumId: string,
  domainNodeId: string | null,
): Promise<Curriculum> {
  const updated = await request<be.Curriculum>(`/curricula/${curriculumId}`, {
    method: 'PATCH',
    body: { curriculumId, domainNodeId },
  })

  return mapCurriculum(updated)
}

export async function listTopicGaps(topicId: string): Promise<Gap[]> {
  try {
    const rows = await request<be.Gap[]>(`/topics/${topicId}/gaps`)

    return rows.map(mapGap)
  } catch {
    return []
  }
}

export async function getCurriculumDetail(
  curriculumId: string,
): Promise<CurriculumDetail | null> {
  try {
    const detail = await request<be.CurriculumDetail>(
      `/curricula/${curriculumId}`,
    )

    return {
      curriculum: mapCurriculum(detail.curriculum),
      sources: detail.sources,
      modules: detail.modules.map(mapModule),
      progress: detail.progress,
      recommendedTopicId: detail.recommendedTopicId,
      hasCitableSources: detail.hasCitableSources,
      hasStructureDraftAttempt: detail.hasStructureDraftAttempt,
      domainMappings: detail.domainMappings.map(mapCurriculumDomainNodeMapping),
    }
  } catch {
    return null
  }
}

// decouple-curricula-from-domain-nodes (issue #84) — the on-demand "Map to
// taxonomy" trigger + suggestion review flow.

export async function triggerCurriculumDomainMapping(
  curriculumId: string,
): Promise<CurriculumDomainNodeMapping[]> {
  const rows = await request<be.CurriculumDomainNodeMapping[]>(
    `/curricula/${curriculumId}/domain-mappings`,
    { method: 'POST' },
  )

  return rows.map(mapCurriculumDomainNodeMapping)
}

export async function listCurriculumDomainMappings(
  curriculumId: string,
): Promise<CurriculumDomainNodeMapping[]> {
  const rows = await request<be.CurriculumDomainNodeMapping[]>(
    `/curricula/${curriculumId}/domain-mappings`,
  )

  return rows.map(mapCurriculumDomainNodeMapping)
}

export async function resolveCurriculumDomainMapping(
  mappingId: string,
  status: 'confirmed' | 'rejected',
  depth?: Depth,
): Promise<CurriculumDomainNodeMapping> {
  const row = await request<be.CurriculumDomainNodeMapping>(
    `/curriculum-domain-mappings/${mappingId}`,
    {
      method: 'PATCH',
      body: { status, depth: depth ? DEPTH_TO_BE[depth] : undefined },
    },
  )

  return mapCurriculumDomainNodeMapping(row)
}

export async function setCurriculumLearningStatus(
  curriculumId: string,
  learningStatus: LearningStatus,
): Promise<Curriculum> {
  const updated = await request<be.Curriculum>(`/curricula/${curriculumId}`, {
    method: 'PATCH',
    body: { curriculumId, learningStatus },
  })

  return mapCurriculum(updated)
}

export async function updateCurriculumSettings(input: {
  curriculumId: string
  speed?: Speed
  hinting?: boolean
  defaultDepth?: Depth
  strictOrder?: boolean
}): Promise<Curriculum> {
  const body: Record<string, unknown> = {}

  if (input.speed !== undefined) {
    body.speed = input.speed
  }

  if (input.hinting !== undefined) {
    body.hinting = input.hinting
  }

  if (input.defaultDepth !== undefined) {
    body.defaultDepth = DEPTH_TO_BE[input.defaultDepth]
  }

  if (input.strictOrder !== undefined) {
    body.strictOrder = input.strictOrder
  }

  const updated = await request<be.Curriculum>(`/curricula/${input.curriculumId}`, {
    method: 'PATCH',
    body,
  })

  return mapCurriculum(updated)
}

export async function confirmCurriculum(
  curriculumId: string,
): Promise<Curriculum> {
  const confirmed = await request<be.Curriculum>(
    `/curricula/${curriculumId}/confirm`,
    { method: 'POST' },
  )

  return mapCurriculum(confirmed)
}

export async function completePreAssessment(
  curriculumId: string,
): Promise<Curriculum> {
  const updated = await request<be.Curriculum>(
    `/curricula/${curriculumId}/complete-pre-assessment`,
    { method: 'POST' },
  )

  return mapCurriculum(updated)
}

export async function deleteCurriculum(curriculumId: string): Promise<void> {
  await request(`/curricula/${curriculumId}`, { method: 'DELETE' })
}

export interface MergeCurriculaResult {
  targetCurriculumId: string
  sourceCurriculumId: string
  modulesMoved: number
  topicsMoved: number
  sourcesMoved: number
  socraticSessionsMoved: number
  probeSessionsMoved: number
}

export async function mergeCurricula(
  targetCurriculumId: string,
  sourceCurriculumId: string,
): Promise<MergeCurriculaResult> {
  return request<MergeCurriculaResult>(`/curricula/${targetCurriculumId}/merge`, {
    method: 'POST',
    body: { sourceCurriculumId },
  })
}

export async function moveCurriculum(
  curriculumId: string,
  targetSubjectId: string,
): Promise<Curriculum> {
  const updated = await request<be.Curriculum>(`/curricula/${curriculumId}/move`, {
    method: 'POST',
    body: { targetSubjectId },
  })

  return mapCurriculum(updated)
}

export async function addSources(
  curriculumId: string,
  sources: SourceDraft[],
): Promise<void> {
  await request(`/curricula/${curriculumId}/sources`, {
    method: 'POST',
    body: { sources },
  })
}

export async function reparseCurriculum(curriculumId: string): Promise<void> {
  await request(`/curricula/${curriculumId}/reparse`, { method: 'POST' })
}

export async function retryResearch(curriculumId: string): Promise<void> {
  await request(`/curricula/${curriculumId}/retry-research`, { method: 'POST' })
}

export async function retryDraftStructure(curriculumId: string): Promise<void> {
  await request(`/curricula/${curriculumId}/retry-structure-draft`, { method: 'POST' })
}

export type ApproveSourcesResult =
  | { ok: true }
  | { ok: false; code: 'not_awaiting_approval' | 'no_approved_sources' }

const APPROVE_SOURCES_GUARD_CODES = new Set(['not_awaiting_approval', 'no_approved_sources'])

export async function approveSources(
  curriculumId: string,
  override: boolean,
): Promise<ApproveSourcesResult> {
  try {
    await request(`/curricula/${curriculumId}/approve-sources`, {
      method: 'POST',
      body: { override },
    })

    return { ok: true }
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.code !== undefined &&
      APPROVE_SOURCES_GUARD_CODES.has(err.code)
    ) {
      return { ok: false, code: err.code as 'not_awaiting_approval' | 'no_approved_sources' }
    }

    throw err
  }
}

export async function deleteSource(sourceId: string): Promise<void> {
  await request(`/sources/${sourceId}`, { method: 'DELETE' })
}

export async function getStructureTurns(curriculumId: string): Promise<be.StructureTurn[]> {
  return request<be.StructureTurn[]>(`/curricula/${curriculumId}/structure-turns`)
}

export type SubmitStructureTurnResult =
  | { ok: true; turns: be.StructureTurn[] }
  | { ok: false; code: 'turn_in_progress' | 'turn_limit_reached' }

const STRUCTURE_TURN_GUARD_CODES = new Set(['turn_in_progress', 'turn_limit_reached'])

export async function submitStructureTurn(
  curriculumId: string,
  message: string,
  researchGapLabels?: string[],
): Promise<SubmitStructureTurnResult> {
  try {
    const turns = await request<be.StructureTurn[]>(
      `/curricula/${curriculumId}/structure-turns`,
      { method: 'POST', body: { message, researchGapLabels } },
    )

    return { ok: true, turns }
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      err.code !== undefined &&
      STRUCTURE_TURN_GUARD_CODES.has(err.code)
    ) {
      return { ok: false, code: err.code as 'turn_in_progress' | 'turn_limit_reached' }
    }

    throw err
  }
}

/**
 * Step 2 of the supplemental-research review gate: the learner's
 * approve/reject decision on candidates a prior `submitStructureTurn` call
 * surfaced (see that turn's `pendingResearchCandidates`). Re-enters the same
 * `turn_in_progress`/`turn_limit_reached` guards `submitStructureTurn` does,
 * so it shares that function's result shape and guard-translation logic.
 */
export async function resolveSupplementalResearch(
  curriculumId: string,
  approvedCandidateIds: string[],
): Promise<SubmitStructureTurnResult> {
  try {
    const turns = await request<be.StructureTurn[]>(
      `/curricula/${curriculumId}/resolve-research-candidates`,
      { method: 'POST', body: { approvedCandidateIds } },
    )

    return { ok: true, turns }
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      err.code !== undefined &&
      STRUCTURE_TURN_GUARD_CODES.has(err.code)
    ) {
      return { ok: false, code: err.code as 'turn_in_progress' | 'turn_limit_reached' }
    }

    throw err
  }
}

export async function confirmStructure(curriculumId: string): Promise<Curriculum> {
  const confirmed = await request<be.Curriculum>(
    `/curricula/${curriculumId}/confirm-structure`,
    { method: 'POST' },
  )

  return mapCurriculum(confirmed)
}

export async function setModuleLearningStatus(
  moduleId: string,
  learningStatus: LearningStatus,
): Promise<void> {
  await request(`/modules/${moduleId}`, {
    method: 'PATCH',
    body: { moduleId, learningStatus },
  })
}

export async function updateTopic(input: {
  topicId: string
  title?: string
  summary?: string | null
  moduleId?: string
  order?: number
  priority?: Topic['priority']
  included?: boolean
  selfGrade?: number | null
  targetDepth?: Depth
  learningStatus?: LearningStatus
}): Promise<void> {
  const body: Record<string, unknown> = { topicId: input.topicId }

  if (input.title !== undefined) {
    body.title = input.title
  }

  if (input.summary !== undefined) {
    body.summary = input.summary
  }

  if (input.moduleId !== undefined) {
    body.moduleId = input.moduleId
  }

  if (input.order !== undefined) {
    body.order = input.order
  }

  if (input.priority !== undefined) {
    body.priority = input.priority
  }

  if (input.included !== undefined) {
    body.included = input.included
  }

  if (input.selfGrade !== undefined) {
    body.selfGrade = input.selfGrade
  }

  if (input.targetDepth !== undefined) {
    body.depth = DEPTH_TO_BE[input.targetDepth]
  }

  if (input.learningStatus !== undefined) {
    body.learningStatus = input.learningStatus
  }

  await request(`/topics/${input.topicId}`, { method: 'PATCH', body })
}

export async function createModule(
  curriculumId: string,
  title: string,
): Promise<void> {
  await request(`/curricula/${curriculumId}/modules`, {
    method: 'POST',
    body: { title },
  })
}

export async function updateModule(input: {
  moduleId: string
  title?: string
  order?: number
  priority?: Module['priority']
}): Promise<void> {
  const body: Record<string, unknown> = {}

  if (input.title !== undefined) {
    body.title = input.title
  }

  if (input.order !== undefined) {
    body.order = input.order
  }

  if (input.priority !== undefined) {
    body.priority = input.priority
  }

  await request(`/modules/${input.moduleId}`, { method: 'PATCH', body })
}

export async function addModuleComment(
  moduleId: string,
  comment: string,
): Promise<void> {
  await request(`/modules/${moduleId}/comments`, {
    method: 'POST',
    body: { comment },
  })
}

export async function addTopicComment(
  topicId: string,
  comment: string,
): Promise<void> {
  await request(`/topics/${topicId}/comments`, {
    method: 'POST',
    body: { comment },
  })
}

export async function deleteModule(moduleId: string): Promise<void> {
  await request(`/modules/${moduleId}`, { method: 'DELETE' })
}

export async function reorderModules(
  curriculumId: string,
  orderedIds: string[],
): Promise<void> {
  await request(`/curricula/${curriculumId}/modules/order`, {
    method: 'PATCH',
    body: { orderedIds },
  })
}

export async function reorderCurricula(
  subjectId: string,
  orderedIds: string[],
): Promise<void> {
  await request(`/subjects/${subjectId}/curricula/order`, {
    method: 'PATCH',
    body: { orderedIds },
  })
}

export async function createTopic(input: {
  moduleId: string
  title: string
  summary?: string
  suggestedDepth?: Depth
}): Promise<void> {
  const body: Record<string, unknown> = { title: input.title }

  if (input.summary !== undefined) {
    body.summary = input.summary
  }

  if (input.suggestedDepth !== undefined) {
    body.suggestedDepth = DEPTH_TO_BE[input.suggestedDepth]
  }

  await request(`/modules/${input.moduleId}/topics`, { method: 'POST', body })
}

export async function deleteTopic(topicId: string): Promise<void> {
  await request(`/topics/${topicId}`, { method: 'DELETE' })
}

export async function reorderTopics(
  moduleId: string,
  orderedIds: string[],
): Promise<void> {
  await request(`/modules/${moduleId}/topics/order`, {
    method: 'PATCH',
    body: { orderedIds },
  })
}

function mapProbeQuestion(
  topicId: string,
  question: be.ProbeQuestion,
): Question {
  return {
    id: `${question.gapId ?? 'opener'}:${question.kind}`,
    topicId,
    gapId: question.gapId,
    gapLabel: question.gapLabel,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    correctAnswerIndex: question.correctAnswerIndex ?? undefined,
    sources: question.sources,
  }
}

export async function startProbe(
  topicId: string,
  mode: QuestionKind,
): Promise<Question | null> {
  try {
    const question = await request<be.ProbeQuestion>(
      `/topics/${topicId}/probe`,
      { method: 'POST', body: { topicId, mode } },
    )

    return mapProbeQuestion(topicId, question)
  } catch {
    return null
  }
}

export async function submitProbe(input: {
  topicId: string
  gapId: string | null
  mode: QuestionKind
  answer: string
  selfOutcome?: 'pass' | 'fail'
}): Promise<AttemptResult | null> {
  try {
    const result = await request<be.ProbeResult>(
      `/topics/${input.topicId}/probe/answer`,
      { method: 'POST', body: input },
    )

    return {
      outcome: result.outcome,
      coveredGapLabels: result.coveredGapLabels,
      nextQuestion: result.nextQuestion
        ? mapProbeQuestion(input.topicId, result.nextQuestion)
        : null,
      feedback: result.feedback,
    }
  } catch {
    return null
  }
}

export async function declareGap(input: {
  topicId: string
  label: string
  concern?: Concern
}): Promise<void> {
  await request('/gaps', { method: 'POST', body: input })
}

export async function curateGap(input: {
  gapId: string
  status?: 'open' | 'covered' | 'skipped'
  wanted?: boolean
  depth?: Depth
  concern?: Concern | null
}): Promise<void> {
  const body: Record<string, unknown> = { gapId: input.gapId }

  if (input.status !== undefined) {
    body.state = input.status
  }

  if (input.wanted !== undefined) {
    body.wanted = input.wanted
  }

  if (input.depth !== undefined) {
    body.depth = DEPTH_TO_BE[input.depth]
  }

  if (input.concern !== undefined) {
    body.concern = input.concern
  }

  await request(`/gaps/${input.gapId}`, { method: 'PATCH', body })
}

export async function getDailyPush(
  mode: QuestionKind = 'socratic',
): Promise<DailyPushResult> {
  const res = await request<be.DailyPushResponse>(`/daily-push?mode=${mode}`)

  const push = res.push
    ? {
        topicId: res.push.topicId,
        topicTitle: res.push.topicTitle,
        curriculumId: res.push.curriculumId,
        curriculumName: res.push.curriculumName,
        gap: mapGap(res.push.gap),
        reason: res.push.reason,
      }
    : null

  const question =
    res.push && res.question
      ? mapProbeQuestion(res.push.topicId, res.question)
      : null

  return { push, question, nudge: res.nudge }
}

export async function getCrossCutting(): Promise<ConcernSummary[]> {
  const { summaries } = await request<be.CrossCuttingResponse>('/cross-cutting')

  return summaries
}

// Generalized recall-gap mastery tracking (issue #57, SCENARIO 7) — a
// distinct, structurally different aggregation from getCrossCutting above
// (that one groups by Concern tag on any gap; this groups by normalized
// label across mastery-tracked gaps only).
export async function getGapMasteryCrossCuttingNudges(): Promise<
  be.CrossCuttingNudge[]
> {
  const { nudges } = await request<be.CrossCuttingNudgeResponse>(
    '/gap-mastery/cross-cutting-nudge',
  )

  return nudges
}

export async function getActiveProbeSession(input: {
  scope: be.ProbeScope
  scopeId: string
}): Promise<be.ProbeSession | null> {
  try {
    return await request<be.ProbeSession | null>(
      `/probe-sessions/active?scope=${encodeURIComponent(input.scope)}&scopeId=${encodeURIComponent(input.scopeId)}`,
    )
  } catch {
    return null
  }
}

export async function prepareProbeSession(input: {
  scope: be.ProbeScope
  scopeId: string
  regenerate?: boolean
  allowMultiSelect?: boolean
}): Promise<be.ProbeSession | null> {
  try {
    return await request<be.ProbeSession>('/probe-sessions', {
      method: 'POST',
      body: input,
    })
  } catch {
    return null
  }
}

export async function answerProbeSession(input: {
  sessionId: string
  questionId: string
  selectedIndex?: number
  selectedIndices?: number[]
}): Promise<be.AnswerProbeSessionResult | null> {
  try {
    return await request<be.AnswerProbeSessionResult>(
      `/probe-sessions/${input.sessionId}/answer`,
      {
        method: 'POST',
        body: {
          questionId: input.questionId,
          selectedIndex: input.selectedIndex,
          selectedIndices: input.selectedIndices,
        },
      },
    )
  } catch {
    return null
  }
}

export async function startSocraticSession(input: {
  topicId: string
  regenerate?: boolean
}): Promise<be.SocraticSession | null> {
  try {
    return await request<be.SocraticSession>('/socratic-sessions', {
      method: 'POST',
      body: input,
    })
  } catch {
    return null
  }
}

export async function answerSocraticSession(input: {
  sessionId: string
  turnId: string
  answer: string
}): Promise<be.AnswerSocraticResult | null> {
  try {
    return await request<be.AnswerSocraticResult>(
      `/socratic-sessions/${input.sessionId}/answer`,
      {
        method: 'POST',
        body: { turnId: input.turnId, answer: input.answer },
      },
    )
  } catch {
    return null
  }
}

export async function submitProbeQuestionFeedback(
  questionId: string,
  input: be.SubmitItemFeedbackInput,
): Promise<be.ItemFeedback> {
  return request<be.ItemFeedback>(`/probe-session-questions/${questionId}/feedback`, {
    method: 'POST',
    body: input,
  })
}

export async function submitSocraticTurnFeedback(
  turnId: string,
  input: be.SubmitItemFeedbackInput,
): Promise<be.ItemFeedback> {
  return request<be.ItemFeedback>(`/socratic-turns/${turnId}/feedback`, {
    method: 'POST',
    body: input,
  })
}

export async function captureProbeQuestionOpenQuestion(
  questionId: string,
  input: be.CaptureOpenQuestionInput,
): Promise<be.OpenQuestion> {
  return request<be.OpenQuestion>(`/probe-session-questions/${questionId}/open-questions`, {
    method: 'POST',
    body: input,
  })
}

export async function captureSocraticTurnOpenQuestion(
  turnId: string,
  input: be.CaptureOpenQuestionInput,
): Promise<be.OpenQuestion> {
  return request<be.OpenQuestion>(`/socratic-turns/${turnId}/open-questions`, {
    method: 'POST',
    body: input,
  })
}

export async function listOpenQuestions(input: {
  status?: be.OpenQuestionStatus
  limit?: number
}): Promise<be.OpenQuestionsListResult> {
  const params = new URLSearchParams()

  if (input.status) {
    params.set('status', input.status)
  }

  if (input.limit) {
    params.set('limit', String(input.limit))
  }

  const query = params.toString()

  return request<be.OpenQuestionsListResult>(`/open-questions${query ? `?${query}` : ''}`)
}

export async function resolveOpenQuestion(
  id: string,
  input: be.ResolveOpenQuestionInput,
): Promise<be.OpenQuestion> {
  return request<be.OpenQuestion>(`/open-questions/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function askStudyChat(input: {
  topicId: string
  message: string
  transcript?: be.ChatMessage[]
}): Promise<be.AskStudyChatResult | null> {
  try {
    return await request<be.AskStudyChatResult>(
      `/topics/${input.topicId}/study-chat`,
      {
        method: 'POST',
        body: { message: input.message, transcript: input.transcript },
      },
    )
  } catch {
    return null
  }
}

export async function getCurriculumStats(
  curriculumId: string,
): Promise<be.CurriculumStats | null> {
  try {
    return await request<be.CurriculumStats>(`/curricula/${curriculumId}/stats`)
  } catch {
    return null
  }
}

export async function generateRecommendations(
  curriculumId: string,
): Promise<be.GenerateRecommendationsResult | null> {
  try {
    return await request<be.GenerateRecommendationsResult>(
      `/curricula/${curriculumId}/stats/recommendations`,
      { method: 'POST' },
    )
  } catch {
    return null
  }
}

export async function getStreak(): Promise<be.Streak | null> {
  try {
    return await request<be.Streak>('/streak')
  } catch {
    return null
  }
}

export async function listTags(): Promise<Tag[]> {
  const rows = await request<be.Tag[]>('/tags')

  return rows.map(mapTag)
}

export async function createOrGetTag(name: string): Promise<Tag> {
  const tag = await request<be.Tag>('/tags', { method: 'POST', body: { name } })

  return mapTag(tag)
}

export async function assignTag(
  tagId: string,
  nodeType: NodeType,
  nodeId: string,
): Promise<be.TagAssignment> {
  return request<be.TagAssignment>(`/tags/${tagId}/assignments`, {
    method: 'POST',
    body: { nodeType, nodeId },
  })
}

export async function removeTagAssignment(
  tagId: string,
  assignmentId: string,
): Promise<void> {
  await request(`/tags/${tagId}/assignments/${assignmentId}`, { method: 'DELETE' })
}

export interface MergeTagsResult {
  targetTagId: string
  sourceTagId: string
  assignmentsMoved: number
  assignmentsDeduped: number
  sessionsMoved: number
}

export async function mergeTags(
  targetTagId: string,
  sourceTagId: string,
): Promise<MergeTagsResult> {
  return request<MergeTagsResult>(`/tags/${targetTagId}/merge`, {
    method: 'POST',
    body: { sourceTagId },
  })
}

export async function gatherLectureSources(
  topicId: string,
): Promise<LectureSourceCandidate[]> {
  return request<be.LectureSourceCandidate[]>(
    `/topics/${topicId}/lecture/sources`,
    { method: 'POST' },
  )
}

export async function listLectureSourceCandidates(
  topicId: string,
): Promise<LectureSourceCandidate[]> {
  return request<be.LectureSourceCandidate[]>(`/topics/${topicId}/lecture/sources`)
}

export async function reviewLectureSourceCandidate(input: {
  candidateId: string
  reviewStatus: 'approved' | 'rejected'
}): Promise<void> {
  await request(`/lecture-source-candidates/${input.candidateId}`, {
    method: 'PATCH',
    body: { reviewStatus: input.reviewStatus },
  })
}

export async function compileLecture(topicId: string): Promise<Lecture> {
  return request<be.Lecture>(`/topics/${topicId}/lecture`, { method: 'POST' })
}

export async function getLecture(topicId: string): Promise<Lecture | null> {
  try {
    return await request<be.Lecture>(`/topics/${topicId}/lecture`)
  } catch {
    return null
  }
}

export async function compileCards(topicId: string): Promise<TopicCardSet> {
  return request<be.TopicCardSet>(`/topics/${topicId}/cards`, { method: 'POST' })
}

export async function getCards(topicId: string): Promise<TopicCardSet | null> {
  try {
    return await request<be.TopicCardSet>(`/topics/${topicId}/cards`)
  } catch {
    return null
  }
}

export async function getAdminSettings(): Promise<be.AdminSettings> {
  return request<be.AdminSettings>('/admin/settings')
}

export async function updateAdminSettings(
  input: be.UpdateAdminSettingsInput,
): Promise<be.AdminSettings> {
  return request<be.AdminSettings>('/admin/settings', {
    method: 'PATCH',
    body: input,
  })
}

export async function getAdminObservability(): Promise<be.AdminObservability> {
  return request<be.AdminObservability>('/admin/observability')
}

// ai-duplicate-detection (issue #63) additions below.

export async function triggerSubjectDuplicateScan(): Promise<be.TriggerSubjectDuplicateScanResult> {
  return request<be.TriggerSubjectDuplicateScanResult>('/subject-duplicate-scans', {
    method: 'POST',
  })
}

export async function listSubjectDuplicateSuggestions(
  status?: be.SubjectDuplicateSuggestionStatus,
): Promise<be.SubjectDuplicateSuggestion[]> {
  const query = status ? `?status=${status}` : ''

  return request<be.SubjectDuplicateSuggestion[]>(`/subject-duplicate-suggestions${query}`)
}

export async function resolveSubjectDuplicateSuggestion(
  suggestionId: string,
  input: be.ResolveSubjectDuplicateSuggestionInput,
): Promise<be.SubjectDuplicateSuggestion> {
  return request<be.SubjectDuplicateSuggestion>(
    `/subject-duplicate-suggestions/${suggestionId}`,
    { method: 'PATCH', body: input },
  )
}
