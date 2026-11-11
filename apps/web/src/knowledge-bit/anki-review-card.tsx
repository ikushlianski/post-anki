import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isBlankKind, renderClozeBack, stripPromptHint, type ReviewCard } from '@post-anki/shared'

import { CardText } from '../code-block/card-text'
import { hasFencedCode } from '../code-block/split-fenced-code'
import { AiLabelBadge } from './ai-label-badge'
import { AiSuggestionBlock } from './ai-suggestion-block'
import { CardSourceLink } from './card-source-link'
import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'

function renderFillBlankPrompt(prompt: string): ReactNode {
  const parts = prompt.split('____')

  if (parts.length === 1) return prompt

  return parts.reduce<ReactNode[]>((acc, part, i) => {
    if (i > 0) {
      acc.push(
        <span key={i} data-testid="fill-blank-cloze" className="font-bold">
          [...]
        </span>,
      )
    }

    acc.push(part)

    return acc
  }, [])
}

function renderAnswer(card: ReviewCard): ReactNode {
  if (card.kind === 'cloze' || card.kind === 'list_next') {
    const parts = renderClozeBack(card.prompt, card.answer)

    if (parts) {
      return parts.map((part, i) =>
        part.bold ? (
          <strong key={i} data-testid="fill-blank-answer">
            {part.text}
          </strong>
        ) : (
          part.text
        ),
      )
    }
  }

  if (isBlankKind(card.kind)) {
    return <strong data-testid="fill-blank-answer">{card.answer}</strong>
  }

  return card.answer
}

export function cardPlainText(card: ReviewCard, prompt: string): string {
  return [card.context, prompt, card.answer, card.background]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
}

export function AnkiReviewCard({
  card,
  revealed,
  onReveal,
  actions,
  editor,
  hintingEnabled = true,
  chatOpen,
  onChatOpenChange,
  onReplaceAccepted,
}: {
  card: ReviewCard
  revealed: boolean
  onReveal: () => void
  actions?: ReactNode
  editor?: ReactNode
  hintingEnabled?: boolean
  chatOpen?: boolean
  onChatOpenChange?: (open: boolean) => void
  onReplaceAccepted?: () => void
}) {
  const prompt = hintingEnabled ? card.prompt : stripPromptHint(card.prompt)

  const [copied, setCopied] = useState(false)

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(cardPlainText(card, prompt))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const showAnswerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!revealed) {
      showAnswerRef.current?.focus()
    }
  }, [revealed, card.variantId])

  return (
    <div data-testid="anki-review-card" className="flex flex-col gap-4">
      {!editor && card.context ? (
        <p data-testid="anki-review-context" className="whitespace-pre-line break-words text-xs text-neutral-500">
          {card.context}
        </p>
      ) : null}
      {editor ??
        (!isBlankKind(card.kind) && hasFencedCode(prompt) ? (
          <CardText
            text={prompt}
            testId="anki-review-prompt"
            className="whitespace-pre-line break-words text-lg font-medium"
          />
        ) : (
          <p data-testid="anki-review-prompt" className="whitespace-pre-line break-words text-lg font-medium">
            {isBlankKind(card.kind) ? renderFillBlankPrompt(prompt) : prompt}
          </p>
        ))}

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
          {!editor &&
            (!isBlankKind(card.kind) && card.kind !== 'cloze' && card.kind !== 'list_next' && hasFencedCode(card.answer) ? (
              <CardText
                text={card.answer}
                testId="anki-review-answer"
                className="whitespace-pre-line break-words border-t border-neutral-200 pt-4"
              />
            ) : (
              <p data-testid="anki-review-answer" className="whitespace-pre-line break-words border-t border-neutral-200 pt-4">
                {renderAnswer(card)}
              </p>
            ))}
          {card.background && (
            <p data-testid="anki-review-background" className="text-sm text-neutral-500">
              {card.background}
            </p>
          )}
          <AiSuggestionBlock original={card.originalPhrase ?? card.answer} aiSuggestion={card.aiSuggestion} />
          {!card.isAiGenerated && <CardSourceLink sourceLinks={card.sourceLinks} />}
        </>
      )}

      <button
        type="button"
        data-testid="anki-review-copy-all"
        onClick={() => void copyAll()}
        className="inline-flex min-h-11 items-center self-start rounded-md border border-neutral-200 px-2 py-1 text-xs sm:min-h-0"
      >
        {copied ? 'Copied' : 'Copy all'}
      </button>

      <AiLabelBadge isAiGenerated={card.isAiGenerated} sourceLinks={card.sourceLinks} />

      {actions}

      {chatOpen !== undefined ? (
        <KnowledgeBitChatPanel
          key={card.knowledgeBitId}
          knowledgeBitId={card.knowledgeBitId}
          open={chatOpen}
          onOpenChange={onChatOpenChange}
          showTrigger={revealed}
          onReplaceAccepted={onReplaceAccepted}
        />
      ) : (
        revealed && <KnowledgeBitChatPanel key={card.knowledgeBitId} knowledgeBitId={card.knowledgeBitId} />
      )}
    </div>
  )
}
