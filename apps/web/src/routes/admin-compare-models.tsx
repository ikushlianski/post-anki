import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { getKnowledgeBitModelSuggestionForAdmin } from '../knowledge-bit/knowledge-bit-review.api'
import { listModelComparisonRuns } from '../model-comparison/model-comparison.api'
import { ModelComparisonPage } from '../model-comparison/model-comparison-page'

export const Route = createFileRoute('/admin-compare-models')({
  validateSearch: z.object({
    sourceId: z.string().min(1).max(100).optional().catch(undefined),
  }),
  component: AdminCompareModelsPage,
  loader: async () => {
    const [runs, suggestion] = await Promise.all([
      listModelComparisonRuns().catch(() => []),
      getKnowledgeBitModelSuggestionForAdmin().catch(() => null),
    ])

    return { runs, suggestion }
  },
})

function AdminCompareModelsPage() {
  const { runs, suggestion } = Route.useLoaderData()
  const { sourceId } = Route.useSearch()

  return <ModelComparisonPage initialRuns={runs} suggestion={suggestion} sourceId={sourceId} />
}
