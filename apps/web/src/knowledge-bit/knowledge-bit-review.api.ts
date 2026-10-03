import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  editKnowledgeBitQuestionVariantInput,
  type PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import {
  approveKnowledgeBit,
  editKnowledgeBit,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
  rejectKnowledgeBit,
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
  .handler(({ data }): Promise<{ ok: true }> => rejectKnowledgeBit(data.bitId))

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
