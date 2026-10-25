import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'

import { KnowledgeBrowserScreen } from '../knowledge-bit/knowledge-browser-screen'
import {
  filtersFromSearch,
  parseBrowserSearch,
  searchFromFilters,
} from '../knowledge-bit/knowledge-browser-filters'
import type { BrowserSearch } from '../knowledge-bit/knowledge-browser-filters'
import { openNavigationMode, withOpen } from '../knowledge-bit/knowledge-browser-open-item'

export const Route = createFileRoute('/knowledge/browser')({
  validateSearch: (search: Record<string, unknown>): BrowserSearch => parseBrowserSearch(search),
  beforeLoad: ({ search }) => {
    if (search.view === 'subjects' && !search.subject) {
      throw redirect({ to: '/subjects' })
    }
  },
  component: KnowledgeBrowserRoute,
})

function KnowledgeBrowserRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <KnowledgeBrowserScreen
      subjectId={search.subject ?? null}
      filters={filtersFromSearch(search)}
      openId={search.open ?? null}
      onOpenChange={(id) =>
        void navigate({
          search: (prev) => withOpen(prev, id),
          replace: openNavigationMode(search.open, id) === 'replace',
        })
      }
      meaningWords={search.q}
      onMeaningWordsChange={(words) =>
        void navigate({
          search: (prev) => ({ ...prev, q: words }),
        })
      }
      onFiltersChange={(next, mode) =>
        void navigate({
          search: (prev) =>
            withOpen(
              {
                ...(prev.subject ? { subject: prev.subject } : {}),
                ...(prev.view ? { view: prev.view } : {}),
                ...(prev.q ? { q: prev.q } : {}),
                ...searchFromFilters(next),
              },
              prev.open,
            ),
          replace: mode === 'replace',
        })
      }
      onSubjectChange={(subject) =>
        void navigate({ search: (prev) => ({ ...prev, subject: subject ?? undefined }) })
      }
      onClearAll={() =>
        void navigate({
          search: (prev) => withOpen(prev.subject ? { subject: prev.subject } : {}, prev.open),
        })
      }
    />
  )
}
