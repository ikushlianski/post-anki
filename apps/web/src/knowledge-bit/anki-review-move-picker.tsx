import { useState } from 'react'

import { SearchableSelect } from '../ui/searchable-select'
import { loadRecentMoveTargets } from './recent-move-targets'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

const CHIP_CLASS =
  'inline-flex min-h-[44px] items-center rounded-md border border-neutral-200 px-2 py-1 text-xs text-left disabled:opacity-40 sm:min-h-0'

export function AnkiReviewMovePicker({
  currentSubjectId,
  busy,
  error,
  onPick,
  onClose,
}: {
  currentSubjectId: string | null
  busy: boolean
  error: string | null
  onPick: (subjectId: string, label: string) => void
  onClose: () => void
}) {
  const { options } = useKnowledgeOverviewSubjects()
  const [recentIds] = useState(loadRecentMoveTargets)
  const targets = options.filter((option) => option.id !== currentSubjectId)
  const recents = recentIds
    .map((id) => targets.find((option) => option.id === id))
    .filter((option) => option !== undefined)

  return (
    <div
      data-testid="anki-review-move-picker"
      role="group"
      aria-label="Move this card to a deck"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      className="flex w-full flex-col gap-2 rounded-md border border-neutral-200 p-2"
    >
      {recents.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="anki-review-move-recents">
          {recents.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              data-testid="anki-review-move-recent"
              onClick={() => onPick(option.id, option.label)}
              className={CHIP_CLASS}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <SearchableSelect
        ariaLabel="Move to deck"
        testId="anki-review-move-search"
        options={targets}
        value=""
        disabled={busy}
        onChange={(id) => {
          const option = targets.find((candidate) => candidate.id === id)

          if (option) onPick(option.id, option.label)
        }}
        placeholder="Search decks…"
      />
      {error && (
        <p role="alert" data-testid="anki-review-move-error" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
