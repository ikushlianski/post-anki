import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  compareModelsInput,
  gradeComparisonCardInput,
  gradeModelResultInput,
  knowledgeItemModelIdSchema,
  type ModelComparisonEstimate,
  type ModelComparisonRunDetail,
  type ModelComparisonRunSummary,
} from '@post-anki/shared'

import * as api from '../curriculum/api-client'

const runIdInput = z.object({ runId: z.string().uuid() })
const sourceTextInput = z.object({ sourceId: z.string().min(1).max(100) })

const gradeResultServerInput = z
  .object({ runId: z.string().uuid(), modelId: knowledgeItemModelIdSchema })
  .and(gradeModelResultInput)

const gradeCardServerInput = z
  .object({
    runId: z.string().uuid(),
    modelId: knowledgeItemModelIdSchema,
    cardIndex: z.number().int().min(0).max(99),
  })
  .and(gradeComparisonCardInput)

export type CreateModelComparisonRunOutcome =
  | { ok: true; run: ModelComparisonRunDetail }
  | { ok: false; error: 'over_cost_cap' | 'failed' }

export const estimateModelComparison = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => compareModelsInput.parse(data))
  .handler(({ data }): Promise<ModelComparisonEstimate> => api.estimateModelComparison(data))

export const createModelComparisonRun = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => compareModelsInput.parse(data))
  .handler(async ({ data }): Promise<CreateModelComparisonRunOutcome> => {
    try {
      return { ok: true, run: await api.createModelComparisonRun(data) }
    } catch (err) {
      return { ok: false, error: err instanceof api.ApiError && err.code === 'over_cost_cap' ? 'over_cost_cap' : 'failed' }
    }
  })

export const listModelComparisonRuns = createServerFn({ method: 'GET' }).handler(
  (): Promise<ModelComparisonRunSummary[]> => api.listModelComparisonRuns(),
)

export const getModelComparisonRun = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => runIdInput.parse(data))
  .handler(({ data }): Promise<ModelComparisonRunDetail> => api.getModelComparisonRun(data.runId))

export const gradeModelComparisonResult = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => gradeResultServerInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => {
    const { runId, modelId, ...grade } = data

    return api.gradeModelComparisonResult(runId, modelId, grade)
  })

export const gradeModelComparisonCard = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => gradeCardServerInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => {
    const { runId, modelId, cardIndex, ...grade } = data

    return api.gradeModelComparisonCard(runId, modelId, cardIndex, grade)
  })

export const getSourceTextForComparison = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => sourceTextInput.parse(data))
  .handler(({ data }): Promise<{ text: string }> => api.getKnowledgeSourceText(data.sourceId))
