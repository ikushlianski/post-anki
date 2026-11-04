import type { NotionIngestionSource, NotionRunResult } from '@post-anki/shared'

import { safeHttpUrl } from './notion-failure-text'
import { FREQUENCY_LABELS, lastRunFailureText, lastRunText, nextRunText, notionRunResultText } from './notion-run-result-text'

const BUTTON_CLASS =
  'min-h-[44px] rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 sm:min-h-0'

export interface NotionSourceListProps {
  sources: NotionIngestionSource[]
  busyId: string | null
  runningId: string | null
  confirmDeleteId: string | null
  results: Record<string, NotionRunResult | { error: string }>
  onEdit: (source: NotionIngestionSource) => void
  onTogglePause: (source: NotionIngestionSource) => void
  onIngest: (source: NotionIngestionSource) => void
  onAskDelete: (source: NotionIngestionSource) => void
  onConfirmDelete: (source: NotionIngestionSource) => void
  onCancelDelete: () => void
}

function resultText(result: NotionRunResult | { error: string }): string {
  return 'error' in result ? result.error : notionRunResultText(result)
}

export function NotionSourceList(props: NotionSourceListProps) {
  const { sources, busyId, runningId, confirmDeleteId, results } = props

  if (sources.length === 0) {
    return (
      <p data-testid="notion-sources-empty" className="text-sm text-neutral-500">
        No sources yet. Add a Notion page to start importing its items as cards.
      </p>
    )
  }

  return (
    <ul className="space-y-3" data-testid="notion-source-list">
      {sources.map((source) => {
        const running = runningId === source.id
        const locked = busyId !== null || runningId !== null
        const result = results[source.id]

        return (
          <li
            key={source.id}
            data-testid={`notion-source-${source.id}`}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{source.name}</p>
              {source.paused ? (
                <span
                  data-testid={`notion-source-paused-${source.id}`}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                >
                  Paused
                </span>
              ) : null}
            </div>
            {safeHttpUrl(source.pageUrl) ? (
              <a
                href={safeHttpUrl(source.pageUrl) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`notion-source-link-${source.id}`}
                className="mt-0.5 block break-all text-xs text-blue-600 underline"
              >
                {source.pageUrl}
              </a>
            ) : (
              <p className="mt-0.5 break-all text-xs text-neutral-400">{source.pageUrl}</p>
            )}
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2">
              <div>
                <dt className="inline text-neutral-400">Subject: </dt>
                <dd className="inline">{source.subjectPath.join(' / ')}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-400">Items per run: </dt>
                <dd className="inline">{source.itemsPerRun}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-400">Frequency: </dt>
                <dd className="inline">{FREQUENCY_LABELS[source.frequency]}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-400">Removes from Notion: </dt>
                <dd className="inline">{source.removeAfterImport ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-neutral-600">{lastRunText(source.lastRun)}</p>
            {lastRunFailureText(source.lastRun) ? (
              <p data-testid={`notion-source-failure-${source.id}`} className="text-xs text-red-700">
                {lastRunFailureText(source.lastRun)}
              </p>
            ) : null}
            {!source.paused && nextRunText(source.nextRunAt) ? (
              <p data-testid={`notion-source-next-run-${source.id}`} className="text-xs text-neutral-600">
                {nextRunText(source.nextRunAt)}
              </p>
            ) : null}

            {result ? (
              <p
                role="status"
                data-testid={`notion-source-result-${source.id}`}
                className="mt-2 text-sm text-neutral-800"
              >
                {resultText(result)}
              </p>
            ) : null}

            {confirmDeleteId === source.id ? (
              <div className="mt-3 space-y-2" data-testid={`notion-source-confirm-${source.id}`}>
                <p className="text-sm text-red-700">
                  Delete this source? Cards already imported are kept, and nothing changes in Notion.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid={`notion-source-confirm-delete-${source.id}`}
                    disabled={locked}
                    onClick={() => props.onConfirmDelete(source)}
                    className="min-h-[44px] rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 sm:min-h-0"
                  >
                    Delete source
                  </button>
                  <button type="button" disabled={locked} onClick={props.onCancelDelete} className={BUTTON_CLASS}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`notion-source-ingest-${source.id}`}
                  disabled={locked}
                  onClick={() => props.onIngest(source)}
                  className="min-h-[44px] rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 sm:min-h-0"
                >
                  {running ? 'Ingesting...' : 'Ingest Now'}
                </button>
                <button type="button" disabled={locked} onClick={() => props.onEdit(source)} className={BUTTON_CLASS}>
                  Edit
                </button>
                <button
                  type="button"
                  data-testid={`notion-source-pause-${source.id}`}
                  disabled={locked}
                  onClick={() => props.onTogglePause(source)}
                  className={BUTTON_CLASS}
                >
                  {source.paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  data-testid={`notion-source-delete-${source.id}`}
                  disabled={locked}
                  onClick={() => props.onAskDelete(source)}
                  className="min-h-[44px] rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40 sm:min-h-0"
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
