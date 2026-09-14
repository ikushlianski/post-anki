import { useQuery } from '@tanstack/react-query'
import { curriculumCardsSummaryQuery } from './curriculum.queries'

export function CardsSummaryBadge({ curriculumId }: { curriculumId: string }) {
  const { data } = useQuery(curriculumCardsSummaryQuery(curriculumId))

  if (!data || (data.cardsReady === 0 && data.topicsGenerating === 0)) {
    return null
  }

  return (
    <p className="text-xs text-neutral-500" data-testid="cards-summary-badge">
      {data.cardsReady} card{data.cardsReady === 1 ? '' : 's'} ready so far
      {data.topicsGenerating > 0
        ? ` · still preparing ${data.topicsGenerating} topic${data.topicsGenerating === 1 ? '' : 's'}`
        : ''}
    </p>
  )
}
