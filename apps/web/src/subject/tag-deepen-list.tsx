import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { listTagMasteryStatuses } from '../curriculum/curriculum.api'
import type { TagMasteryStatus } from '../curriculum/api-client'

const DEEPEN_LABEL: Record<'struggling' | 'practicing', string> = {
  struggling: 'weak',
  practicing: 'shallow',
}

function isDeepenCandidate(
  row: TagMasteryStatus,
): row is TagMasteryStatus & { status: 'struggling' | 'practicing' } {
  return row.status === 'struggling' || row.status === 'practicing'
}

export function TagDeepenList() {
  const { data: masteryStatuses } = useQuery({
    queryKey: ['tags-mastery'],
    queryFn: () => listTagMasteryStatuses(),
  })

  const candidates = (masteryStatuses ?? []).filter(isDeepenCandidate)

  return (
    <div className="mb-10" data-testid="tag-deepen-list">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Worth revisiting
      </h2>

      {candidates.length === 0 ? (
        <p data-testid="tag-deepen-list-empty" className="text-sm text-neutral-500">
          Nothing weak or shallow right now.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {candidates.map((tag) => (
            <li key={tag.tagId}>
              <Link
                to="/knowledge/answer"
                search={{ tagId: tag.tagId }}
                data-testid={`tag-deepen-list-item-${tag.tagId}`}
                className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800 hover:underline"
              >
                #{tag.name}
                <span className="text-xs font-medium text-amber-500">
                  {DEEPEN_LABEL[tag.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
