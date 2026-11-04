import { isOrderedListKind, type ReviewCard } from '@post-anki/shared'

import { AnkiReviewCardEditor } from './anki-review-card-editor'
import { AnkiReviewNoteEditor } from './anki-review-note-editor'
import type { useAnkiReviewSessionActions } from './anki-review-session-actions'

type Actions = ReturnType<typeof useAnkiReviewSessionActions>

export function AnkiReviewCardEditPanel({
  card,
  actions,
  onCancel,
}: {
  card: ReviewCard
  actions: Actions
  onCancel: () => void
}) {
  if (card.kind === 'cloze' || isOrderedListKind(card.kind)) {
    return (
      <AnkiReviewNoteEditor
        mode={card.kind === 'cloze' ? 'cloze' : 'list'}
        knowledgeBitId={card.knowledgeBitId}
        variantId={card.variantId}
        error={actions.editError}
        disabled={actions.busy}
        onSave={(text) => void (card.kind === 'cloze' ? actions.saveNote(text) : actions.saveList(text))}
        onCancel={onCancel}
      />
    )
  }

  return (
    <AnkiReviewCardEditor
      context={card.context ?? ''}
      prompt={card.prompt}
      answer={card.answer}
      error={actions.editError}
      disabled={actions.busy}
      onSave={(prompt, answer, context) => void actions.saveEdit(prompt, answer, context)}
      onCancel={onCancel}
    />
  )
}
