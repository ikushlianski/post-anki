import { SHORT_TEXT_HINT_MESSAGE, isShortKnowledgeText } from '@post-anki/shared'

interface ShortTextHintProps {
  index: number
  value: string
}

export function ShortTextHint({ index, value }: ShortTextHintProps) {
  const visible = isShortKnowledgeText(value)

  return (
    <p
      aria-live="polite"
      data-testid={`knowledge-short-text-hint-${index}`}
      className="text-sm text-amber-700"
    >
      {visible ? SHORT_TEXT_HINT_MESSAGE : null}
    </p>
  )
}
