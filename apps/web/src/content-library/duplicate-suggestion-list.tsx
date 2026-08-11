import { useState } from 'react'

import type {
  LibrarySource,
  ResolveSourceDuplicateSuggestionInput,
  SourceDuplicateSuggestion,
  TriggerSourceDuplicateScanResult,
} from '@post-anki/shared'

import { buildSourceLookup, sourceDisplayLabel } from './source-lookup'
import type { ApiResult } from './content-library.model'

export interface DuplicateSuggestionListProps {
  suggestions: SourceDuplicateSuggestion[]
  sources: LibrarySource[]
  onScan: () => Promise<ApiResult<TriggerSourceDuplicateScanResult>>
  onScanned: () => void | Promise<void>
  onResolve: (
    suggestionId: string,
    input: ResolveSourceDuplicateSuggestionInput,
  ) => Promise<ApiResult<SourceDuplicateSuggestion>>
  onResolved: () => void | Promise<void>
}

const MATCH_KIND_LABEL: Record<SourceDuplicateSuggestion['matchKind'], string> = {
  url_match: 'Same URL',
  embedding_similarity: 'Similar content',
}

export function DuplicateSuggestionList({
  suggestions,
  sources,
  onScan,
  onScanned,
  onResolve,
  onResolved,
}: DuplicateSuggestionListProps) {
  const [scanning, setScanning] = useState(false)
  const lookup = buildSourceLookup(sources)

  async function scan() {
    setScanning(true)
    await onScan()
    setScanning(false)
    await onScanned()
  }

  return (
    <div data-testid="duplicate-suggestion-list">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Duplicate suggestions
        </h3>
        <button
          type="button"
          disabled={scanning}
          onClick={() => void scan()}
          data-testid="duplicate-scan-button"
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Scan for duplicates'}
        </button>
      </div>

      {suggestions.length === 0 ? (
        <p data-testid="duplicate-suggestion-empty" className="text-sm text-neutral-500">
          No pending duplicate suggestions.
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((suggestion) => (
            <DuplicateSuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              labelA={sourceDisplayLabel(lookup[suggestion.sourceAId])}
              labelB={sourceDisplayLabel(lookup[suggestion.sourceBId])}
              onResolve={onResolve}
              onResolved={onResolved}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DuplicateSuggestionRow({
  suggestion,
  labelA,
  labelB,
  onResolve,
  onResolved,
}: {
  suggestion: SourceDuplicateSuggestion
  labelA: string
  labelB: string
  onResolve: DuplicateSuggestionListProps['onResolve']
  onResolved: DuplicateSuggestionListProps['onResolved']
}) {
  const [busy, setBusy] = useState(false)

  async function resolve(status: 'acknowledged' | 'dismissed') {
    setBusy(true)
    await onResolve(suggestion.id, { status })
    setBusy(false)
    await onResolved()
  }

  return (
    <li
      data-testid="duplicate-suggestion-row"
      className="rounded-lg border border-neutral-200 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {MATCH_KIND_LABEL[suggestion.matchKind]}
        </span>
        {suggestion.similarity !== null ? (
          <span className="text-xs text-neutral-400">
            {Math.round(suggestion.similarity * 100)}% similar
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-neutral-900">{labelA}</p>
      <p className="text-sm text-neutral-900">{labelB}</p>
      <p className="mt-1 text-xs text-neutral-500">{suggestion.reason}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve('acknowledged')}
          data-testid="duplicate-acknowledge"
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Acknowledge
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve('dismissed')}
          data-testid="duplicate-dismiss"
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          Not a duplicate
        </button>
      </div>
    </li>
  )
}
