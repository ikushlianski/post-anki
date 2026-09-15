import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { filterCardBrowserRows } from '@post-anki/core'

import { curriculumCardsBrowserQuery, curriculumDetailQuery } from '../curriculum/curriculum.queries'

export const Route = createFileRoute('/curriculum/$curriculumId_/cards')({
  component: CardsBrowserPage,
  loader: ({ params, context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(curriculumDetailQuery(params.curriculumId)),
      context.queryClient.ensureQueryData(curriculumCardsBrowserQuery(params.curriculumId)),
    ]),
})

function CardsBrowserPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))
  const { data: rows } = useSuspenseQuery(curriculumCardsBrowserQuery(curriculumId))
  const [search, setSearch] = useState('')

  const filteredRows = useMemo(() => filterCardBrowserRows(rows, search), [rows, search])

  if (!detail) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Curriculum not found.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <Link
        to="/curriculum/$curriculumId"
        params={{ curriculumId }}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← {detail.curriculum.name}
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cards</h1>

      <div className="mt-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question, answer, or topic…"
          data-testid="cards-browser-search"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <p className="mt-2 text-xs text-neutral-500" data-testid="cards-browser-count">
        {filteredRows.length} of {rows.length} cards
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500" data-testid="cards-browser-empty-state">
          No cards ready yet.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500" data-testid="cards-browser-no-matches">
          No cards match "{search}".
        </p>
      ) : (
        <table className="mt-4 w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="w-1/3 py-2 pr-3">Question</th>
              <th className="w-1/3 py-2 pr-3">Answer</th>
              <th className="w-1/3 py-2">Topic</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={row.variantId}
                data-testid={`cards-browser-row-${row.variantId}`}
                className="border-b border-neutral-100 align-top"
              >
                <td className="py-2 pr-3">{row.prompt}</td>
                <td className="py-2 pr-3 text-neutral-600">{row.answer}</td>
                <td className="py-2 text-neutral-500">{row.topicTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
