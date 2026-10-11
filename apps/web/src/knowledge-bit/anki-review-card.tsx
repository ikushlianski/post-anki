import { useEffect, useRef, type ReactNode } from 'react'
import type { ReviewCard } from '@post-anki/shared'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'

export function AnkiReviewCard({
  card,
  revealed,
  onReveal,
  actions,
  editor,
}: {
  card: ReviewCard
  revealed: boolean
  onReveal: () => void
  actions?: ReactNode
  editor?: ReactNode
}) {
  const showAnswerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!revealed) {
      showAnswerRef.current?.focus()
    }
  }, [revealed, card.variantId])

  return (
    <div data-testid="anki-review-card" className="flex flex-col gap-4">
      {editor ?? (
        <p data-testid="anki-review-prompt" className="text-lg font-medium">
          {card.prompt}
        </p>
      )}

      {!revealed && (
        <button
          ref={showAnswerRef}
          type="button"
          data-testid="anki-review-show-answer"
          onClick={onReveal}
          className="inline-flex min-h-11 items-center self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white sm:min-h-0"
        >
          Show answer <kbd className="ml-1 text-xs opacity-70">Space</kbd>
        </button>
      )}

      {revealed && (
        <>
          {!editor && (
            <p data-testid="anki-review-answer" className="border-t border-neutral-200 pt-4">
              {card.answer}
            </p>
          )}
          {card.background && (
            <p data-testid="anki-review-background" className="text-sm text-neutral-500">
              {card.background}
            </p>
          )}
        </>
      )}

      {actions}

      {revealed && <KnowledgeBitChatPanel key={card.knowledgeBitId} knowledgeBitId={card.knowledgeBitId} />}
    </div>
  )
}
