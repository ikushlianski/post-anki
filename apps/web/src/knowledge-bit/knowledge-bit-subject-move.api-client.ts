import type { BulkMoveKnowledgeBitsResponse } from '@post-anki/shared'

import { request } from '../curriculum/api-client'

export function moveKnowledgeBitToSubject(
  bitId: string,
  subjectId: string,
): Promise<BulkMoveKnowledgeBitsResponse> {
  return request<BulkMoveKnowledgeBitsResponse>('/knowledge-bits/moves', {
    method: 'POST',
    body: { knowledgeBitIds: [bitId], subjectId },
  })
}
