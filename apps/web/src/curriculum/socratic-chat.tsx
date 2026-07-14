import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'

import { answerSocraticSession, startSocraticSession } from './socratic.api'

interface ChatMessage {
  id: string
  role: 'mentor' | 'learner'
  text: string
}

export function SocraticChat({ topicId }: { topicId: string }) {
  const router = useRouter()
  const { data: session, isLoading } = useQuery({
    queryKey: ['socratic-session', topicId],
    queryFn: () => startSocraticSession({ data: { topicId } }),
  })

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answer, setAnswer] = useState('')
  const [turnId, setTurnId] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const seededSessionId = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (session && seededSessionId.current !== session.id) {
      seededSessionId.current = session.id

      if (session.current) {
        setTurnId(session.current.id)
        setMessages([
          { id: session.current.id, role: 'mentor', text: session.current.prompt },
        ])
      } else if (session.status === 'completed') {
        setCompleted(true)
      }
    }
  }, [session])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const mutation = useMutation({
    mutationFn: (vars: { turnId: string; answer: string }) =>
      answerSocraticSession({
        data: { sessionId: session!.id, turnId: vars.turnId, answer: vars.answer },
      }),
    onSuccess: (result, vars) => {
      if (!result) {
        return
      }

      setMessages((prev) => [
        ...prev,
        { id: `${vars.turnId}-feedback`, role: 'mentor', text: result.feedback },
      ])

      if (result.next && result.next.id !== vars.turnId) {
        setTurnId(result.next.id)
        setMessages((prev) => [
          ...prev,
          { id: result.next!.id, role: 'mentor', text: result.next!.prompt },
        ])
      } else if (!result.next) {
        setTurnId(null)

        if (result.status === 'completed') {
          setCompleted(true)
        }
      }

      if (result.covered) {
        void router.invalidate()
      }
    },
  })

  function send() {
    if (!turnId || answer.trim().length === 0 || mutation.isPending) {
      return
    }

    setMessages((prev) => [
      ...prev,
      { id: `${turnId}-answer-${Date.now()}`, role: 'learner', text: answer },
    ])
    mutation.mutate({ turnId, answer })
    setAnswer('')
  }

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-400">The mentor is preparing a question…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-500">
          Couldn’t start the mentor session right now. Try reloading.
        </p>
      </div>
    )
  }

  return (
    <div
      className="mt-3 flex flex-col rounded-md border border-neutral-200 bg-neutral-50"
      data-testid="socratic-chat"
    >
      <div
        ref={scrollRef}
        className="max-h-96 space-y-2 overflow-y-auto p-4"
        data-testid="socratic-messages"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={`socratic-message-${message.role}`}
            className={
              message.role === 'mentor'
                ? 'mr-auto max-w-[85%] rounded-lg rounded-bl-none bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm'
                : 'ml-auto max-w-[85%] rounded-lg rounded-br-none bg-neutral-900 px-3 py-2 text-sm text-white'
            }
          >
            {message.text}
          </div>
        ))}

        {mutation.isPending ? (
          <div
            data-testid="socratic-typing-indicator"
            className="mr-auto flex max-w-[60%] items-center gap-1 rounded-lg rounded-bl-none bg-white px-3 py-2 text-sm text-neutral-400 shadow-sm"
          >
            <span className="animate-pulse">Thinking…</span>
          </div>
        ) : null}

        {completed ? (
          <p
            className="text-center text-xs text-emerald-700"
            data-testid="socratic-complete"
          >
            Topic complete — {session.topicMaturity}%
          </p>
        ) : null}
      </div>

      {!completed ? (
        <div className="flex gap-2 border-t border-neutral-200 p-3">
          <input
            type="text"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                send()
              }
            }}
            disabled={mutation.isPending || !turnId}
            placeholder="Your answer…"
            data-testid="socratic-input"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100"
          />
          <button
            type="button"
            data-testid="socratic-send"
            disabled={mutation.isPending || !turnId || answer.trim().length === 0}
            onClick={send}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  )
}
