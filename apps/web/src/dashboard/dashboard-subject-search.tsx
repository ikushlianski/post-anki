import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from '@tanstack/react-router'

import { listSubjectAncestorNames } from '@post-anki/core'
import type { Subject } from '../curriculum/model'
import { searchSubjects } from '../subject/subject.api'

export const SUBJECT_SEARCH_DEBOUNCE_MS = 250

export type SubjectSearchFn = (query: string) => Promise<Subject[]>

export interface DashboardSubjectSearchProps {
  subjects: Subject[]
  onSearchingChange?: (searching: boolean) => void
  search?: SubjectSearchFn
}

const searchOnServer: SubjectSearchFn = (query) => searchSubjects({ data: query })

interface SearchResults {
  query: string
  subjects: Subject[]
}

// "Parent / Path › Name", or just the name for a top-level subject.
export function formatSearchResultLabel(subject: Subject, subjects: Subject[]): string {
  const ancestors = listSubjectAncestorNames(
    subject.id,
    subjects.map((row) => ({ id: row.id, name: row.name, parentId: row.parentId })),
  )

  return ancestors.length === 0
    ? subject.name
    : `${ancestors.join(' / ')} › ${subject.name}`
}

export function DashboardSubjectSearch({
  subjects,
  onSearchingChange,
  search = searchOnServer,
}: DashboardSubjectSearchProps) {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = input.trim()

  useEffect(() => {
    if (trimmed.length === 0) {
      setResults(null)
      setSearchFailed(false)

      return
    }

    let stale = false
    setSearchFailed(false)

    const timer = setTimeout(() => {
      search(trimmed).then(
        (found) => {
          if (!stale) {
            setResults({ query: trimmed, subjects: found })
          }
        },
        () => {
          if (!stale) {
            setSearchFailed(true)
          }
        },
      )
    }, SUBJECT_SEARCH_DEBOUNCE_MS)

    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [trimmed, search, attempt])

  function handleChange(value: string) {
    setInput(value)
    onSearchingChange?.(value.trim().length > 0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      handleChange('')
    }
  }

  function handleClear() {
    handleChange('')
    inputRef.current?.focus()
  }

  function handleRetry() {
    setAttempt((count) => count + 1)
  }

  const currentResults = results?.query === trimmed ? results.subjects : null
  const resultCount = searchFailed || currentResults === null ? null : currentResults.length

  return (
    <div className="mb-8">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          aria-label="Search subjects"
          placeholder="Search subjects"
          maxLength={100}
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="subject-search-input"
          className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-4 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
        {input.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            data-testid="subject-search-clear"
            onClick={handleClear}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-lg leading-none text-neutral-500 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      <p
        aria-live="polite"
        data-testid="subject-search-count"
        className={resultCount === null ? 'sr-only' : 'mt-2 text-sm text-neutral-500'}
      >
        {resultCount === null ? '' : `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
      </p>

      {trimmed.length > 0 ? (
        <div data-testid="subject-search-results-panel">
          {searchFailed ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-red-600">
                Couldn't search subjects — try again.
              </p>
              <button
                type="button"
                data-testid="subject-search-retry"
                onClick={handleRetry}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
              >
                Retry
              </button>
            </div>
          ) : currentResults === null ? (
            <p className="text-sm text-neutral-400" data-testid="subject-search-loading">
              Searching…
            </p>
          ) : currentResults.length === 0 ? (
            <p className="text-sm text-neutral-500" data-testid="subject-search-empty">
              No subjects match &quot;{trimmed}&quot;.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="subject-search-results">
              {currentResults.map((subject) => (
                <li key={subject.id}>
                  <Link
                    to="/subject/$subjectId"
                    params={{ subjectId: subject.id }}
                    data-testid={`subject-search-result-${subject.id}`}
                    className="block rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400"
                  >
                    {formatSearchResultLabel(subject, subjects)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
