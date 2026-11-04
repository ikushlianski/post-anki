import { useEffect, useState } from 'react'
import type { TriageHistorySearchMode } from '@post-anki/shared'

import { TEXT_FIELD_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import { TriageHistoryRow } from './triage-history-item'
import { useTriageHistory } from './use-triage-history'

const SEARCH_DEBOUNCE_MS = 350

const MODE_LABELS: Record<TriageHistorySearchMode, string> = {
  both: 'Words and meaning',
  text: 'Words only',
  meaning: 'Meaning only',
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [value])

  return debounced
}

export function TriageHistoryPage() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TriageHistorySearchMode>('both')
  const q = useDebounced(text.trim())
  const { history, setReason } = useTriageHistory({ q, mode })
  const data = history.data

  return (
    <main data-testid="triage-history-page" className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Triage history</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you accepted or rejected in the last 7 days. Add or change a reason here.
        </p>
      </header>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          data-testid="triage-history-search"
          aria-label="Search triage history"
          placeholder="Search by words or meaning"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={`${TEXT_FIELD_CLASS} flex-1`}
        />
        <select
          data-testid="triage-history-mode"
          aria-label="Search mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as TriageHistorySearchMode)}
          className={TEXT_FIELD_CLASS}
        >
          {(Object.keys(MODE_LABELS) as TriageHistorySearchMode[]).map((option) => (
            <option key={option} value={option}>
              {MODE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {data?.meaningUnavailable ? (
        <p data-testid="triage-history-meaning-unavailable" className="mb-3 text-xs text-amber-700">
          Search by meaning is unavailable right now, showing word matches only.
        </p>
      ) : null}
      {setReason.isError ? (
        <p role="alert" data-testid="triage-history-save-error" className="mb-3 text-xs text-red-600">
          Could not save the reason.
        </p>
      ) : null}

      {history.isPending ? <p className="text-sm text-neutral-500">Loading…</p> : null}
      {history.isError ? (
        <p role="alert" data-testid="triage-history-load-error" className="text-sm text-red-600">
          Could not load triage history.
        </p>
      ) : null}
      {data && data.decisions.length === 0 ? (
        <p data-testid="triage-history-empty" className="text-sm text-neutral-500">
          {q ? 'Nothing matches that search.' : 'No triage decisions in the last 7 days.'}
        </p>
      ) : null}
      {data && data.decisions.length > 0 ? (
        <ul className="space-y-3">
          {data.decisions.map((item) => (
            <TriageHistoryRow
              key={item.id}
              item={item}
              disabled={setReason.isPending}
              onSetReason={(decisionId, reasonCode) => setReason.mutate({ decisionId, reasonCode })}
            />
          ))}
        </ul>
      ) : null}
    </main>
  )
}
