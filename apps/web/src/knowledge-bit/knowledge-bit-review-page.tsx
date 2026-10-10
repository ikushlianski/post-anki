import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'

export function KnowledgeBitReviewPage({
  sources,
}: {
  sources: PendingKnowledgeSourceForReview[]
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
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
