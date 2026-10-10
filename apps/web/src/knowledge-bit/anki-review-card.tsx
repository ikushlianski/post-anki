import type { ReviewCard } from '@post-anki/shared'

import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'

export function AnkiReviewCard({
  card,
  revealed,
  onReveal,
}: {
  card: ReviewCard
  revealed: boolean
  onReveal: () => void
}) {
  return (
    <div data-testid="anki-review-card" className="flex flex-col gap-4">
      <p data-testid="anki-review-prompt" className="text-lg font-medium">
        {card.prompt}
      </p>

      {!revealed && (
        <button
          type="button"
          data-testid="anki-review-show-answer"
          onClick={onReveal}
          className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Show answer <kbd className="ml-1 text-xs opacity-70">Space</kbd>
        </button>
      )}

      {revealed && (
        <>
          <p data-testid="anki-review-answer" className="border-t border-neutral-200 pt-4">
            {card.answer}
          </p>
          {card.background && (
            <p data-testid="anki-review-background" className="text-sm text-neutral-500">
              {card.background}
            </p>
          )}
          <KnowledgeBitChatPanel key={card.knowledgeBitId} knowledgeBitId={card.knowledgeBitId} />
        </>
      )}
    </div>
  )
}
