import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { ChatQueueOutcomesSection } from '../analytics/chat-queue-outcomes/chat-queue-outcomes-section'
import { NothingExtractedSection } from '../analytics/nothing-extracted/nothing-extracted-section'
import { RejectReasonsSection } from '../analytics/reject-reasons/reject-reasons-section'
import { ReviewStatisticsSection } from '../analytics/review-statistics/review-statistics-section'
import { pageHead } from '../shared/page-title'

interface StatisticsSearch {
  subjectId?: string
}

export const Route = createFileRoute('/statistics')({
  head: pageHead('Statistics'),
  validateSearch: (search: Record<string, unknown>): StatisticsSearch =>
    typeof search.subjectId === 'string' && search.subjectId !== '' ? { subjectId: search.subjectId } : {},
  component: StatisticsPage,
})

function StatisticsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          What is coming due, how well you remember, and which answer buttons you press.
        </p>
      </header>

      <ReviewStatisticsSection
        subjectId={search.subjectId ?? null}
        onSubjectChange={(subjectId) =>
          void navigate({ search: subjectId ? { subjectId } : {}, replace: true })
        }
      />

      <RejectReasonsSection />

      <ChatQueueOutcomesSection />

      <NothingExtractedSection />
    </main>
  )
}
