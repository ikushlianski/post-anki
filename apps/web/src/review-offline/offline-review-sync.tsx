import { useOnlineStatus } from '../shared/use-online-status'
import type { SavedCardsView } from './saved-cards-view'
import { usePendingGradeCount } from './use-pending-grade-count'
import { useOfflineReviewSync, type OfflineReviewSyncDeps, type SyncPhase } from './use-offline-review-sync'

export const SAVED_CARDS_CAPTION = 'Using saved cards'
export const SAVED_CARDS_FINISHED = "Saved cards finished. Grades sync when you're back online."

const noun = (count: number) => (count === 1 ? 'grade' : 'grades')

export function offlineGradesLabel(count: number, online: boolean, phase: SyncPhase = 'idle'): string {
  const prefix = !online ? 'Offline' : phase === 'idle' ? 'Waiting to retry' : 'Syncing'

  return `${prefix}: ${count} ${noun(count)} waiting`
}

export function OfflineReviewSync({
  usingSavedCards = false,
  savedCardsFinished = false,
  ...deps
}: OfflineReviewSyncDeps & Partial<SavedCardsView>) {
  const online = useOnlineStatus()
  const { waiting, failed, memoryOnly } = usePendingGradeCount(deps.store)
  const phase = useOfflineReviewSync(deps)

  return (
    <>
      {usingSavedCards && (
        <p data-testid="saved-cards-caption" className="mb-4 text-sm text-neutral-500">
          {SAVED_CARDS_CAPTION}
        </p>
      )}
      {savedCardsFinished && (
        <p data-testid="saved-cards-finished" className="mb-4 text-sm text-neutral-700">
          {SAVED_CARDS_FINISHED}
        </p>
      )}
      {waiting > 0 && (
        <p data-testid="offline-grades-indicator" className="mb-4 text-sm text-amber-700">
          {offlineGradesLabel(waiting, online, phase)}
        </p>
      )}
      {failed > 0 && (
        <p data-testid="offline-grades-failed" className="mb-4 text-sm text-red-600">
          {failed} {noun(failed)} could not be saved
        </p>
      )}
      {memoryOnly && (waiting > 0 || failed > 0) && (
        <p data-testid="offline-grades-memory-only" className="mb-4 text-sm text-red-600">
          Waiting grades are kept in memory only. Keep this tab open until they sync.
        </p>
      )}
    </>
  )
}
