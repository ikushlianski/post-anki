import { useEffect, useState } from 'react'

import type { DomainNodeTreeItem, Note, NoteReviewResponse } from '@post-anki/shared'

import { flattenDomainTree } from './note-taxonomy-options'
import type { NoteSearchParams, NotesSearchUrlState } from './note-search-params'
import { NotesReviewPanel } from './notes-review-panel'
import { NotesSearchForm } from './notes-search-form'
import { NotesSearchResults } from './notes-search-results'
import type { ApiResult } from './note.model'

export interface NotesBrowserProps {
  subjects: Array<{ id: string; name: string }>
  onSearch: (params: NoteSearchParams) => Promise<ApiResult<Note[]>>
  onLoadDomainMap: (subjectId: string) => Promise<DomainNodeTreeItem[]>
  onReview: (excludeIds: string[]) => Promise<ApiResult<NoteReviewResponse>>
  initialSearch?: NotesSearchUrlState
  onSearchStateChange?: (state: NotesSearchUrlState) => void
}

type Tab = 'search' | 'review'

export function NotesBrowser({
  subjects,
  onSearch,
  onLoadDomainMap,
  onReview,
  initialSearch,
  onSearchStateChange,
}: NotesBrowserProps) {
  const [tab, setTab] = useState<Tab>(initialSearch?.tab ?? 'search')
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSearch?.subjectId ?? '')
  const [domainTree, setDomainTree] = useState<DomainNodeTreeItem[]>([])
  const [results, setResults] = useState<Note[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastSearchParams, setLastSearchParams] = useState<NoteSearchParams | undefined>(
    undefined,
  )

  useEffect(() => {
    if (initialSearch === undefined) {
      return
    }

    const incomingSubjectId = initialSearch.subjectId ?? ''

    if (incomingSubjectId !== selectedSubjectId) {
      setSelectedSubjectId(incomingSubjectId)

      if (incomingSubjectId) {
        void onLoadDomainMap(incomingSubjectId).then(setDomainTree)
      } else {
        setDomainTree([])
      }
    }

    if (initialSearch.tab !== tab) {
      setTab(initialSearch.tab)
    }

    const searchChanged =
      initialSearch.query !== (lastSearchParams?.query ?? '') ||
      initialSearch.concern !== lastSearchParams?.concern ||
      initialSearch.domainNodeId !== lastSearchParams?.domainNodeId

    if (initialSearch.query && searchChanged) {
      void handleSearch(
        {
          query: initialSearch.query,
          concern: initialSearch.concern,
          domainNodeId: initialSearch.domainNodeId,
        },
        { syncUrl: false },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch?.tab, initialSearch?.query, initialSearch?.concern, initialSearch?.domainNodeId, initialSearch?.subjectId])

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab)
    onSearchStateChange?.({
      tab: nextTab,
      query: lastSearchParams?.query ?? '',
      concern: lastSearchParams?.concern,
      domainNodeId: lastSearchParams?.domainNodeId,
      subjectId: selectedSubjectId || undefined,
    })
  }

  async function handleSubjectChange(subjectId: string) {
    setSelectedSubjectId(subjectId)

    if (subjectId === '') {
      setDomainTree([])
      return
    }

    const tree = await onLoadDomainMap(subjectId)

    setDomainTree(tree)
  }

  async function handleSearch(params: NoteSearchParams, options: { syncUrl?: boolean } = {}) {
    setBusy(true)

    const result = await onSearch(params)

    setBusy(false)
    setSearched(true)
    setResults(result.ok ? result.data : [])
    setLastSearchParams(params)

    if (options.syncUrl !== false) {
      onSearchStateChange?.({
        tab: 'search',
        query: params.query,
        concern: params.concern,
        domainNodeId: params.domainNodeId,
        subjectId: selectedSubjectId || undefined,
      })
    }
  }

  return (
    <div data-testid="notes-browser">
      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          data-testid="notes-tab-search"
          onClick={() => handleTabChange('search')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'search'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
          }`}
        >
          Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'review'}
          data-testid="notes-tab-review"
          onClick={() => handleTabChange('review')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'review'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
          }`}
        >
          Review
        </button>
      </div>

      <div className="mt-4">
        {tab === 'search' ? (
          <>
            <NotesSearchForm
              subjects={subjects}
              selectedSubjectId={selectedSubjectId}
              onSubjectChange={handleSubjectChange}
              domainNodeOptions={flattenDomainTree(domainTree)}
              onSearch={handleSearch}
              busy={busy}
              initialQuery={initialSearch?.query}
              initialConcern={initialSearch?.concern}
              initialDomainNodeId={initialSearch?.domainNodeId}
            />
            <NotesSearchResults results={results} searched={searched} />
          </>
        ) : (
          <NotesReviewPanel onReview={onReview} />
        )}
      </div>
    </div>
  )
}
