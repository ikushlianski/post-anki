import { useEffect, useState } from 'react'
import type { ModelSuggestionResult } from '@post-anki/core'
import { knowledgeItemModelIdSchema, type KnowledgeItemModelId } from '@post-anki/shared'

import { getKnowledgeBitModelSuggestionForAdmin } from './knowledge-bit-review.api'

export function suggestedModelId(suggestion: ModelSuggestionResult | null): KnowledgeItemModelId | null {
  if (suggestion?.status !== 'suggestion') {
    return null
  }

  const parsed = knowledgeItemModelIdSchema.safeParse(suggestion.modelId)

  return parsed.success ? parsed.data : null
}

export function useModelSuggestion(): ModelSuggestionResult | null {
  const [suggestion, setSuggestion] = useState<ModelSuggestionResult | null>(null)

  useEffect(() => {
    let active = true

    getKnowledgeBitModelSuggestionForAdmin()
      .then((result) => {
        if (active) {
          setSuggestion(result)
        }
      })
      .catch(() => {
        if (active) {
          setSuggestion(null)
        }
      })

    return () => {
      active = false
    }
  }, [])

  return suggestion
}

export function usePreselectedModel(): {
  modelId: KnowledgeItemModelId | ''
  setModelId: (next: KnowledgeItemModelId | '') => void
  suggestedId: KnowledgeItemModelId | null
} {
  const suggestedId = suggestedModelId(useModelSuggestion())
  const [chosen, setChosen] = useState<KnowledgeItemModelId | '' | null>(null)

  return {
    modelId: chosen ?? suggestedId ?? '',
    setModelId: setChosen,
    suggestedId,
  }
}
