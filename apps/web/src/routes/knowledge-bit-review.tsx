import { createFileRoute } from '@tanstack/react-router'

import { getPendingKnowledgeBitsWithTotalForReview } from '../knowledge-bit/knowledge-bit-review.api'
import { KnowledgeBitReviewPage } from '../knowledge-bit/knowledge-bit-review-page'
import { KnowledgeBitReviewLoading } from '../knowledge-bit/knowledge-bit-review-loading'
import { KnowledgeBitReviewLoadError } from '../knowledge-bit/knowledge-bit-review-load-error'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge-bit-review')({
  head: pageHead('Triage'),
  component: KnowledgeBitReviewRoute,
  pendingComponent: KnowledgeBitReviewLoading,
  errorComponent: KnowledgeBitReviewLoadError,
  loader: () => getPendingKnowledgeBitsWithTotalForReview(),
})

function KnowledgeBitReviewRoute() {
  const { items, total } = Route.useLoaderData()

  return <KnowledgeBitReviewPage sources={items} pendingTotal={total} />
}
