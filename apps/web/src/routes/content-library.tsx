import { createFileRoute, useRouter } from '@tanstack/react-router'

import { DuplicateSuggestionList } from '../content-library/duplicate-suggestion-list'
import { LibraryBrowser } from '../content-library/library-browser'
import {
  listLibrarySources,
  listSourceDuplicateSuggestions,
  refetchSource,
  resolveSourceDuplicateSuggestion,
  triggerSourceDuplicateScan,
} from '../content-library/content-library.api'

export const Route = createFileRoute('/content-library')({
  component: ContentLibraryPage,
  loader: async () => {
    const [sources, suggestions] = await Promise.all([
      listLibrarySources(),
      listSourceDuplicateSuggestions({ data: 'pending' }),
    ])

    return { sources, suggestions }
  },
})

function ContentLibraryPage() {
  const { sources, suggestions } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Content library</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every source you've captured, across every curriculum, with where it
          came from and whether it's actually been fetched.
        </p>
      </header>

      <section className="mb-10">
        <DuplicateSuggestionList
          suggestions={suggestions}
          sources={sources}
          onScan={() => triggerSourceDuplicateScan()}
          onScanned={() => router.invalidate()}
          onResolve={(suggestionId, input) =>
            resolveSourceDuplicateSuggestion({ data: { suggestionId, input } })
          }
          onResolved={() => router.invalidate()}
        />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
          All sources
        </h2>
        <LibraryBrowser
          sources={sources}
          onRefetch={(sourceId) => refetchSource({ data: sourceId })}
          onRefetched={() => router.invalidate()}
        />
      </section>
    </main>
  )
}
