import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  addModuleCommentInput,
  addSourcesInput,
  addTopicCommentInput,
  assignTagInput,
  createCurriculumInput,
  createModuleInput,
  createTagInput,
  createTopicInput,
  curateGapInput,
  declareGapInput,
  mergeCurriculaInput,
  mergeTagsInput,
  moveCurriculumInput,
  nextQuestionInput,
  recordAttemptInput,
  removeTagAssignmentInput,
  reorderInput,
  setCurriculumStatusInput,
  setModuleStatusInput,
  updateAdaptiveInput,
  updateModuleInput,
  updateTopicInput,
} from './model'
import type {
  ConcernSummary,
  CreateCurriculumInput,
  Curriculum,
  DailyPushResult,
  DashboardSubject,
  QuestionKind,
  Subject,
  Tag,
} from './model'
import type { CrossCuttingNudge, StructureTurn, TagAssignment } from '@post-anki/shared'
import * as api from './api-client'

export const getBoard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ subjects: Subject[]; curricula: Curriculum[] }> => {
    const [subjects, curricula] = await Promise.all([
      api.listSubjects(),
      api.listCurricula(),
    ])

    return { subjects, curricula }
  },
)

export const getTree = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardSubject[]> => {
    const [subjects, curricula] = await Promise.all([
      api.listSubjects(),
      api.listCurricula(),
    ])
    const details = await Promise.all(
      curricula.map((c) => api.getCurriculumDetail(c.id)),
    )

    return subjects.map((subject) => ({
      subject,
      curricula: curricula
        .filter((c) => c.subjectId === subject.id)
        .map((c) => ({
          curriculum: c,
          modules: details.find((d) => d?.curriculum.id === c.id)?.modules ?? [],
        })),
    }))
  },
)

export const createCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateCurriculumInput) =>
    createCurriculumInput.parse(data),
  )
  .handler(({ data }) => api.createCurriculum(data))

export const addSourcesToCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => addSourcesInput.parse(data))
  .handler(async ({ data }) => {
    await api.addSources(data.curriculumId, data.sources)

    return null
  })

export const reparseCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(async ({ data }) => {
    await api.reparseCurriculum(data)

    return null
  })

export const retryResearch = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(async ({ data }) => {
    await api.retryResearch(data)

    return null
  })

export const retryDraftStructure = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(async ({ data }) => {
    await api.retryDraftStructure(data)

    return null
  })

export const approveSources = createServerFn({ method: 'POST' })
  .inputValidator((data: { curriculumId: string; override?: boolean }) => data)
  .handler(async ({ data }) => {
    await api.approveSources(data.curriculumId, data.override ?? false)

    return null
  })

export const removeSource = createServerFn({ method: 'POST' })
  .inputValidator((sourceId: string) => z.string().parse(sourceId))
  .handler(async ({ data }) => {
    await api.deleteSource(data)

    return null
  })

export const getStructureTurns = createServerFn({ method: 'GET' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }): Promise<StructureTurn[]> => api.getStructureTurns(data))

export const submitStructureTurn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { curriculumId: string; message: string; researchGapLabels?: string[] }) => data,
  )
  .handler(
    ({ data }): Promise<api.SubmitStructureTurnResult> =>
      api.submitStructureTurn(data.curriculumId, data.message, data.researchGapLabels),
  )

export const resolveSupplementalResearch = createServerFn({ method: 'POST' })
  .inputValidator((data: { curriculumId: string; approvedCandidateIds: string[] }) => data)
  .handler(
    ({ data }): Promise<api.SubmitStructureTurnResult> =>
      api.resolveSupplementalResearch(data.curriculumId, data.approvedCandidateIds),
  )

export const confirmStructure = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }): Promise<Curriculum> => api.confirmStructure(data))

export const getCurriculum = createServerFn({ method: 'GET' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }) => api.getCurriculumDetail(data))

export const setTopicState = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateTopicInput.parse(data))
  .handler(async ({ data }) => {
    await api.updateTopic(data)

    return null
  })

export const addModuleComment = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => addModuleCommentInput.parse(data))
  .handler(async ({ data }) => {
    await api.addModuleComment(data.moduleId, data.comment)

    return null
  })

export const addTopicComment = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => addTopicCommentInput.parse(data))
  .handler(async ({ data }) => {
    await api.addTopicComment(data.topicId, data.comment)

    return null
  })

export const setModuleStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => setModuleStatusInput.parse(data))
  .handler(async ({ data }) => {
    await api.setModuleLearningStatus(data.moduleId, data.learningStatus)

    return null
  })

