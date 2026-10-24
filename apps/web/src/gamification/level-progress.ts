import type { PlayerLevel } from '@post-anki/shared'

export function levelProgress(player: PlayerLevel) {
  const span = player.pointsForNextLevel
  const remaining = Math.max(0, span - player.pointsIntoLevel)
  const percent = span === 0 ? 100 : Math.min(100, Math.round((player.pointsIntoLevel / span) * 100))

  return { remaining, percent }
}
