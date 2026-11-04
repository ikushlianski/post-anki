import { useEffect, useRef, useState } from 'react'
import type { HeaderSearchResults } from './header-search'
import { SearchResultsList, countSearchResults } from './global-search-results'
import { useSearchShortcut } from './use-search-shortcut'

const DEBOUNCE_MS = 300

export interface GlobalSearchProps {
  onSearch: (query: string) => Promise<HeaderSearchResults>
}

export function GlobalSearch({ onSearch }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HeaderSearchResults | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    const trimmed = query.trim()

    setFailed(false)

    if (trimmed === '') {
      setResults(null)
      return
    }

    let cancelled = false

    const timeout = setTimeout(() => {
      onSearchRef.current(trimmed).then(
        (response) => {
          if (!cancelled) {
            setResults(response)
            setOpen(true)
          }
        },
        () => {
          if (!cancelled) {
            setResults(null)
            setFailed(true)
            setOpen(true)
          }
        },
      )
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  useSearchShortcut(inputRef)

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
    <div
      ref={containerRef}
      className="relative order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1 sm:max-w-xs"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false)
          inputRef.current?.focus()
        }
      }}
    >
      <input
        ref={inputRef}
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
        className="min-h-[44px] w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm sm:min-h-0"
      />

      <p role="status" className="sr-only" data-testid="global-search-count">
        {showPanel && results ? `${countSearchResults(results)} results found` : ''}
      </p>

      {showPanel ? (
        <div
          data-testid="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
        >
          {results ? (
            <SearchResultsList results={results} query={trimmedQuery} onSelect={closeResults} />
          ) : failed ? (
            <p role="alert" data-testid="global-search-error" className="px-3 py-2 text-sm text-neutral-600">
              Search failed. Try again.
            </p>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-neutral-500">
              Searching…
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
