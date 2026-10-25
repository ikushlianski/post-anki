import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  editKnowledgeBitQuestionVariantInput,
  bulkApproveKnowledgeBitsInput,
  gradeKnowledgeBitInput,
  triageKnowledgeBitInput,
  undoTriageKnowledgeBitInput,
  type TriageKnowledgeBitResponse,
  type GradeKnowledgeBitResponse,
  createManualKnowledgeItemInput,
  type KnowledgeBitFeedbackByModelResponse,
  type RejectKnowledgeBitResponse,
  type PendingKnowledgeBitForReview,
  regenerateKnowledgeSourceInput,
  type KnowledgeSourceRegenerationStatus,
  type KnowledgeDeletionResponse,
  type BulkApproveKnowledgeBitsResponse,
  type PendingKnowledgeBitReviewCountResponse,
  type PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import {
  approveKnowledgeBit,
  bulkApproveKnowledgeBits,
  createManualKnowledgeItem,
  discardKnowledgeSource,
  editKnowledgeBit,
  getKnowledgeBitFeedbackByModel,
  gradeKnowledgeBit,
  getKnowledgeBitModelSuggestion,
  getKnowledgeSourceRegeneration,
  getPendingKnowledgeBitCount,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
  regenerateKnowledgeSource,
  updateKnowledgeBitFeedback,
  rejectKnowledgeBit,
  triageKnowledgeBit,
  undoTriageKnowledgeBit,
  restoreRejectedKnowledgeBit,
  type RegenerateKnowledgeSourceOutcome,
} from '../curriculum/api-client'

export const getPendingKnowledgeBitsForReview = createServerFn({ method: 'GET' }).handler(
  (): Promise<PendingKnowledgeSourceForReview[]> => listPendingKnowledgeBitsForReview(),
)

export const getPendingKnowledgeBitsWithAttentionForReview = createServerFn({
  method: 'GET',
}).handler(
  (): Promise<PendingKnowledgeSourceForReview[]> =>
    listPendingKnowledgeBitsForReview({ attention: true }),
)

const bitIdInput = z.object({ bitId: z.string().min(1) })

export const approveKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => approveKnowledgeBit(data.bitId))

const triageKnowledgeBitForReviewInput = z
  .object({ bitId: z.string().min(1) })
  .and(triageKnowledgeBitInput)

export const triageKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => triageKnowledgeBitForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<TriageKnowledgeBitResponse> =>
      triageKnowledgeBit(data.bitId, data.keepVariantIds),
  )

const undoTriageKnowledgeBitForReviewInput = z
  .object({ bitId: z.string().min(1) })
  .and(undoTriageKnowledgeBitInput)

export const undoTriageKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => undoTriageKnowledgeBitForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<{ ok: true }> => undoTriageKnowledgeBit(data.bitId, data.restoreVariantIds),
  )

export const rejectKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<RejectKnowledgeBitResponse> => rejectKnowledgeBit(data.bitId))

export const restoreKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => restoreRejectedKnowledgeBit(data.bitId))

const gradeKnowledgeBitForReviewInput = z
  .object({ bitId: z.string().min(1) })
  .and(gradeKnowledgeBitInput)

export const gradeKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => gradeKnowledgeBitForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<GradeKnowledgeBitResponse> =>
      gradeKnowledgeBit(data.bitId, { rating: data.rating, note: data.note }),
  )

export const getKnowledgeBitFeedbackByModelForAdmin = createServerFn({ method: 'GET' }).handler(
  (): Promise<KnowledgeBitFeedbackByModelResponse> => getKnowledgeBitFeedbackByModel(),
)

const editKnowledgeBitQuestionVariantForReviewInput = z
  .object({ variantId: z.string().min(1) })
  .and(editKnowledgeBitQuestionVariantInput)

export const editKnowledgeBitQuestionVariantForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => editKnowledgeBitQuestionVariantForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<{ ok: true; variantId: string }> =>
      editKnowledgeBitQuestionVariant(data.variantId, data.prompt, data.answer),
  )

const editKnowledgeBitForReviewInput = z.object({
  bitId: z.string().min(1),
  body: z.string().trim().min(1),
  background: z.string().trim().min(1).nullable(),
})

export const editKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => editKnowledgeBitForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<{ ok: true }> => editKnowledgeBit(data.bitId, data.body, data.background),
  )

export const bulkApproveKnowledgeBitsForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bulkApproveKnowledgeBitsInput.parse(data))
  .handler(
    ({ data }): Promise<BulkApproveKnowledgeBitsResponse> =>
      bulkApproveKnowledgeBits(data.knowledgeBitIds),
  )

export const getPendingKnowledgeBitCountForNav = createServerFn({ method: 'GET' }).handler(
  (): Promise<PendingKnowledgeBitReviewCountResponse> => getPendingKnowledgeBitCount(),
)

const regenerateKnowledgeSourceForReviewInput = z
  .object({ sourceId: z.string().min(1) })
  .and(regenerateKnowledgeSourceInput)

export const regenerateKnowledgeSourceForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => regenerateKnowledgeSourceForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<RegenerateKnowledgeSourceOutcome> =>
      regenerateKnowledgeSource(data.sourceId, data.modelId, data.text),
  )

const sourceIdInput = z.object({ sourceId: z.string().min(1) })

export const discardKnowledgeSourceForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => sourceIdInput.parse(data))
  .handler(({ data }): Promise<KnowledgeDeletionResponse> => discardKnowledgeSource(data.sourceId))

export const getKnowledgeSourceRegenerationForReview = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => sourceIdInput.parse(data))
  .handler(
    ({ data }): Promise<KnowledgeSourceRegenerationStatus> =>
      getKnowledgeSourceRegeneration(data.sourceId),
  )

const updateKnowledgeBitFeedbackForReviewInput = z.object({
  feedbackId: z.string().min(1),
  reasonCode: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  rating: z.number().int().min(1).max(5).optional(),
})

export const updateKnowledgeBitFeedbackForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateKnowledgeBitFeedbackForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<{ ok: true }> => {
      const { feedbackId, ...patch } = data
      return updateKnowledgeBitFeedback(feedbackId, patch as Parameters<typeof updateKnowledgeBitFeedback>[1])
    },
  )

export const getKnowledgeBitModelSuggestionForAdmin = createServerFn({ method: 'GET' }).handler(
  () => getKnowledgeBitModelSuggestion(),
)

const createManualKnowledgeItemForReviewInput = z
  .object({ sourceId: z.string().min(1) })
  .and(createManualKnowledgeItemInput)

export const createManualKnowledgeItemForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createManualKnowledgeItemForReviewInput.parse(data))
  .handler(
    ({ data }): Promise<PendingKnowledgeBitForReview> =>
      createManualKnowledgeItem(data.sourceId, { front: data.front, back: data.back, example: data.example }),
  )
