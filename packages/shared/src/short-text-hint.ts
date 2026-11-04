export const SHORT_TEXT_HINT_THRESHOLD = 120

export const SHORT_TEXT_HINT_MESSAGE = 'Short text may not contain anything worth a card.'

export function isShortKnowledgeText(value: string): boolean {
  const length = value.trim().length

  return length >= 1 && length < SHORT_TEXT_HINT_THRESHOLD
}
