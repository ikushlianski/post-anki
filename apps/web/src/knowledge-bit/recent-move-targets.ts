const STORAGE_KEY = 'post-anki.review.recent-move-targets'

export const RECENT_MOVE_TARGET_LIMIT = 5

export function loadRecentMoveTargets(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_MOVE_TARGET_LIMIT)
  } catch {
    return []
  }
}

export function recordRecentMoveTarget(subjectId: string): void {
  try {
    const next = [subjectId, ...loadRecentMoveTargets().filter((id) => id !== subjectId)]

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, RECENT_MOVE_TARGET_LIMIT)))
  } catch {
    return
  }
}
