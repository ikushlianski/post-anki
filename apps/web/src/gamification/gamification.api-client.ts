import { gamificationProfileSchema, type GamificationProfile } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

export async function getGamificationProfile(): Promise<GamificationProfile | null> {
  try {
    const base = apiBaseUrl()

    if (!base) {
      return null
    }

    const response = await fetch(`${base}/gamification/profile`, { headers: authHeaders() })

    if (!response.ok) {
      return null
    }

    const parsed = gamificationProfileSchema.safeParse(await response.json())

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
