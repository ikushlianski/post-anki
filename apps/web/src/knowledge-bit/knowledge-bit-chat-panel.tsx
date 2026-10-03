import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChatMessage } from '@post-anki/shared'

import { askKnowledgeBitChat } from './knowledge-bit-chat.api'

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again."

interface PanelMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface KnowledgeBitChatPanelProps {
  knowledgeBitId: string
}

export function KnowledgeBitChatPanel({ knowledgeBitId }: KnowledgeBitChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

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
        data-testid="knowledge-bit-chat-open"
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Chat about this
      </button>
    )
  }

  return (
    <div
      data-testid="knowledge-bit-chat-panel"
      className="flex w-full max-w-sm flex-col rounded-md border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Chat about this
        </p>
        <button
          type="button"
          data-testid="knowledge-bit-chat-close"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-400 hover:text-neutral-900"
        >
          ✕
        </button>
      </div>

      <label className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          data-testid="knowledge-bit-chat-allow-general-knowledge"
          checked={allowGeneralKnowledge}
          onChange={(event) => setAllowGeneralKnowledge(event.target.checked)}
        />
        <span>
          Allow general AI knowledge
          <br />
          <span className="text-neutral-400">off: answers only from this item</span>
        </span>
      </label>

      <div
        ref={scrollRef}
        className="max-h-96 min-h-[8rem] space-y-2 overflow-y-auto p-3"
        data-testid="knowledge-bit-chat-messages"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ask a question about this item.
          </p>
        ) : null}

        {messages.map((message) => (
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
        ))}

        {mutation.isPending ? (
          <div
            data-testid="knowledge-bit-chat-typing-indicator"
            className="mr-auto flex max-w-[60%] items-center gap-1 rounded-lg rounded-bl-none bg-neutral-50 px-3 py-2 text-sm text-neutral-400"
          >
            <span className="animate-pulse">Thinking…</span>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              send()
            }
          }}
          disabled={mutation.isPending}
          placeholder="Ask a question…"
          data-testid="knowledge-bit-chat-input"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100"
        />
        <button
          type="button"
          data-testid="knowledge-bit-chat-send"
          disabled={mutation.isPending || draft.trim().length === 0}
          onClick={send}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
