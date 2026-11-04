import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { knowledgeBitFeedbackReasonSchema } from '@post-anki/shared'

import { RejectedCardsScreen } from '../knowledge-bit/rejected-cards-screen'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/rejected')({
  head: pageHead('Rejected cards'),
  validateSearch: z.object({
    reason: knowledgeBitFeedbackReasonSchema.optional().catch(undefined),
    subjectId: z.string().trim().min(1).max(200).optional().catch(undefined),
    q: z.string().trim().max(200).optional().catch(undefined),
  }),
  component: RejectedCardsRoute,
})

function RejectedCardsRoute() {
  const { reason, subjectId, q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const search = (next: { reason?: typeof reason; subjectId?: string; q?: string }) => ({
    ...(next.reason ? { reason: next.reason } : {}),
    ...(next.subjectId ? { subjectId: next.subjectId } : {}),
    ...(next.q ? { q: next.q } : {}),
  })

  return (
    <RejectedCardsScreen
      reason={reason}
      subjectId={subjectId}
      q={q}
      onReasonChange={(next) => void navigate({ search: search({ reason: next, subjectId, q }) })}
      onSubjectChange={(next) => void navigate({ search: search({ reason, subjectId: next, q }) })}
      onQueryChange={(next) => void navigate({ search: search({ reason, subjectId, q: next }), replace: true })}
    />
  )
}
