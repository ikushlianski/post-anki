import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChatMessage, GlobalCardChatMatchedCard } from '@post-anki/shared'

import { ChatInputRow, ChatMessageList } from './chat-message-parts'
import { OPEN_GLOBAL_CARD_CHAT_EVENT } from './global-card-chat-events'
import { askGlobalCardChat } from './global-card-chat.api'

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again."

interface PanelMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  matchedCards?: GlobalCardChatMatchedCard[]
  lookupFailed?: boolean
}

function groundingLine(matchedCards: GlobalCardChatMatchedCard[], lookupFailed?: boolean): string {
  if (lookupFailed) {
    return "Couldn't check your cards right now"
  }

  if (matchedCards.length === 0) {
    return 'Not grounded in any of your cards'
  }

  return `Grounded in: ${matchedCards.map((card) => card.prompt).join(', ')}`
}

export function GlobalCardChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const openPanel = () => setOpen(true)

    window.addEventListener(OPEN_GLOBAL_CARD_CHAT_EVENT, openPanel)

    return () => window.removeEventListener(OPEN_GLOBAL_CARD_CHAT_EVENT, openPanel)
  }, [])

  const mutation = useMutation({
    mutationFn: (vars: {
      message: string
      transcript: ChatMessage[]
      allowGeneralKnowledge: boolean
    }) =>
      askGlobalCardChat({
        data: {
          message: vars.message,
          transcript: vars.transcript,
          allowGeneralKnowledge: vars.allowGeneralKnowledge,
        },
      }),
  })

  function send() {
    const text = draft.trim()

    if (text.length === 0 || mutation.isPending) {
      return
    }

    const transcript: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }))

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text }])
    setDraft('')

    mutation.mutate(
      { message: text, transcript, allowGeneralKnowledge },
      {
        onSuccess: (result) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: result?.reply ?? FALLBACK_REPLY,
              matchedCards: result ? (result.matchedCards ?? []) : undefined,
              lookupFailed: result?.lookupFailed,
            },
          ])
          scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight })
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: FALLBACK_REPLY,
              matchedCards: undefined,
            },
          ])
          scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight })
        },
      },
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="global-card-chat-open"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-20 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        Ask my cards
      </button>
    )
  }

  return (
    <div
      data-testid="global-card-chat-panel"
      className="fixed bottom-4 right-4 z-20 flex w-80 flex-col rounded-md border border-neutral-200 bg-white shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Ask my cards
        </p>
        <button
          type="button"
          data-testid="global-card-chat-close"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-400 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <label className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          data-testid="global-card-chat-allow-general-knowledge"
          checked={allowGeneralKnowledge}
          onChange={(event) => setAllowGeneralKnowledge(event.target.checked)}
        />
        <span>
          Allow general AI knowledge
          <br />
          <span className="text-neutral-400">
            {allowGeneralKnowledge ? 'Answers may also use general knowledge' : 'Answers use only your saved cards'}
          </span>
        </span>
      </label>

      <ChatMessageList
        messages={messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          footer:
            message.role === 'assistant' && message.matchedCards ? (
              <p data-testid="global-card-chat-grounding" className="mt-1 text-xs text-neutral-400">
                {groundingLine(message.matchedCards, message.lookupFailed)}
              </p>
            ) : undefined,
        }))}
        pending={mutation.isPending}
        emptyText="Ask a question — I'll only answer from cards you've already studied."
        testIdPrefix="global-card-chat"
        scrollRef={scrollRef}
      />

      <ChatInputRow
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        pending={mutation.isPending}
        testIdPrefix="global-card-chat"
      />
    </div>
  )
}
