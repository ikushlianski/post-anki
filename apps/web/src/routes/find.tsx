import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { TopicModuleSearchResult } from '@post-anki/shared'

import { searchTopicsAndModules } from '../curriculum/curriculum.api'

export const Route = createFileRoute('/find')({
  component: FindPage,
})

export function FindPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TopicModuleSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [searchError, setSearchError] = useState(false)

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()

    if (query.trim() === '' || searching) {
      return
    }

    setSearching(true)
    setSearchError(false)

    try {
      const rows = await searchTopicsAndModules({ data: query })
      setResults(rows)
      setSubmittedQuery(query)
    } catch {
      setSearchError(true)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Find a topic or module</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Describe what you're looking for — the best-matching topics and modules across every
        course come back first.
      </p>

      <form onSubmit={runSearch} className="mt-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. async error handling"
          data-testid="find-search-input"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          data-testid="find-search-button"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError ? (
        <p className="mt-6 text-sm text-red-600" data-testid="find-search-error">
          Search could not be completed — try again.
        </p>
      ) : submittedQuery !== null && results.length === 0 && !searching ? (
        <p className="mt-6 text-sm text-neutral-500" data-testid="find-empty-state">
          No topics or modules match "{submittedQuery}".
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-6 space-y-2" data-testid="find-results">
          {results.map((result) => (
            <li
              key={`${result.kind}-${result.id}`}
              data-testid={`find-result-${result.kind}-${result.id}`}
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
              {result.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.tags.map((tag) => (
                    <span
                      key={tag}
                      data-testid={`find-result-tag-${result.kind}-${result.id}-${tag}`}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
