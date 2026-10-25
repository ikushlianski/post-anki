import { useState } from 'react'

import { MEANING_WORDS_MAX } from './knowledge-browser-filters'
import type { BrowserMatches } from './use-knowledge-browser-matches'

export const MEANING_MESSAGES = {
  budget: 'Meaning search is paused until tomorrow. The column filters still work.',
  failed: 'Could not run the meaning search. Try again.',
  rateLimited: 'Too many searches in a row. Wait a moment.',
  nothingReady: 'None of these pieces are ready for meaning search yet.',
  nothingClose: 'Nothing close to that. Try other words or loosen the filters.',
  dateRange: 'Fix the date range to run the meaning search.',
  unknown: 'Meaning search is not available right now.',
} as const

export function notReadyNote(count: number): string {
  return `${count} ${count === 1 ? 'piece is' : 'pieces are'} not ready for meaning search and ${count === 1 ? 'is' : 'are'} not included`
}

function errorMessage(code: string | null): string {
  if (code === 'llm_budget_exceeded') return MEANING_MESSAGES.budget
  if (code === 'embedding_failed') return MEANING_MESSAGES.failed
  if (code === 'search_rate_limited') return MEANING_MESSAGES.rateLimited
  if (code === 'invalid_date_range') return MEANING_MESSAGES.dateRange

  return MEANING_MESSAGES.unknown
}

function MeaningStatus({ matches }: { matches: BrowserMatches }) {
  if (matches.status === 'blocked') {
    return <Line testId="meaning-status-date-range" text={MEANING_MESSAGES.dateRange} />
  }

  if (matches.status === 'pending') {
    return <Line testId="meaning-status-searching" text="Searching…" />
  }

  if (matches.status === 'error') {
    return (
      <p role="status" data-testid="meaning-status-error" className="text-sm text-neutral-700">
        {errorMessage(matches.errorCode)}{' '}
        {matches.errorCode === 'embedding_failed' && (
          <button type="button" data-testid="meaning-retry" className="underline" onClick={matches.retry}>
            Retry
          </button>
        )}
      </p>
    )
  }

  if (matches.status !== 'success') {
    return null
  }

  if (matches.readyCount === 0) {
    return <Line testId="meaning-status-nothing-ready" text={MEANING_MESSAGES.nothingReady} />
  }

  return (
    <>
      {matches.rows.length === 0 && (
        <Line testId="meaning-status-nothing-close" text={MEANING_MESSAGES.nothingClose} />
      )}
      {matches.notReadyCount > 0 && (
        <Line testId="meaning-status-not-ready" text={notReadyNote(matches.notReadyCount)} />
      )}
      {matches.capped && (
        <Line testId="meaning-status-capped" text="Showing only the closest 100 pieces." />
      )}
    </>
  )
}

function Line({ testId, text }: { testId: string; text: string }) {
  return (
    <p role="status" data-testid={testId} className="text-sm text-neutral-600">
      {text}
    </p>
  )
}

interface KnowledgeBrowserMeaningSearchProps {
  words: string | undefined
  matches: BrowserMatches
  onSearch: (words: string | undefined) => void
}

export function KnowledgeBrowserMeaningSearch({
  words,
  matches,
  onSearch,
}: KnowledgeBrowserMeaningSearchProps) {
  const [draft, setDraft] = useState(words ?? '')
  const [syncedWords, setSyncedWords] = useState(words)

  if (syncedWords !== words) {
    setSyncedWords(words)
    setDraft(words ?? '')
  }

  function submit() {
    const trimmed = draft.trim()

    if (trimmed !== '' && trimmed === words && matches.status === 'error') {
      matches.retry()

      return
    }

    onSearch(trimmed === '' ? undefined : trimmed)
  }

  return (
    <div className="flex flex-col gap-1">
      <form
        data-testid="meaning-search-form"
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={MEANING_WORDS_MAX}
          aria-label="Search knowledge"
          data-testid="meaning-search-input"
          placeholder="Search knowledge by meaning, then press Enter"
          title="Meaning search: finds pieces closest in meaning to your words. The Question and Answer filters match exact letters."
          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
          onChange={(event) => {
            setDraft(event.target.value)

            if (event.target.value.trim() === '' && words) {
              onSearch(undefined)
            }
          }}
        />
        <button
          type="submit"
          data-testid="meaning-search-button"
          className="rounded border border-neutral-300 px-3 py-1 text-sm"
        >
          Search
        </button>
      </form>
      <MeaningStatus matches={matches} />
    </div>
  )
}
