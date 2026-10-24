import {
  KNOWLEDGE_BIT_REJECT_REASONS,
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS,
} from '@post-anki/shared'
import { X } from 'lucide-react'

import type { RejectionWhy } from './knowledge-bit-review-why'

const CHIP_CLASS =
  'min-h-11 sm:min-h-9 rounded-full bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white'

const QUALITY_GRADES = [1, 2, 3, 4, 5] as const

export function KnowledgeBitReviewWhyStrip({ why }: { why: RejectionWhy }) {
  if (!why.prompt) {
    return null
  }

  return (
    <div
      data-testid="knowledge-bit-review-decision-strip"
      role="status"
      onPointerEnter={why.keepOpen}
      onFocus={why.keepOpen}
      className="fixed inset-x-3 bottom-4 z-20 mx-auto max-w-3xl space-y-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">
          {why.prompt.mode === 'grade'
            ? 'Grade this card'
            : why.chosen
              ? `Rejected: ${KNOWLEDGE_BIT_REJECT_REASON_LABELS[why.chosen]}`
              : 'Rejected. Why?'}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="knowledge-bit-review-decision-dismiss"
            aria-label="Dismiss"
            onClick={why.dismiss}
            className="inline-flex size-9 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {why.prompt.mode === 'rejected' ? (
        <div className="flex flex-wrap gap-2">
          {KNOWLEDGE_BIT_REJECT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              data-testid={`knowledge-bit-review-decision-reason-${reason}`}
              aria-pressed={why.chosen === reason}
              onClick={() => why.choose(reason)}
              className={`${CHIP_CLASS} ${why.chosen === reason ? 'bg-white text-neutral-900 hover:bg-white' : ''}`}
            >
              {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <span className="text-xs text-white/60">Quality:</span>
        {QUALITY_GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            data-testid={`knowledge-bit-review-decision-quality-${grade}`}
            aria-label={`Quality ${grade}`}
            onClick={() => why.chooseQuality(grade)}
            className={CHIP_CLASS}
          >
            {grade}
          </button>
        ))}
      </div>
      <input
        type="text"
        data-testid="knowledge-bit-review-decision-note"
        aria-label="Optional note about this decision"
        placeholder="Optional note"
        value={why.note}
        maxLength={KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS}
        onChange={(event) => why.changeNote(event.target.value)}
        onBlur={why.commitNote}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            why.commitNote()
          }
        }}
        className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:bg-white/15 focus:outline-2 focus:outline-white/40"
      />

      {why.error ? (
        <p role="alert" data-testid="knowledge-bit-review-decision-error" className="text-xs text-red-300">
          {why.error}
        </p>
      ) : null}
    </div>
  )
}
