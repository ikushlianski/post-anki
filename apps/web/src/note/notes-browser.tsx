import { useState } from 'react'

import type { DomainNodeTreeItem, Note, NoteReviewResponse } from '@post-anki/shared'

import { flattenDomainTree } from './note-taxonomy-options'
import type { NoteSearchParams } from './note-search-params'
import { NotesReviewPanel } from './notes-review-panel'
import { NotesSearchForm } from './notes-search-form'
import { NotesSearchResults } from './notes-search-results'
import type { ApiResult } from './note.model'

export interface NotesBrowserProps {
  subjects: Array<{ id: string; name: string }>
  onSearch: (params: NoteSearchParams) => Promise<ApiResult<Note[]>>
  onLoadDomainMap: (subjectId: string) => Promise<DomainNodeTreeItem[]>
  onReview: (excludeIds: string[]) => Promise<ApiResult<NoteReviewResponse>>
}

type Tab = 'search' | 'review'

export function NotesBrowser({
  subjects,
  onSearch,
  onLoadDomainMap,
  onReview,
}: NotesBrowserProps) {
  const [tab, setTab] = useState<Tab>('search')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [domainTree, setDomainTree] = useState<DomainNodeTreeItem[]>([])
  const [results, setResults] = useState<Note[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubjectChange(subjectId: string) {
    setSelectedSubjectId(subjectId)

    if (subjectId === '') {
      setDomainTree([])
      return
    }

    const tree = await onLoadDomainMap(subjectId)

    setDomainTree(tree)
  }

  async function handleSearch(params: NoteSearchParams) {
    setBusy(true)

    const result = await onSearch(params)

    setBusy(false)
    setSearched(true)
    setResults(result.ok ? result.data : [])
  }

  return (
    <div data-testid="notes-browser">
      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          data-testid="notes-tab-search"
          onClick={() => setTab('search')}
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
          onClick={() => setTab('review')}
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
