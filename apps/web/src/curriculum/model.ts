import { z } from 'zod'

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean(),
})

export type Subject = z.infer<typeof subjectSchema>

export const curriculumStatusSchema = z.enum([
  'draft',
  'curating',
  'ready',
  'confirmed',
  'failed',
])

export type CurriculumStatus = z.infer<typeof curriculumStatusSchema>

export const learningStatusSchema = z.enum([
  'not_started',
  'probing',
  'going_deeper',
  'reviewing',
  'skipping',
  'done',
])

export type LearningStatus = z.infer<typeof learningStatusSchema>

export const speedSchema = z.enum(['slow', 'normal', 'fast'])

export type Speed = z.infer<typeof speedSchema>

export const depthSchema = z.enum(['aware', 'working', 'deep'])

export type Depth = z.infer<typeof depthSchema>

export const curriculumSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: curriculumStatusSchema,
  learningStatus: learningStatusSchema,
  speed: speedSchema,
  hinting: z.boolean(),
  defaultDepth: depthSchema,
})

export type Curriculum = z.infer<typeof curriculumSchema>

export const sourceKindSchema = z.enum(['link', 'text'])

export type SourceKind = z.infer<typeof sourceKindSchema>

export const sourceSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
})

export type Source = z.infer<typeof sourceSchema>

export const sourceDraftSchema = z.object({
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
})

export type SourceDraft = z.infer<typeof sourceDraftSchema>

export const questionKindSchema = z.enum(['socratic', 'quick_test'])

export type QuestionKind = z.infer<typeof questionKindSchema>

export const quickTestSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correctAnswerIndex: z.number().int(),
})

export type QuickTest = z.infer<typeof quickTestSchema>

export const gapStatusSchema = z.enum(['open', 'covered', 'skipped'])

export type GapStatus = z.infer<typeof gapStatusSchema>

export const gapOriginSchema = z.enum(['ai', 'user'])

export type GapOrigin = z.infer<typeof gapOriginSchema>

export const DEPTH_ORDER: Record<Depth, number> = {
  aware: 0,
  working: 1,
  deep: 2,
}

export const concernSchema = z.enum([
  'security',
  'performance',
  'observability',
  'cost',
  'reliability',
  'developer_experience',
])

export type Concern = z.infer<typeof concernSchema>

export const gapSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  label: z.string(),
  status: gapStatusSchema,
  depth: depthSchema,
  origin: gapOriginSchema.optional(),
  wanted: z.boolean().optional(),
  concern: concernSchema.nullable().optional(),
  socratic: z.string(),
  quickTest: quickTestSchema.optional(),
})

export type Gap = z.infer<typeof gapSchema>

export const declareGapInput = z.object({
  topicId: z.string(),
  label: z.string().min(1),
  depth: depthSchema.optional(),
  wanted: z.boolean().optional(),
  concern: concernSchema.optional(),
})

export type DeclareGapInput = z.infer<typeof declareGapInput>

export const curateGapInput = z.object({
  gapId: z.string(),
  status: gapStatusSchema.optional(),
  wanted: z.boolean().optional(),
  depth: depthSchema.optional(),
  concern: concernSchema.nullable().optional(),
})

export type CurateGapInput = z.infer<typeof curateGapInput>

export const questionSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  gapId: z.string().nullable(),
  gapLabel: z.string().nullable(),
  kind: questionKindSchema,
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswerIndex: z.number().int().optional(),
  sources: z.array(z.string()).optional(),
})

export type Question = z.infer<typeof questionSchema>

export const selfGradeSchema = z.number().int().min(1).max(5)

export type SelfGrade = z.infer<typeof selfGradeSchema>

export const topicProgressStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'mastered',
])

export type TopicProgressStatus = z.infer<typeof topicProgressStatusSchema>

export const topicProgressSchema = z.object({
  status: topicProgressStatusSchema,
  maturity: z.number().int().min(0).max(100),
  gapsTotal: z.number().int(),
  gapsCovered: z.number().int(),
  attempts: z.number().int().min(0),
  lastInteractedAt: z.string().nullable(),
})

export type TopicProgress = z.infer<typeof topicProgressSchema>

export const topicSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  order: z.number().int(),
  included: z.boolean(),
  selfGrade: selfGradeSchema.nullable(),
  targetDepth: depthSchema,
  learningStatus: learningStatusSchema,
  gaps: z.array(gapSchema),
  progress: topicProgressSchema,
})

export type Topic = z.infer<typeof topicSchema>

export const moduleProgressSchema = z.object({
  topicsIncluded: z.number().int(),
  topicsMastered: z.number().int(),
  percent: z.number().int(),
})

export type ModuleProgress = z.infer<typeof moduleProgressSchema>

export const moduleSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  title: z.string(),
  order: z.number().int(),
  learningStatus: learningStatusSchema,
  topics: z.array(topicSchema),
  progress: moduleProgressSchema,
})

export type Module = z.infer<typeof moduleSchema>

