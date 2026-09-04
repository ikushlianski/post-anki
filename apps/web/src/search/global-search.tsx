import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import type { SearchResponse, SearchResultItem, SearchTopicResult } from '@post-anki/shared'

const DEBOUNCE_MS = 300

export interface GlobalSearchProps {
  onSearch: (query: string) => Promise<SearchResponse>
}

export function GlobalSearch({ onSearch }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed === '') {
      setResults(null)
      return
    }

    let cancelled = false

    const timeout = setTimeout(() => {
      onSearchRef.current(trimmed).then((response) => {
        if (!cancelled) {
          setResults(response)
          setOpen(true)
        }
      })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function closeResults() {
    setOpen(false)
    setQuery('')
    setResults(null)
  }

  const trimmedQuery = query.trim()
  const showPanel = open && trimmedQuery !== ''

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 sm:max-w-xs">
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (results) {
            setOpen(true)
          }
        }}
        placeholder="Search subjects, curricula, topics…"
        data-testid="global-search-input"
        aria-label="Search"
        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />

      {showPanel ? (
        <div
          data-testid="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
        >
          {results ? (
            <SearchResultsList results={results} onSelect={closeResults} />
          ) : (
            <p className="px-3 py-2 text-sm text-neutral-500">Searching…</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function SearchResultsList({
  results,
  onSelect,
}: {
  results: SearchResponse
  onSelect: () => void
}) {
  const hasResults =
    results.subjects.length > 0 || results.curricula.length > 0 || results.topics.length > 0

  if (!hasResults) {
    return <p className="px-3 py-2 text-sm text-neutral-500">No results</p>
  }

  return (
    <>
      <ResultGroup
        label="Subjects"
        items={results.subjects}
        renderItem={(subject) => (
          <Link
            key={subject.id}
            to="/subject/$subjectId"
            params={{ subjectId: subject.id }}
            data-testid={`global-search-result-subject-${subject.id}`}
            onClick={onSelect}
            className="block px-3 py-2 text-sm hover:bg-neutral-50"
          >
            {subject.label}
          </Link>
        )}
      />

      <ResultGroup
        label="Curricula"
        items={results.curricula}
        renderItem={(curriculum) => (
          <Link
            key={curriculum.id}
            to="/curriculum/$curriculumId"
            params={{ curriculumId: curriculum.id }}
            data-testid={`global-search-result-curriculum-${curriculum.id}`}
            onClick={onSelect}
            className="block px-3 py-2 text-sm hover:bg-neutral-50"
          >
            {curriculum.label}
          </Link>
        )}
      />

      <ResultGroup
        label="Topics"
        items={results.topics}
        renderItem={(topic: SearchTopicResult) => (
          <Link
            key={topic.id}
            to="/curriculum/$curriculumId"
            params={{ curriculumId: topic.curriculumId }}
            data-testid={`global-search-result-topic-${topic.id}`}
            onClick={onSelect}
            className="block px-3 py-2 text-sm hover:bg-neutral-50"
          >
            {topic.label}
          </Link>
        )}
      />
    </>
  )
}

function ResultGroup<T extends SearchResultItem>({
  label,
  items,
  renderItem,
}: {
  label: string
  items: T[]
  renderItem: (item: T) => ReactNode
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="border-b border-neutral-100 py-1 last:border-b-0">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      {items.map(renderItem)}
    </div>
  )
}
