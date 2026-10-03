import { createFileRoute } from '@tanstack/react-router'
import { CONCERNS, type Concern } from '@post-anki/shared'

import { getBoard } from '../curriculum/curriculum.api'
import { getDomainMapForSubject } from '../domain-map/domain-map.api'
import { NotesBrowser } from '../note/notes-browser'
import type { NotesSearchUrlState } from '../note/note-search-params'
import { reviewNote, searchNotes } from '../note/note.api'
import { searchParamString } from '../shared/search-param-string'

function isConcern(value: unknown): value is Concern {
  return typeof value === 'string' && (CONCERNS as readonly string[]).includes(value)
}

export const Route = createFileRoute('/notes')({
  validateSearch: (search: Record<string, unknown>): NotesSearchUrlState => ({
    tab: search.tab === 'review' ? 'review' : 'search',
    query: searchParamString(search.query),
    concern: isConcern(search.concern) ? search.concern : undefined,
    domainNodeId: typeof search.domainNodeId === 'string' ? search.domainNodeId : undefined,
    subjectId: typeof search.subjectId === 'string' ? search.subjectId : undefined,
  }),
  component: NotesPage,
  loader: async () => {
    const board = await getBoard()

    return { subjects: board.subjects }
  },
})

function NotesPage() {
  const { subjects } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Search what you've written, or reread one note at a time. Nothing here
          is tracked as owed — opening this page has no consequence for not
          opening it yesterday.
        </p>
      </header>

      <NotesBrowser
        subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
        onSearch={(params) => searchNotes({ data: params })}
        onLoadDomainMap={(subjectId) => getDomainMapForSubject({ data: subjectId })}
        onReview={(excludeIds) => reviewNote({ data: excludeIds })}
        initialSearch={search}
        onSearchStateChange={(next) => navigate({ search: next, replace: true })}
      />
    </main>
  )
}
