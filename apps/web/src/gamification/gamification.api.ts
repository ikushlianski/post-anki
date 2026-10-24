import { createServerFn } from '@tanstack/react-start'
import type { GamificationProfile } from '@post-anki/shared'

import * as api from './gamification.api-client'

export const getGamificationProfile = createServerFn({ method: 'GET' }).handler(
  (): Promise<GamificationProfile | null> => api.getGamificationProfile(),
)
