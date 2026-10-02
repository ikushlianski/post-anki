import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { listTagNodes } from './curriculum.api'

// Browse everything under one tag — same result linking rules as find.tsx's
// search page.
export function TagNodeBrowser({ tagId }: { tagId: string }) {
  const { data: results, isLoading, isError } = useQuery({
    queryKey: ['tag-nodes', tagId],
    queryFn: () => listTagNodes({ data: tagId }),
    retry: false,
  })

  if (isLoading) {
    return (
      <p className="mt-3 text-sm text-neutral-400" data-testid="tag-browse-loading">
        Loading everything tagged this…
      </p>
    )
  }

  if (isError) {
    return (
      <p className="mt-3 text-sm text-red-600" data-testid="tag-browse-error">
        Couldn't load what's tagged this — try again.
      </p>
    )
  }

  if (!results || results.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-500" data-testid="tag-browse-empty">
        Nothing is tagged this yet.
      </p>
    )
  }

  return (
    <ul className="mt-3 space-y-2" data-testid="tag-browse-results">
      {results.map((result) => (
        <li
          key={`${result.kind}-${result.id}`}
          data-testid={`tag-browse-result-${result.kind}-${result.id}`}
          className="rounded-lg border border-neutral-200 bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            {result.curriculumId ? (
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: result.curriculumId }}
                className="text-sm font-medium underline underline-offset-2 hover:text-neutral-900"
              >
                {result.title}
              </Link>
            ) : result.kind === 'bit' ? (
              <Link
                to="/knowledge/answer"
                search={{ knowledgeBitId: result.id }}
                className="text-sm font-medium underline underline-offset-2 hover:text-neutral-900"
              >
                {result.title}
              </Link>
            ) : (
              <span className="text-sm font-medium">{result.title}</span>
            )}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
              {result.kind}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {result.curriculumName ?? 'Not yet placed in a course'}
          </p>
        </li>
      ))}
    </ul>
  )
}
