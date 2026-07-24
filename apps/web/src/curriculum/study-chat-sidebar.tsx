import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ChatMessage } from '@post-anki/shared'

import { askStudyChat } from './study-chat.api'

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again."

interface SidebarMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export function StudyChatSidebar({
  topicId,
  seed,
  onSeedConsumed,
}: {
  topicId: string
  seed: string | null
  onSeedConsumed: () => void
}) {
  const [messages, setMessages] = useState<SidebarMessage[]>([])
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (seed) {
      setDraft(seed)
      onSeedConsumed()
    }
  }, [seed, onSeedConsumed])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const mutation = useMutation({
    mutationFn: (vars: { message: string; transcript: ChatMessage[] }) =>
      askStudyChat({
        data: { topicId, message: vars.message, transcript: vars.transcript },
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
      { message: text, transcript },
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
        },
      },
    )
  }

  return (
    <div
      className="mt-3 flex w-full flex-col rounded-md border border-neutral-200 bg-neutral-50 sm:w-80"
      data-testid="study-chat-sidebar"
    >
      <div className="border-b border-neutral-200 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Ask about this topic
        </p>
      </div>

      <div
        ref={scrollRef}
        className="max-h-96 min-h-[8rem] space-y-2 overflow-y-auto p-3"
        data-testid="study-chat-messages"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ask anything about this topic — or how it compares to what you've studied
            elsewhere.
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
              data-testid={`study-chat-message-${message.role}`}
              className={
                message.role === 'assistant'
                  ? 'rounded-lg rounded-bl-none bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm'
                  : 'rounded-lg rounded-br-none bg-neutral-900 px-3 py-2 text-sm text-white'
              }
            >
              {message.text}
            </div>
          </div>
        ))}

        {mutation.isPending ? (
          <div
            data-testid="study-chat-typing-indicator"
            className="mr-auto flex max-w-[60%] items-center gap-1 rounded-lg rounded-bl-none bg-white px-3 py-2 text-sm text-neutral-400 shadow-sm"
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
          data-testid="study-chat-input"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100"
        />
        <button
          type="button"
          data-testid="study-chat-send"
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
