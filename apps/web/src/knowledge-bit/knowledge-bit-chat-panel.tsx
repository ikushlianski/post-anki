import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChatMessage } from '@post-anki/shared'

import { toTranscript, useCardProposalRequests } from './use-card-proposal-requests'
import { KnowledgeBitChatCardProposal } from './knowledge-bit-chat-card-proposal'
import {
  isCardRequest,
  latestCardProposal,
  type CardProposalChatMessage,
  type CardProposalStatus,
  type PanelMessage,
} from './knowledge-bit-chat-messages'
import { askKnowledgeBitChat } from './knowledge-bit-chat.api'
import { KnowledgeBitChatSheet } from './knowledge-bit-chat-sheet'
import { KnowledgeBitChatHighlightBar } from './knowledge-bit-chat-highlight-bar'
import { KnowledgeBitChatCardTray } from './knowledge-bit-chat-card-tray'
import { useCardTray } from './use-card-tray'
import { useChatSelection } from './use-chat-selection'

const CARD_SHORTCUT_TEXT = 'make a card from this chat'
const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again."

interface KnowledgeBitChatPanelProps {
  knowledgeBitId: string
  iconOnly?: boolean
}

export function KnowledgeBitChatPanel({ knowledgeBitId, iconOnly = false }: KnowledgeBitChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false)
  const [cardWebSearch, setCardWebSearch] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const tray = useCardTray(knowledgeBitId)
  const { selection, clearSelection } = useChatSelection(scrollRef)

  const mutation = useMutation({
    mutationFn: (vars: {
      message: string
      transcript: ChatMessage[]
      allowGeneralKnowledge: boolean
    }) =>
      askKnowledgeBitChat({
        data: {
          knowledgeBitId,
          message: vars.message,
          transcript: vars.transcript,
          allowGeneralKnowledge: vars.allowGeneralKnowledge,
        },
      }),
  })

  const { cardMutation, requestCard } = useCardProposalRequests({
    knowledgeBitId,
    messages,
    allowWebSearch: cardWebSearch,
    setMessages,
  })
  const busy = mutation.isPending || cardMutation.isPending
  const latestProposal = latestCardProposal(messages)

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  function revise(target: CardProposalChatMessage, instruction: string) {
    setMessages((prev) => [
      ...prev,
      { kind: 'text', id: `user-${Date.now()}`, role: 'user', text: instruction },
    ])
    requestCard(instruction, target.card)
  }

  function setCardStatus(id: string, status: CardProposalStatus) {
    setMessages((prev) =>
      prev.map((m) => (m.kind === 'card-proposal' && m.id === id ? { ...m, status } : m)),
    )
  }

  function draftCardFromChat() {
    if (busy) {
      return
    }

    setMessages((prev) => [
      ...prev,
      { kind: 'text', id: `user-${Date.now()}`, role: 'user', text: CARD_SHORTCUT_TEXT },
    ])
    requestCard(CARD_SHORTCUT_TEXT)
  }

  function send() {
    const text = draft.trim()

    if (text.length === 0 || busy) {
      return
    }

    const transcript = toTranscript(messages)

    setMessages((prev) => [
      ...prev,
      { kind: 'text', id: `user-${Date.now()}`, role: 'user', text },
    ])
    setDraft('')

    if (isCardRequest(text)) {
      requestCard(text)

      return
    }

    mutation.mutate(
      { message: text, transcript, allowGeneralKnowledge },
      {
        onSuccess: (result) => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: result?.reply ?? FALLBACK_REPLY,
            },
          ])
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: FALLBACK_REPLY,
            },
          ])
        },
      },
    )
  }

  if (!open && iconOnly) {
    return (
      <button
        type="button"
        data-testid="knowledge-bit-chat-open"
        aria-label="Chat about this"
        title="Chat about this"
        onClick={() => setOpen(true)}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-neutral-900"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
      </button>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="knowledge-bit-chat-open"
        onClick={() => setOpen(true)}
        className="min-h-11 self-start rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:min-h-0 sm:px-3"
      >
        Chat about this
      </button>
    )
  }

  return (
    <KnowledgeBitChatSheet onClose={() => setOpen(false)}>
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Chat about this
        </p>
        <button
          type="button"
          data-testid="knowledge-bit-chat-close"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="flex size-11 items-center justify-center text-sm text-neutral-400 hover:text-neutral-900 sm:size-auto"
        >
          ✕
        </button>
      </div>

      <label className="flex min-h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs sm:min-h-0 text-neutral-500">
        <input
          type="checkbox"
          data-testid="knowledge-bit-chat-allow-general-knowledge"
          checked={allowGeneralKnowledge}
          onChange={(event) => setAllowGeneralKnowledge(event.target.checked)}
        />
        <span>
          Allow general AI knowledge
          <br />
          <span className="text-neutral-400">
            {allowGeneralKnowledge ? 'Answers may also use general knowledge' : 'Answers use only this item'}
          </span>
        </span>
      </label>

      <div
        ref={scrollRef}
        className="min-h-[8rem] flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:max-h-96 sm:flex-none"
        data-testid="knowledge-bit-chat-messages"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ask a question about this item.
          </p>
        ) : null}

        {messages.map((message) =>
          message.kind === 'card-proposal' ? (
            <KnowledgeBitChatCardProposal
              key={message.id}
              knowledgeBitId={knowledgeBitId}
              message={message}
              superseded={latestProposal?.id !== message.id}
              revising={cardMutation.isPending}
              onStatusChange={setCardStatus}
              onRevise={revise}
            />
          ) : (
          <div
            key={message.id}
            className={
              message.role === 'assistant' ? 'mr-auto max-w-[90%]' : 'ml-auto max-w-[90%]'
            }
          >
            <div
              data-testid={`knowledge-bit-chat-message-${message.role}`}
              className={
                message.role === 'assistant'
                  ? 'rounded-lg rounded-bl-none bg-neutral-50 px-3 py-2 text-sm text-neutral-800'
                  : 'rounded-lg rounded-br-none bg-neutral-900 px-3 py-2 text-sm text-white'
              }
            >
              {message.text}
            </div>
          </div>
          ),
        )}

        {busy ? (
          <div
            data-testid="knowledge-bit-chat-typing-indicator"
            className="mr-auto flex max-w-[60%] items-center gap-1 rounded-lg rounded-bl-none bg-neutral-50 px-3 py-2 text-sm text-neutral-400"
          >
            <span className="animate-pulse">Thinking…</span>
          </div>
        ) : null}
      </div>

      <KnowledgeBitChatHighlightBar selection={selection} tray={tray} onDone={clearSelection} />
      <KnowledgeBitChatCardTray tray={tray} />

      {messages.some((m) => m.kind === 'text' && m.role === 'assistant') ? (
        <div className="shrink-0 border-t border-neutral-200 px-3 pt-2">
          <button
            type="button"
            data-testid="knowledge-bit-chat-draft-chip"
            disabled={busy}
            onClick={draftCardFromChat}
            className="min-h-11 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 sm:min-h-0"
          >
            Draft a new card
          </button>
        </div>
      ) : null}

      <label className="flex min-h-11 shrink-0 items-center gap-2 border-t border-neutral-200 px-3 py-2 text-xs sm:min-h-0 text-neutral-500">
        <input
          type="checkbox"
          data-testid="knowledge-bit-chat-card-web"
          checked={cardWebSearch}
          disabled={busy}
          onChange={(event) => setCardWebSearch(event.target.checked)}
        />
        <span>Use web research for cards (slower and paid)</span>
      </label>

      <div className="flex shrink-0 gap-2 border-t border-neutral-200 p-3">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              send()
            }
          }}
          disabled={busy}
          placeholder="Ask a question, or “card: …” to make a card"
          data-testid="knowledge-bit-chat-input"
          className="min-h-11 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base outline-none sm:min-h-0 sm:text-sm focus:border-neutral-500 disabled:bg-neutral-100"
        />
        <button
          type="button"
          data-testid="knowledge-bit-chat-send"
          disabled={busy || draft.trim().length === 0}
          onClick={send}
          className="min-h-11 min-w-11 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:px-3"
        >
          Send
        </button>
      </div>

    </KnowledgeBitChatSheet>
  )
}
