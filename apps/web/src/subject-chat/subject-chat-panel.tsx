import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  MAX_SUBJECT_CHAT_CONTEXT_CHARS,
  type ChatMessage,
  type SubjectChatContext,
  type SubjectChatUsedBit,
} from '@post-anki/shared'

import { ChatInputRow, ChatMessageList } from '../global-card-chat/chat-message-parts'
import { askSubjectChat } from './subject-chat.api'

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again."
const NO_MATCH_LINE = "This subject's knowledge doesn't cover that."
const LOOKUP_FAILED_LINE = "Couldn't search this subject's knowledge right now"
const PREFIX = 'subject-chat'

export interface SubjectChatCardContext {
  cardId: string
  text: string
}

interface PanelMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  usedBits?: SubjectChatUsedBit[]
  noMatch?: boolean
  lookupFailed?: boolean
}

function Footer({ message }: { message: PanelMessage }) {
  if (message.role !== 'assistant' || !message.usedBits) {
    return null
  }

  if (message.lookupFailed) {
    return <p data-testid="subject-chat-lookup-failed" className="mt-1 text-xs text-neutral-400">{LOOKUP_FAILED_LINE}</p>
  }

  if (message.noMatch) {
    return <p data-testid="subject-chat-no-match" className="mt-1 text-xs text-neutral-400">{NO_MATCH_LINE}</p>
  }

  if (message.usedBits.length === 0) {
    return null
  }

  return (
    <ul data-testid="subject-chat-used-bits" className="mt-1 list-disc pl-4 text-xs text-neutral-400">
      {message.usedBits.map((bit) => (
        <li key={bit.id}>{bit.preview}</li>
      ))}
    </ul>
  )
}

export function SubjectChatPanel({
  subjectId,
  selection,
  onClearSelection,
  card,
}: {
  subjectId: string | null
  selection: string
  onClearSelection: () => void
  card: SubjectChatCardContext | null
}) {
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [useCard, setUseCard] = useState(false)

  const mutation = useMutation({
    mutationFn: (vars: { message: string; transcript: ChatMessage[]; context?: SubjectChatContext }) =>
      askSubjectChat({
        data: { ...vars, subjectId: subjectId ?? '' },
      }),
  })

  if (subjectId === null) {
    return (
      <div data-testid="subject-chat-disabled" className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-500">
        Ask about this subject is unavailable: this card isn't linked to a subject.
      </div>
    )
  }

  function buildContext(): SubjectChatContext | undefined {
    if (selection !== '') {
      return { kind: 'selection', text: selection, cardId: card?.cardId }
    }

    if (useCard && card && card.text.trim() !== '') {
      return {
        kind: 'card',
        text: card.text.slice(0, MAX_SUBJECT_CHAT_CONTEXT_CHARS),
        cardId: card.cardId,
      }
    }

    return undefined
  }

  function addAssistant(message: Omit<PanelMessage, 'id' | 'role'>) {
    setMessages((prev) => [...prev, { id: `assistant-${Date.now()}-${prev.length}`, role: 'assistant', ...message }])
  }

  function send() {
    const text = draft.trim()

    if (text.length === 0 || mutation.isPending) {
      return
    }

    const transcript: ChatMessage[] = messages.map((m) => ({ role: m.role, text: m.text }))

    setMessages((prev) => [...prev, { id: `user-${Date.now()}-${prev.length}`, role: 'user', text }])
    setDraft('')

    mutation.mutate(
      { message: text, transcript, context: buildContext() },
      {
        onSuccess: (result) =>
          addAssistant(
            result
              ? {
                  text: result.reply,
                  usedBits: result.usedBits,
                  noMatch: result.noMatch,
                  lookupFailed: result.lookupFailed,
                }
              : { text: FALLBACK_REPLY },
          ),
        onError: () => addAssistant({ text: FALLBACK_REPLY }),
      },
    )
  }

  const chipText = selection !== '' ? selection : null

  return (
    <div data-testid="subject-chat-panel" className="flex flex-col rounded-md border border-neutral-200 bg-white">
      <p className="border-b border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Ask about this subject
      </p>

      <label className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          data-testid="subject-chat-use-card"
          checked={useCard}
          disabled={card === null}
          onChange={(event) => setUseCard(event.target.checked)}
        />
        <span>Use this card as context</span>
      </label>

      {chipText && (
        <div
          data-testid="subject-chat-selection-chip"
          className="mx-3 mt-2 flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-800"
        >
          <span className="truncate">Selected: {chipText}</span>
          <button
            type="button"
            data-testid="subject-chat-selection-clear"
            aria-label="Clear selected text"
            onClick={onClearSelection}
            className="shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <ChatMessageList
        messages={messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          footer: <Footer message={message} />,
        }))}
        pending={mutation.isPending}
        emptyText="Ask a question — I'll only answer from this subject's approved knowledge."
        testIdPrefix={PREFIX}
      />

      <ChatInputRow
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        pending={mutation.isPending}
        testIdPrefix={PREFIX}
      />
    </div>
  )
}
