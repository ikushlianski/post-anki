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
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge bit review</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Newly detected knowledge bits — review the generated question and answer before they
          become visible to learners.
        </p>
      </header>

      <KnowledgeBitReviewPanel initialSources={sources} />
    </main>
  )
}
