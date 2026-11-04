import { Link } from '@tanstack/react-router'

import type { SubjectSourceGroup } from './subject-source-group'

export type SourcesBySubjectViewProps = {
  groups: SubjectSourceGroup[]
  notionFailed: boolean
  libraryFailed: boolean
  subjectsFailed?: boolean
  onRetry?: () => void
}

const ORIGIN_LABEL = { notion: 'Notion', library: 'Library' } as const

function RetryButton({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null

  return (
    <button
      type="button"
      data-testid="sources-retry"
      onClick={onRetry}
      className="mt-2 block min-h-[44px] rounded-md bg-neutral-900 px-3 text-sm font-medium text-white"
    >
      Try again
    </button>
  )
}

export function SourcesBySubjectView({
  groups,
  notionFailed,
  libraryFailed,
  subjectsFailed = false,
  onRetry,
}: SourcesBySubjectViewProps) {
  const failed = notionFailed || libraryFailed

  if (groups.length === 0 && notionFailed && libraryFailed) {
    return (
      <p role="alert" data-testid="sources-error" className="text-sm text-red-700">
        Could not load your sources.
        <RetryButton onRetry={onRetry} />
      </p>
    )
  }

  return (
    <div>
      {failed ? (
        <p role="alert" data-testid="sources-partial-error" className="mb-4 text-sm text-amber-800">
          {notionFailed ? 'Notion sources' : 'Library sources'} could not be loaded, so this list is incomplete.
          <RetryButton onRetry={onRetry} />
        </p>
      ) : null}

      {subjectsFailed ? (
        <p data-testid="sources-subjects-failed" className="mb-4 text-sm text-amber-800">
          Subject paths unavailable, so subjects show their short names.
        </p>
      ) : null}

      {groups.length === 0 && !failed ? (
        <p data-testid="sources-empty" className="text-sm text-neutral-500">
          No sources yet. Add a <Link to="/notion-sources" className="underline">Notion page</Link> or{' '}
          <Link to="/add-knowledge" className="underline">capture a link</Link> and it will show up here under its subject.
        </p>
      ) : null}

      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.subjectId}
            aria-labelledby={`sources-heading-${group.subjectId}`}
            data-testid={`sources-group-${group.subjectId}`}
          >
            <h2 id={`sources-heading-${group.subjectId}`} className="mb-2 text-sm font-semibold text-neutral-700">
              {group.subjectName}{' '}
              <span className="font-normal text-neutral-400">
                <span aria-hidden="true">({group.items.length})</span>
                <span className="sr-only">{group.items.length === 1 ? '1 source' : `${group.items.length} sources`}</span>
              </span>
            </h2>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  data-testid={`sources-item-${item.id}`}
                  className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-neutral-200 bg-white px-4 py-2"
                >
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-[44px] items-center break-all text-sm font-medium text-neutral-900 underline"
                    >
                      {item.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="break-all text-sm font-medium">{item.title}</span>
                  )}
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {ORIGIN_LABEL[item.origin]}
                  </span>
                  <span className="text-xs text-neutral-500">{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
