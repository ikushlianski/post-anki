import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import type { ReactNode } from 'react'
import type { SearchResultItem, TopicModuleSearchResult } from '@post-anki/shared'
import type { HeaderSearchResults } from './header-search'

const DEBOUNCE_MS = 300

export interface GlobalSearchProps {
  onSearch: (query: string) => Promise<HeaderSearchResults>
}

export function GlobalSearch({ onSearch }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HeaderSearchResults | null>(null)
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
        placeholder="Search subjects, curricula, topics, modules, bits, tags…"
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

const GROUP_LABELS: Record<TopicModuleSearchResult['kind'], string> = {
  topic: 'Topics',
  module: 'Modules',
  bit: 'Knowledge bits',
}

function SearchResultsList({
  results,
  onSelect,
}: {
  results: HeaderSearchResults
  onSelect: () => void
}) {
  const hasResults =
    results.subjects.length > 0 || results.curricula.length > 0 || results.items.length > 0

  if (!hasResults) {
    return <p className="px-3 py-2 text-sm text-neutral-500">No results</p>
  }

  return (
    <>
      <LegacyResultGroup
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

      <LegacyResultGroup
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

      {(['topic', 'module', 'bit'] as const).map((kind) => (
        <ResultGroup
          key={kind}
          label={GROUP_LABELS[kind]}
          items={results.items.filter((result) => result.kind === kind)}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function LegacyResultGroup({
  label,
  items,
  renderItem,
}: {
  label: string
  items: SearchResultItem[]
  renderItem: (item: SearchResultItem) => ReactNode
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

function ResultGroup({
  label,
  items,
  onSelect,
}: {
  label: string
  items: TopicModuleSearchResult[]
  onSelect: () => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="border-b border-neutral-100 py-1 last:border-b-0">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      {items.map((item) => (
        <div
          key={`${item.kind}-${item.id}`}
          data-testid={`global-search-result-${item.kind}-${item.id}`}
          className="px-3 py-2 text-sm hover:bg-neutral-50"
        >
          {item.curriculumId ? (
            <Link
              to="/curriculum/$curriculumId"
              params={{ curriculumId: item.curriculumId }}
              onClick={onSelect}
              className="block font-medium underline underline-offset-2 hover:text-neutral-900"
            >
              {item.title}
            </Link>
          ) : (
            <span className="block font-medium">{item.title}</span>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">
            {item.curriculumName ?? 'Not yet placed in a course'}
          </p>
          {item.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
