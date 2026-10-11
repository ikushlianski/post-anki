import {
  KNOWLEDGE_BIT_REJECT_REASONS,
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS,
} from '@post-anki/shared'
import { Undo2, X } from 'lucide-react'

import type { RejectionWhy } from './knowledge-bit-review-why'

const CHIP_CLASS =
  'min-h-9 rounded-full bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white'

export function KnowledgeBitReviewWhyStrip({ why }: { why: RejectionWhy }) {
  if (!why.prompt) {
    return null
  }

  return (
    <div
      data-testid="knowledge-bit-review-why-strip"
      role="status"
      onPointerEnter={why.keepOpen}
      onFocus={why.keepOpen}
      className="fixed inset-x-3 bottom-4 z-20 mx-auto max-w-3xl space-y-3 rounded-2xl bg-neutral-900 p-4 text-white shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">
          {why.chosen
            ? `Rejected: ${KNOWLEDGE_BIT_REJECT_REASON_LABELS[why.chosen]}`
            : 'Rejected. Why?'}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="knowledge-bit-review-why-undo"
            onClick={why.undo}
            className={`${CHIP_CLASS} inline-flex items-center gap-1`}
          >
            <Undo2 aria-hidden="true" className="size-3.5" />
            Undo
          </button>
          <button
            type="button"
            data-testid="knowledge-bit-review-why-dismiss"
            aria-label="Dismiss"
            onClick={why.dismiss}
            className="inline-flex size-9 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {why.prompt.feedbackId ? (
        <>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_BIT_REJECT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                data-testid={`knowledge-bit-review-why-reason-${reason}`}
                aria-pressed={why.chosen === reason}
                onClick={() => why.choose(reason)}
                className={`${CHIP_CLASS} ${why.chosen === reason ? 'bg-white text-neutral-900 hover:bg-white' : ''}`}
              >
                {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason]}
              </button>
            ))}
          </div>
          <input
            type="text"
            data-testid="knowledge-bit-review-why-note"
            aria-label="Optional note about why it was rejected"
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
        </>
      ) : null}

      {why.error ? (
        <p role="alert" data-testid="knowledge-bit-review-why-error" className="text-xs text-red-300">
          {why.error}
        </p>
      ) : null}
    </div>
  )
}
