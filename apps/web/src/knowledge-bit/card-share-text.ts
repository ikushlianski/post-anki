import { isBlankKind, renderClozeBack, stripPromptHint, type ReviewCard } from '@post-anki/shared'

function plainAnswer(card: ReviewCard): string {
  if (isBlankKind(card.kind)) {
    const parts = renderClozeBack(card.prompt, card.answer)

    if (parts) {
      return parts.map((part) => part.text).join('')
    }
  }

  return card.answer
}

export function cardShareText(card: ReviewCard): string {
  return `Q: ${stripPromptHint(card.prompt).trim()}\nA: ${plainAnswer(card).trim()}`
}
