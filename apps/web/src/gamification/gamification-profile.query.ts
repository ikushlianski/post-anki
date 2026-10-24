import { useQuery } from '@tanstack/react-query'

import { getGamificationProfile } from './gamification.api'

export const GAMIFICATION_PROFILE_KEY = ['gamification-profile'] as const

export function useGamificationProfile() {
  return useQuery({
    queryKey: GAMIFICATION_PROFILE_KEY,
    queryFn: () => getGamificationProfile(),
  })
}
