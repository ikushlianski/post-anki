import { createFileRoute } from '@tanstack/react-router'

import { getPendingKnowledgeBitsForReview } from '../knowledge-bit/knowledge-bit-review.api'
import { KnowledgeBitReviewPage } from '../knowledge-bit/knowledge-bit-review-page'

export const Route = createFileRoute('/knowledge-bit-review')({
  component: KnowledgeBitReviewRoute,
  loader: () => getPendingKnowledgeBitsForReview(),
})

function KnowledgeBitReviewRoute() {
  const sources = Route.useLoaderData()

  return <KnowledgeBitReviewPage sources={sources} />
}
