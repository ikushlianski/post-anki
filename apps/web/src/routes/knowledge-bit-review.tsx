import { createFileRoute } from '@tanstack/react-router'

import { getPendingKnowledgeBitsForReview } from '../knowledge-bit/knowledge-bit-review.api'
import { KnowledgeBitReviewPanel } from '../knowledge-bit/knowledge-bit-review-panel'

export const Route = createFileRoute('/knowledge-bit-review')({
  component: KnowledgeBitReviewPage,
  loader: () => getPendingKnowledgeBitsForReview(),
})

function KnowledgeBitReviewPage() {
  const sources = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Approve suggestions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Check each suggested question and answer. Approved questions go into your review queue.
        </p>
      </header>

      <KnowledgeBitReviewPanel initialSources={sources} />
    </main>
  )
}