export const curriculumProgressSchema = moduleProgressSchema

export type CurriculumProgress = z.infer<typeof curriculumProgressSchema>

export const curriculumDetailSchema = z.object({
  curriculum: curriculumSchema,
  sources: z.array(sourceSchema),
  modules: z.array(moduleSchema),
  progress: curriculumProgressSchema,
  recommendedTopicId: z.string().nullable(),
})

export type CurriculumDetail = z.infer<typeof curriculumDetailSchema>

export const createSubjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean().optional(),
})

export type CreateSubjectInput = z.infer<typeof createSubjectInput>

export const createCurriculumInput = z.object({
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  sources: z.array(sourceDraftSchema).default([]),
})

export type CreateCurriculumInput = z.infer<typeof createCurriculumInput>

export const addSourcesInput = z.object({
  curriculumId: z.string(),
  sources: z.array(sourceDraftSchema),
})

export type AddSourcesInput = z.infer<typeof addSourcesInput>

export const updateTopicInput = z.object({
  topicId: z.string(),
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  moduleId: z.string().optional(),
  order: z.number().int().optional(),
  included: z.boolean().optional(),
  selfGrade: selfGradeSchema.nullable().optional(),
  targetDepth: depthSchema.optional(),
  learningStatus: learningStatusSchema.optional(),
})

export type UpdateTopicInput = z.infer<typeof updateTopicInput>

export const setModuleStatusInput = z.object({
  moduleId: z.string(),
  learningStatus: learningStatusSchema,
})

export type SetModuleStatusInput = z.infer<typeof setModuleStatusInput>

export const createModuleInput = z.object({
  curriculumId: z.string(),
  title: z.string().min(1),
})

export type CreateModuleInput = z.infer<typeof createModuleInput>

export const updateModuleInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1).optional(),
  order: z.number().int().optional(),
  learningStatus: learningStatusSchema.optional(),
})

export type UpdateModuleInput = z.infer<typeof updateModuleInput>

export const createTopicInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  suggestedDepth: depthSchema.optional(),
})

export type CreateTopicInput = z.infer<typeof createTopicInput>

export const reorderInput = z.object({
  curriculumOrModuleId: z.string(),
  orderedIds: z.array(z.string()).min(1),
})

export type ReorderInput = z.infer<typeof reorderInput>

export const setCurriculumStatusInput = z.object({
  curriculumId: z.string(),
  learningStatus: learningStatusSchema,
})

export type SetCurriculumStatusInput = z.infer<typeof setCurriculumStatusInput>

export const updateAdaptiveInput = z.object({
  curriculumId: z.string(),
  speed: speedSchema.optional(),
  hinting: z.boolean().optional(),
  defaultDepth: depthSchema.optional(),
})

export type UpdateAdaptiveInput = z.infer<typeof updateAdaptiveInput>

export const nextQuestionInput = z.object({
  topicId: z.string(),
  mode: questionKindSchema,
})

export type NextQuestionInput = z.infer<typeof nextQuestionInput>

export const recordAttemptInput = z.object({
  topicId: z.string(),
  gapId: z.string().nullable(),
  mode: questionKindSchema,
  answer: z.string(),
  selfOutcome: z.enum(['pass', 'fail']).optional(),
})

export type RecordAttemptInput = z.infer<typeof recordAttemptInput>

export const attemptResultSchema = z.object({
  outcome: z.enum(['pass', 'fail']),
  correctAnswerIndex: z.number().int().optional(),
  coveredGapLabels: z.array(z.string()),
  nextQuestion: questionSchema.nullable(),
  feedback: z.string(),
})

export type AttemptResult = z.infer<typeof attemptResultSchema>

export type DashboardCurriculum = {
  curriculum: Curriculum
  modules: Module[]
}

export type DashboardSubject = {
  subject: Subject
  curricula: DashboardCurriculum[]
}

export const concernSummarySchema = z.object({
  concern: concernSchema,
  open: z.number().int(),
  covered: z.number().int(),
  total: z.number().int(),
})

export type ConcernSummary = z.infer<typeof concernSummarySchema>

export const dailyPushReasonSchema = z.enum(['wanted', 'weakest', 'refresh'])

export type DailyPushReason = z.infer<typeof dailyPushReasonSchema>

export const dailyPushSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  curriculumId: z.string(),
  curriculumName: z.string(),
  gap: gapSchema,
  reason: dailyPushReasonSchema,
})

export type DailyPush = z.infer<typeof dailyPushSchema>

export type DailyPushResult = {
  push: DailyPush | null
  question: Question | null
}

export const decideInput = z.object({
  decision: z.string().min(1),
  opinion: z.string().min(1),
})

export type DecideInput = z.infer<typeof decideInput>

export const decideResultSchema = z.object({
  strengths: z.array(z.string()),
  blindSpots: z.array(z.string()),
  questions: z.array(z.string()),
  verdict: z.string(),
})

export type DecideResult = z.infer<typeof decideResultSchema>
