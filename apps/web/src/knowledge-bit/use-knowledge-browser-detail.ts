import { useQuery } from '@tanstack/react-query'
import type { KnowledgeBitDetail } from '@post-anki/shared'

import { getKnowledgeBrowserDetail } from './knowledge-browser-detail.api'
import { KNOWLEDGE_BROWSER_QUERY_KEY } from './use-knowledge-browser-data'

export type KnowledgeBrowserDetailResult =
  | { status: 'ready'; detail: KnowledgeBitDetail }
  | { status: 'missing' }

export type KnowledgeBrowserDetailStatus = 'pending' | 'ready' | 'missing' | 'error'

export function useKnowledgeBrowserDetail(id: string) {
  const query = useQuery({
    queryKey: [...KNOWLEDGE_BROWSER_QUERY_KEY, 'detail', id],
    retry: false,
    queryFn: async (): Promise<KnowledgeBrowserDetailResult> => {
      const outcome = await getKnowledgeBrowserDetail({ data: { id } })

      if (outcome.ok) {
        return { status: 'ready', detail: outcome.detail }
      }

      if (outcome.error === 'not_found') {
        return { status: 'missing' }
      }

      throw new Error(outcome.error)
    },
  })

  const status: KnowledgeBrowserDetailStatus = query.data
    ? query.data.status
    : query.isError
      ? 'error'
      : 'pending'

  return {
    status,
    detail: query.data?.status === 'ready' ? query.data.detail : null,
    retry: () => void query.refetch(),
  }
}
