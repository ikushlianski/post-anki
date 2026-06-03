import type * as be from '@post-anki/shared'
import type {
  AttemptResult,
  Concern,
  ConcernSummary,
  CreateCurriculumInput,
  CreateSubjectInput,
  Curriculum,
  CurriculumDetail,
  CurriculumStatus,
  DailyPushResult,
  DecideInput,
  DecideResult,
  Depth,
  Gap,
  LearningStatus,
  Module,
  Question,
  QuestionKind,
  SourceDraft,
  Speed,
  Subject,
  Topic,
  TopicProgress,
} from './model'

const DEFAULT_API_BASE_URL = 'http://localhost:8030'

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL

  return (url && url.trim() !== '' ? url : DEFAULT_API_BASE_URL).replace(/\/$/, '')
}

function authHeaders(): Record<string, string> {
  const secret = process.env.API_SHARED_SECRET
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (secret && secret.trim() !== '') {
    headers.authorization = `Bearer ${secret}`
  }

  return headers
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
    throw new Error(`api ${init?.method ?? 'GET'} ${path} → ${response.status}`)
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

function mapTopic(topic: be.Topic): Topic {
  const gaps = (topic.gaps ?? []).map(mapGap)
  const gapsCovered = gaps.filter((gap) => gap.status === 'covered').length

  return {
    id: topic.id,
    moduleId: topic.moduleId,
    title: topic.title,
    summary: topic.summary,
    order: topic.order,
    included: topic.included,
    selfGrade: topic.selfGrade as Topic['selfGrade'],
    targetDepth: mapDepth(topic.depth),
    learningStatus: topic.learningStatus,
    gaps,
    progress: mapProgress(topic.progress, gaps.length, gapsCovered),
  }
}

function mapModule(module: be.Module): Module {
  return {
    id: module.id,
    curriculumId: module.curriculumId,
    title: module.title,
    order: module.order,
    learningStatus: module.learningStatus,
    topics: module.topics.map(mapTopic),
    progress: module.progress,
  }
}

const STATUS_FROM_BE: Record<string, CurriculumStatus> = {
  draft: 'draft',
  curating: 'curating',
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
  }
}

export async function listSubjects(): Promise<Subject[]> {
  return request<be.Subject[]>('/subjects')
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  return request<be.Subject>('/subjects', { method: 'POST', body: input })
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await request(`/subjects/${subjectId}`, { method: 'DELETE' })
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
    }
  } catch {
    return null
  }
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

export async function deleteCurriculum(curriculumId: string): Promise<void> {
  await request(`/curricula/${curriculumId}`, { method: 'DELETE' })
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
}): Promise<void> {
  const body: Record<string, unknown> = {}

  if (input.title !== undefined) {
    body.title = input.title
  }

  if (input.order !== undefined) {
    body.order = input.order
  }

  await request(`/modules/${input.moduleId}`, { method: 'PATCH', body })
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

  return { push, question }
}

export async function getCrossCutting(): Promise<ConcernSummary[]> {
  const { summaries } = await request<be.CrossCuttingResponse>('/cross-cutting')

  return summaries
}

export async function decide(input: DecideInput): Promise<DecideResult> {
  return request<be.DecideResult>('/decide', { method: 'POST', body: input })
}
