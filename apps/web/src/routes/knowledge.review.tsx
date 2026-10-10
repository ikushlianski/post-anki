import { createFileRoute } from '@tanstack/react-router'

import { AnkiReviewScreen } from '../knowledge-bit/anki-review-screen'
import type { AnkiReviewScope } from '../knowledge-bit/anki-review-screen'

export const Route = createFileRoute('/knowledge/review')({
  validateSearch: (search: Record<string, unknown>): AnkiReviewScope => ({
    tagId: typeof search.tagId === 'string' ? search.tagId : undefined,
    topicId: typeof search.topicId === 'string' ? search.topicId : undefined,
    knowledgeBitId:
      typeof search.knowledgeBitId === 'string' ? search.knowledgeBitId : undefined,
    subjectId: typeof search.subjectId === 'string' ? search.subjectId : undefined,
  }),
  component: ReviewPage,
})

function ReviewPage() {
  return <AnkiReviewScreen scope={Route.useSearch()} />
}
