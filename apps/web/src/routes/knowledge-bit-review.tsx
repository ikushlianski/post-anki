import { createFileRoute } from '@tanstack/react-router'

import { getPendingKnowledgeBitsForReview } from '../knowledge-bit/knowledge-bit-review.api'
import { KnowledgeBitReviewPage } from '../knowledge-bit/knowledge-bit-review-page'
import { KnowledgeBitReviewLoading } from '../knowledge-bit/knowledge-bit-review-loading'
import { KnowledgeBitReviewLoadError } from '../knowledge-bit/knowledge-bit-review-load-error'

export const Route = createFileRoute('/knowledge-bit-review')({
  component: KnowledgeBitReviewRoute,
  pendingComponent: KnowledgeBitReviewLoading,
  errorComponent: KnowledgeBitReviewLoadError,
  loader: () => getPendingKnowledgeBitsForReview(),
})

function KnowledgeBitReviewRoute() {
  const sources = Route.useLoaderData()

  return <KnowledgeBitReviewPage sources={sources} />
}
