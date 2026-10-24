import { createFileRoute } from '@tanstack/react-router'

import { KnowledgeOverviewScreen } from '../knowledge-bit/knowledge-overview-screen'

export const Route = createFileRoute('/knowledge/')({
  component: KnowledgeOverviewRoute,
})

function KnowledgeOverviewRoute() {
  return <KnowledgeOverviewScreen />
}
