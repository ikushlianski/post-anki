import { createFileRoute } from '@tanstack/react-router'

import { getPendingKnowledgeBitsWithAttentionForReview } from '../knowledge-bit/knowledge-bit-review.api'
import { KnowledgeBitReviewPage } from '../knowledge-bit/knowledge-bit-review-page'
import { KnowledgeBitReviewLoading } from '../knowledge-bit/knowledge-bit-review-loading'
import { KnowledgeBitReviewLoadError } from '../knowledge-bit/knowledge-bit-review-load-error'

export const Route = createFileRoute('/knowledge-bit-review')({
  component: KnowledgeBitReviewRoute,
  pendingComponent: KnowledgeBitReviewLoading,
  errorComponent: KnowledgeBitReviewLoadError,
  loader: () => getPendingKnowledgeBitsWithAttentionForReview(),
})

function KnowledgeBitReviewRoute() {
  const sources = Route.useLoaderData()

  return <KnowledgeBitReviewPage sources={sources} />
}
