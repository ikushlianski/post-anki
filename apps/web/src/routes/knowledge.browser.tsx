import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { KnowledgeBrowserScreen } from '../knowledge-bit/knowledge-browser-screen'
import {
  filtersFromSearch,
  parseBrowserSearch,
  searchFromFilters,
} from '../knowledge-bit/knowledge-browser-filters'
import type { BrowserSearch } from '../knowledge-bit/knowledge-browser-filters'

export const Route = createFileRoute('/knowledge/browser')({
  validateSearch: (search: Record<string, unknown>): BrowserSearch => parseBrowserSearch(search),
  component: KnowledgeBrowserRoute,
})

function KnowledgeBrowserRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <KnowledgeBrowserScreen
      subjectId={search.subject ?? null}
      view={search.view}
      filters={filtersFromSearch(search)}
      onFiltersChange={(next, mode) =>
        void navigate({
          search: (prev) => ({
            ...(prev.subject ? { subject: prev.subject } : {}),
            ...(prev.view ? { view: prev.view } : {}),
            ...searchFromFilters(next),
          }),
          replace: mode === 'replace',
        })
      }
      onSubjectChange={(subject) =>
        void navigate({ search: (prev) => ({ ...prev, subject: subject ?? undefined }) })
      }
      onClearAll={() =>
        void navigate({ search: (prev) => ({ ...(prev.subject ? { subject: prev.subject } : {}) }) })
      }
    />
  )
}
