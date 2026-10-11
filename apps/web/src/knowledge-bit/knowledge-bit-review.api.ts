import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  editKnowledgeBitQuestionVariantInput,
  bulkApproveKnowledgeBitsInput,
  knowledgeBitRejectReasonSchema,
  type KnowledgeBitFeedbackByModelResponse,
  type RejectKnowledgeBitResponse,
  regenerateKnowledgeSourceInput,
  type KnowledgeSourceRegenerationStatus,
  type BulkApproveKnowledgeBitsResponse,
  type PendingKnowledgeBitReviewCountResponse,
  type PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import {
  approveKnowledgeBit,
  bulkApproveKnowledgeBits,
  editKnowledgeBit,
  getKnowledgeBitFeedbackByModel,
  getKnowledgeSourceRegeneration,
  getPendingKnowledgeBitCount,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
  regenerateKnowledgeSource,
  rejectKnowledgeBit,
  restoreRejectedKnowledgeBit,
  setKnowledgeBitFeedbackReason,
  type RegenerateKnowledgeSourceOutcome,
} from '../curriculum/api-client'

export const getPendingKnowledgeBitsForReview = createServerFn({ method: 'GET' }).handler(
  (): Promise<PendingKnowledgeSourceForReview[]> => listPendingKnowledgeBitsForReview(),
)

const bitIdInput = z.object({ bitId: z.string().min(1) })

export const approveKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => approveKnowledgeBit(data.bitId))

export const rejectKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<RejectKnowledgeBitResponse> => rejectKnowledgeBit(data.bitId))

export const restoreKnowledgeBitForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<{ ok: true }> => restoreRejectedKnowledgeBit(data.bitId))

const feedbackReasonInput = z.object({
  feedbackId: z.string().min(1),
  reasonCode: knowledgeBitRejectReasonSchema,
  note: z.string().trim().max(500).optional(),
})

export const setKnowledgeBitFeedbackReasonForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => feedbackReasonInput.parse(data))
  .handler(
    ({ data }): Promise<{ ok: true }> =>
      setKnowledgeBitFeedbackReason(data.feedbackId, data.reasonCode, data.note),
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
      regenerateKnowledgeSource(data.sourceId, data.modelId),
  )

const sourceIdInput = z.object({ sourceId: z.string().min(1) })

export const getKnowledgeSourceRegenerationForReview = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => sourceIdInput.parse(data))
  .handler(
    ({ data }): Promise<KnowledgeSourceRegenerationStatus> =>
      getKnowledgeSourceRegeneration(data.sourceId),
  )
