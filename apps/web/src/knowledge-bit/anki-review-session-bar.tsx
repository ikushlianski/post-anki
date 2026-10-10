import type { SessionStats } from './anki-review-session-stats'

export function AnkiReviewSessionBar({
  stats,
  canUndo,
  disabled,
  onUndo,
  onEnd,
}: {
  stats: SessionStats
  canUndo: boolean
  disabled: boolean
  onUndo: () => void
  onEnd: () => void
}) {
  return (
    <div data-testid="anki-review-session-bar" className="mb-4 flex items-center gap-3 text-sm">
      <span data-testid="anki-review-progress" className="text-neutral-500">
        {stats.done} done · {stats.remaining} left
      </span>
      <button
        type="button"
        data-testid="anki-review-undo"
        disabled={!canUndo || disabled}
        onClick={onUndo}
        className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40"
      >
        Undo <kbd className="text-xs text-neutral-400">Z</kbd>
      </button>
      <button
        type="button"
        data-testid="anki-review-end-session"
        disabled={stats.done === 0}
        onClick={onEnd}
        className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40"
      >
        End session
      </button>
    </div>
  )
}
