import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  KnowledgeBitRejectReason,
  TriageHistoryResponse,
  TriageHistorySearchMode,
} from '@post-anki/shared'

import { listRecentTriageDecisions, patchTriageDecision } from './triage-history.api'

const HISTORY_KEY = ['triage-history'] as const

export function useTriageHistory({ q, mode }: { q: string; mode: TriageHistorySearchMode }) {
  const queryClient = useQueryClient()
  const queryKey = [...HISTORY_KEY, q, mode] as const

  const history = useQuery({
    queryKey,
    queryFn: async (): Promise<TriageHistoryResponse> => {
      const outcome = await listRecentTriageDecisions({ data: { days: 7, q, mode } })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
  })

  const setReason = useMutation({
    mutationFn: async (input: { decisionId: string; reasonCode: KnowledgeBitRejectReason | null }) => {
      const outcome = await patchTriageDecision({ data: input })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<TriageHistoryResponse>(queryKey, (previous) =>
        previous
          ? {
              ...previous,
              decisions: previous.decisions.map((item) =>
                item.id === saved.id ? { ...item, reasonCode: saved.reasonCode } : item,
              ),
            }
          : previous,
      )
    },
  })

  return { history, setReason }
}
