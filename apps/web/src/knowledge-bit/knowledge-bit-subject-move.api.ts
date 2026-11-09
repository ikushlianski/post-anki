import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { BulkMoveKnowledgeBitsResponse } from '@post-anki/shared'

import * as api from './knowledge-bit-subject-move.api-client'

const moveInput = z.object({ bitId: z.string().min(1), subjectId: z.string().min(1) })

export const moveKnowledgeBitToSubjectForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => moveInput.parse(data))
  .handler(
    ({ data }): Promise<BulkMoveKnowledgeBitsResponse> =>
      api.moveKnowledgeBitToSubject(data.bitId, data.subjectId),
  )
