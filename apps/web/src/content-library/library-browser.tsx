import { useState } from 'react'

import type { LibrarySource, RefetchSourceResult } from '@post-anki/shared'

import { FetchStateBadge } from './fetch-state-badge'
import type { ApiResult } from './content-library.model'

export interface LibraryBrowserProps {
  sources: LibrarySource[]
  onRefetch: (sourceId: string) => Promise<ApiResult<RefetchSourceResult>>
  onRefetched: () => void | Promise<void>
}

export function LibraryBrowser({ sources, onRefetch, onRefetched }: LibraryBrowserProps) {
  if (sources.length === 0) {
    return (
      <p data-testid="library-browser-empty" className="text-sm text-neutral-500">
        Nothing captured yet.
      </p>
    )
  }

  return (
    <div data-testid="library-browser" className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2">Curriculum</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Fetch state</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <LibrarySourceRow
              key={source.id}
              source={source}
              onRefetch={onRefetch}
              onRefetched={onRefetched}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LibrarySourceRow({
  source,
  onRefetch,
  onRefetched,
}: {
  source: LibrarySource
  onRefetch: LibraryBrowserProps['onRefetch']
  onRefetched: LibraryBrowserProps['onRefetched']
}) {
  const [busy, setBusy] = useState(false)

  async function refetch() {
    setBusy(true)
    await onRefetch(source.id)
    setBusy(false)
    await onRefetched()
  }

  return (
    <tr data-testid="library-source-row" className="border-t border-neutral-200">
      <td className="px-4 py-2">
        <p className="font-medium text-neutral-900">{source.title ?? source.value}</p>
        <p className="text-xs text-neutral-400">{source.subjectName}</p>
      </td>
      <td className="px-4 py-2 text-neutral-500">{source.curriculumName}</td>
      <td className="px-4 py-2 text-neutral-500">{source.kind}</td>
      <td className="px-4 py-2">
        <FetchStateBadge state={source.fetchState} />
      </td>
      <td className="px-4 py-2 text-right">
        {source.kind === 'link' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void refetch()}
            data-testid="library-refetch-button"
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
          >
            {busy ? 'Fetching…' : 'Re-fetch'}
          </button>
        ) : null}
      </td>
    </tr>
  )
}
