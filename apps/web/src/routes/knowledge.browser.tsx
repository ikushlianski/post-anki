import { createFileRoute } from '@tanstack/react-router'

import { KnowledgeBrowserScreen } from '../knowledge-bit/knowledge-browser-screen'

export const Route = createFileRoute('/knowledge/browser')({
  validateSearch: (search: Record<string, unknown>): { subject?: string; view?: 'subjects' } => ({
    ...(typeof search.subject === 'string' && search.subject !== '' ? { subject: search.subject } : {}),
    ...(search.view === 'subjects' ? { view: 'subjects' as const } : {}),
  }),
  component: KnowledgeBrowserRoute,
})

function KnowledgeBrowserRoute() {
  const { subject, view } = Route.useSearch()

  return <KnowledgeBrowserScreen subjectId={subject ?? null} view={view} />
}
