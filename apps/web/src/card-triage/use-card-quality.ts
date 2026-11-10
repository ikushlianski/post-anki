import { useQuery } from '@tanstack/react-query'
import type { CardQualityByModelResponse } from '@post-anki/shared'

import { getCardQualityByModel } from './card-quality.api'

export function useCardQuality() {
  return useQuery({
    queryKey: ['card-quality', 'models'],
    queryFn: async (): Promise<CardQualityByModelResponse> => {
      const outcome = await getCardQualityByModel()

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
  })
}
