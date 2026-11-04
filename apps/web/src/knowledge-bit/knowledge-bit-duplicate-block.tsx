import { useState } from 'react'
import type { PendingKnowledgeBitDuplicateOf } from '@post-anki/shared'

import type { SimilarCard } from './duplicate-similar-cards'
import { KnowledgeBitDuplicateSheet } from './knowledge-bit-duplicate-sheet'
import { useSimilarCards } from './use-similar-cards'

interface KnowledgeBitDuplicateBlockProps {
  bitId: string
  duplicateOf: PendingKnowledgeBitDuplicateOf
  busy: boolean
  acceptDisabled: boolean
  errorMessage: string | null
  onReject: (bitId: string) => void
  onAccept: (bitId: string) => void
}

export function KnowledgeBitDuplicateBlock({
  bitId,
  duplicateOf,
  busy,
  acceptDisabled,
  errorMessage,
  onReject,
  onAccept,
}: KnowledgeBitDuplicateBlockProps) {
  const similar = useSimilarCards(duplicateOf)
  const [open, setOpen] = useState<SimilarCard | null>(null)
  const [acted, setActed] = useState(false)
  const percent = Math.round(duplicateOf.similarity * 100)

  function act(run: (id: string) => void) {
    setActed(true)
    run(bitId)
  }

  return (
    <section
      aria-label="Possible duplicate"
      data-testid={`knowledge-bit-duplicate-${bitId}`}
      className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="flex items-center gap-2">
        <span
          data-testid={`knowledge-bit-duplicate-badge-${bitId}`}
          className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
        >
          Possible duplicate
        </span>
        <span className="text-xs">{percent}% similar</span>
      </p>
      {duplicateOf.reason ? (
        <p data-testid={`knowledge-bit-duplicate-reason-${bitId}`}>{duplicateOf.reason}</p>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Similar cards</p>
        {similar.loading ? <p className="text-xs">Loading similar cards...</p> : null}
        <ul aria-label="Similar cards" className="space-y-1">
          {similar.cards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                aria-label={`Preview similar card: ${card.front}`}
                data-testid={`knowledge-bit-duplicate-similar-${card.id}`}
                onClick={() => {
                  setActed(false)
                  setOpen(card)
                }}
                className="min-h-11 w-full rounded-md border border-amber-200 bg-white px-3 text-left text-sm text-neutral-900 sm:min-h-8"
              >
                {card.front}
              </button>
            </li>
          ))}
        </ul>
        {!similar.loading && similar.failedCount > 0 ? (
          <p role="status" className="text-xs">
            Couldn&apos;t load {similar.failedCount} similar {similar.failedCount === 1 ? 'card' : 'cards'}.
          </p>
        ) : null}
      </div>
      {open ? (
        <KnowledgeBitDuplicateSheet
          card={open}
          busy={busy}
          acceptDisabled={acceptDisabled}
          errorMessage={acted ? errorMessage : null}
          onClose={() => setOpen(null)}
          onReject={() => act(onReject)}
          onAccept={() => act(onAccept)}
        />
      ) : null}
    </section>
  )
}