export const createModule = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createModuleInput.parse(data))
  .handler(async ({ data }) => {
    await api.createModule(data.curriculumId, data.title)

    return null
  })

export const updateModule = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateModuleInput.parse(data))
  .handler(async ({ data }) => {
    await api.updateModule({
      moduleId: data.moduleId,
      title: data.title,
      order: data.order,
      priority: data.priority,
    })

    return null
  })

export const deleteModule = createServerFn({ method: 'POST' })
  .inputValidator((moduleId: string) => z.string().parse(moduleId))
  .handler(async ({ data }) => {
    await api.deleteModule(data)

    return null
  })

export const reorderModules = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => reorderInput.parse(data))
  .handler(async ({ data }) => {
    await api.reorderModules(data.curriculumOrModuleId, data.orderedIds)

    return null
  })

export const createTopic = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createTopicInput.parse(data))
  .handler(async ({ data }) => {
    await api.createTopic(data)

    return null
  })

export const deleteTopic = createServerFn({ method: 'POST' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(async ({ data }) => {
    await api.deleteTopic(data)

    return null
  })

export const reorderTopics = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => reorderInput.parse(data))
  .handler(async ({ data }) => {
    await api.reorderTopics(data.curriculumOrModuleId, data.orderedIds)

    return null
  })

export const setCurriculumStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => setCurriculumStatusInput.parse(data))
  .handler(({ data }) =>
    api.setCurriculumLearningStatus(data.curriculumId, data.learningStatus),
  )

export const confirmCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }) => api.confirmCurriculum(data))

export const completePreAssessment = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }) => api.completePreAssessment(data))

export const updateCurriculumSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateAdaptiveInput.parse(data))
  .handler(({ data }) =>
    api.updateCurriculumSettings({
      curriculumId: data.curriculumId,
      speed: data.speed,
      hinting: data.hinting,
      defaultDepth: data.defaultDepth,
      strictOrder: data.strictOrder,
    }),
  )

export const deleteCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(async ({ data }) => {
    await api.deleteCurriculum(data)

    return null
  })

export const mergeCurricula = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => mergeCurriculaInput.parse(data))
  .handler(({ data }) => api.mergeCurricula(data.targetCurriculumId, data.sourceCurriculumId))

export const moveCurriculum = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => moveCurriculumInput.parse(data))
  .handler(({ data }) => api.moveCurriculum(data.curriculumId, data.targetSubjectId))

export const nextQuestion = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => nextQuestionInput.parse(data))
  .handler(({ data }) => api.startProbe(data.topicId, data.mode))

export const submitAttempt = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => recordAttemptInput.parse(data))
  .handler(({ data }) => api.submitProbe(data))

export const declareGap = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => declareGapInput.parse(data))
  .handler(async ({ data }) => {
    await api.declareGap(data)

    return null
  })

export const curateGap = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => curateGapInput.parse(data))
  .handler(async ({ data }) => {
    await api.curateGap(data)

    return null
  })

export const getDailyPush = createServerFn({ method: 'GET' })
  .inputValidator((mode: unknown): QuestionKind =>
    mode === 'quick_test' ? 'quick_test' : 'socratic',
  )
  .handler(({ data }): Promise<DailyPushResult> => api.getDailyPush(data))

export const getCrossCutting = createServerFn({ method: 'GET' }).handler(
  (): Promise<ConcernSummary[]> => api.getCrossCutting(),
)

export const getGapMasteryCrossCuttingNudges = createServerFn({
  method: 'GET',
}).handler((): Promise<CrossCuttingNudge[]> => api.getGapMasteryCrossCuttingNudges())

export const listTags = createServerFn({ method: 'GET' }).handler(
  (): Promise<Tag[]> => api.listTags(),
)

export const createOrGetTag = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createTagInput.parse(data))
  .handler(({ data }): Promise<Tag> => api.createOrGetTag(data.name))

// Returns the assignment (the backend's own 201 body) rather than discarding
// it — the caller needs its id to render the new chip immediately, instead of
// waiting on a route invalidation to redeliver the same fact.
export const assignTag = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => assignTagInput.parse(data))
  .handler(
    ({ data }): Promise<TagAssignment> =>
      api.assignTag(data.tagId, data.nodeType, data.nodeId),
  )

export const removeTagAssignment = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => removeTagAssignmentInput.parse(data))
  .handler(async ({ data }) => {
    await api.removeTagAssignment(data.tagId, data.assignmentId)

    return null
  })

export const mergeTags = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => mergeTagsInput.parse(data))
  .handler(({ data }) => api.mergeTags(data.targetTagId, data.sourceTagId))
