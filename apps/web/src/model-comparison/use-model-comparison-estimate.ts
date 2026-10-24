import { useEffect, useState } from 'react'
import type { KnowledgeItemModelId, ModelComparisonEstimate } from '@post-anki/shared'

export const ESTIMATE_DEBOUNCE_MS = 400

export interface EstimateState {
  estimate: ModelComparisonEstimate | null
  failed: boolean
}

export function useModelComparisonEstimate(
  excerpt: string,
  modelIds: readonly KnowledgeItemModelId[],
  fetchEstimate: (input: { excerpt: string; modelIds: KnowledgeItemModelId[] }) => Promise<ModelComparisonEstimate>,
): EstimateState {
  const [state, setState] = useState<EstimateState>({ estimate: null, failed: false })
  const key = `${excerpt}\u0000${modelIds.join(',')}`

  useEffect(() => {
    if (excerpt.trim().length === 0 || modelIds.length === 0) {
      setState({ estimate: null, failed: false })

      return
    }

    let active = true
    const timer = setTimeout(() => {
      fetchEstimate({ excerpt: excerpt.trim(), modelIds: [...modelIds] })
        .then((estimate) => active && setState({ estimate, failed: false }))
        .catch(() => active && setState({ estimate: null, failed: true }))
    }, ESTIMATE_DEBOUNCE_MS)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key])

  return state
}
