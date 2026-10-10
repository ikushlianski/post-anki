import { useEffect, useState } from 'react'
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
  }, [trimmed, search])

  function handleChange(value: string) {
    setInput(value)
    onSearchingChange?.(value.trim().length > 0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      handleChange('')
    }
  }

  const currentResults = results?.query === trimmed ? results.subjects : null

  return (
    <div className="mb-8">
      <input
        type="search"
        aria-label="Search subjects"
        placeholder="Search subjects"
        maxLength={100}
        value={input}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="subject-search-input"
        className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      />

      {trimmed.length > 0 ? (
        <div className="mt-3" data-testid="subject-search-results-panel">
          {searchFailed ? (
            <p role="alert" className="text-sm text-red-600">
              Couldn't search subjects — try again.
            </p>
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
