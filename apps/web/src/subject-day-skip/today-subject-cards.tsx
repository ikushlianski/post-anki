import { useQuery } from '@tanstack/react-query'

import { getReviewCards } from '../knowledge-bit/anki-review.api'
import { browserTimeZone } from '../shared/browser-time-zone'

const CARD_LIMIT = 50

export function TodaySubjectCards({ subjectId }: { subjectId: string }) {
  const query = useQuery({
    queryKey: ['anki-review-queue', 'today-list', subjectId],
    queryFn: () => getReviewCards({ data: { limit: CARD_LIMIT, tz: browserTimeZone(), aheadDays: 0, subjectId } }),
  })

  if (query.isPending) {
    return <p className="px-3 pb-3 text-sm text-neutral-500">Loading cards…</p>
  }

  if (query.isError || !query.data.ok) {
    return (
      <p role="alert" className="px-3 pb-3 text-sm text-red-600">
        Couldn't load these cards.
      </p>
    )
  }

  if (query.data.cards.length === 0) {
    return <p className="px-3 pb-3 text-sm text-neutral-500">No cards due.</p>
  }

  return (
    <ul data-testid={`today-subject-cards-${subjectId}`} className="space-y-1 px-3 pb-3 text-sm text-neutral-700">
      {query.data.cards.map((card) => (
        <li key={card.variantId} className="truncate">
          {card.prompt}
        </li>
      ))}
    </ul>
  )
}
