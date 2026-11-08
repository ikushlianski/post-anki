import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_QUEUE_MAX_MESSAGE_CHARS,
  type ChatQueueKnowledgeBit,
  type ChatQueueProposal,
} from '@post-anki/shared'

import {
  chatQueueFailureMessage,
  type ChatQueueFailureKind,
  type ChatQueueOutcome,
} from './chat-queue-failure'
import {
  approveFromChatQueue,
  deleteLastChatExchange,
  getChatQueueThread,
  returnFromChatQueue,
  sendChatQueueMessage,
} from './chat-queue.api'
import { clearChatDraft, loadChatDraft } from './chat-queue-draft-storage'
import {
  dropLastExchange,
  restoreDraft,
  settle,
  toChatLines,
  withProposalDecision,
  type ChatLine,
} from './chat-thread-state'
import { useChatDeleteLast } from './use-chat-delete-last'
import { useChatDraftPersistence } from './use-chat-draft-persistence'
import { useChatReject } from './use-chat-reject'

export type { ChatLine }

export function useChatThread(item: ChatQueueKnowledgeBit, onResolved: (id: string) => void) {
  const [lines, setLines] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState(() => loadChatDraft(item.id))
  const [turnsLeft, setTurnsLeft] = useState(item.turnsLeft)
  const [capReached, setCapReached] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [budgetPaused, setBudgetPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retry = useRef<{ text: string; id: string } | null>(null)
  const busy = useRef(false)

  useChatDraftPersistence(item.id, draft)

  const limitReached = capReached || turnsLeft <= 0

  const handle = useCallback(
    (failure: ChatQueueFailureKind) => {
      if (failure === 'cap_reached') {
        setCapReached(true)
        setTurnsLeft(0)
      } else if (failure === 'budget_paused') {
        setBudgetPaused(true)
      } else if (failure === 'not_in_chat' || failure === 'not_found') {
        onResolved(item.id)
      }

      setError(chatQueueFailureMessage(failure))
    },
    [item.id, onResolved],
  )

  useEffect(() => {
    let active = true

    async function load() {
      const outcome = await settle(() => getChatQueueThread({ data: { bitId: item.id } }))

      if (!active) {
        return
      }

      if (outcome.ok) {
        setLines(toChatLines(outcome.data.messages))
        setTurnsLeft(outcome.data.turnsLeft)
        setCapReached(outcome.data.capReached)
      } else {
        handle(outcome.failure)
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [item.id, handle])

  const applyDecision = useCallback(
    (lineId: string, index: number, decision: Pick<ChatQueueProposal, 'status' | 'savedCardId'>) =>
      setLines((prev) => withProposalDecision(prev, lineId, index, decision)),
    [],
  )

  const deliver = useCallback(
    async (text: string, keepDraft = false, providedId?: string) => {
      const clientId =
        providedId ?? (retry.current?.text === text ? retry.current.id : crypto.randomUUID())
      const userLine: ChatLine = { id: `u-${clientId}`, isUser: true, text }

      retry.current = { text, id: clientId }
      setLines((prev) => [...prev, userLine])
      if (!keepDraft) {
        setDraft('')
      }

      setSending(true)
      setError(null)

      const outcome = await settle(() =>
        sendChatQueueMessage({
          data: { bitId: item.id, message: { clientMessageId: clientId, message: text } },
        }),
      )

      if (outcome.ok) {
        setLines((prev) => [
          ...prev,
          {
            id: `a-${clientId}`,
            isUser: false,
            text: outcome.data.reply,
            seq: outcome.data.replySeq,
            ...(outcome.data.proposals?.length ? { proposals: outcome.data.proposals } : {}),
          },
        ])
        setTurnsLeft(outcome.data.turnsLeft)
        setCapReached(outcome.data.capReached)
        retry.current = null
        if (!keepDraft) {
          clearChatDraft(item.id)
        }
      } else {
        setLines((prev) => prev.filter((line) => line.id !== userLine.id))
        setDraft((prev) => restoreDraft(prev, text, keepDraft))
        handle(outcome.failure)
      }

      setSending(false)
      busy.current = false
    },
    [handle, item.id],
  )

  const send = useCallback(
    async (preset?: string) => {
      const text = (preset ?? draft).trim()

      if (!text || busy.current || limitReached || budgetPaused) {
        return
      }

      busy.current = true
      await deliver(text)
    },
    [budgetPaused, deliver, draft, limitReached],
  )

  const sendWithId = useCallback(
    async (text: string, clientMessageId: string): Promise<boolean> => {
      if (busy.current || limitReached || budgetPaused) {
        return false
      }

      busy.current = true
      await deliver(text, true, clientMessageId)

      return true
    },
    [budgetPaused, deliver, limitReached],
  )

  const retryLast = useCallback(async () => {
    const last = lines.at(-1)
    const question = lines.at(-2)

    if (busy.current || budgetPaused || !last || last.isUser || !question?.isUser) {
      return
    }

    busy.current = true
    setSending(true)
    setError(null)

    const outcome = await settle(() => deleteLastChatExchange({ data: { bitId: item.id } }))

    if (!outcome.ok) {
      handle(outcome.failure)
      setSending(false)
      busy.current = false

      return
    }

    setLines((prev) => dropLastExchange(prev))
    setTurnsLeft(outcome.data.turnsLeft)
    setCapReached(outcome.data.capReached)
    retry.current = null
    await deliver(question.text, true)
  }, [budgetPaused, deliver, handle, item.id, lines])

  const resolve = useCallback(
    async (call: () => Promise<ChatQueueOutcome<unknown>>, after?: () => void) => {
      if (busy.current) {
        return
      }

      busy.current = true
      setResolving(true)
      setError(null)

      const outcome = await settle(call)

      if (outcome.ok) {
        after ? after() : onResolved(item.id)
      } else {
        handle(outcome.failure)
      }

      setResolving(false)
      busy.current = false
    },
    [handle, item.id, onResolved],
  )

  const accept = useCallback(
    () => resolve(() => approveFromChatQueue({ data: { bitId: item.id } })),
    [item.id, resolve],
  )

  const backToTriage = useCallback(
    () => resolve(() => returnFromChatQueue({ data: { bitId: item.id } })),
    [item.id, resolve],
  )

  const clearChat = backToTriage

  const { rejecting, reject, sendRejectReason, skipRejectReason } = useChatReject(
    item.id,
    busy,
    handle,
    onResolved,
    setResolving,
    setError,
  )

  const removal = useChatDeleteLast(item.id, busy, handle, (result) => {
    setLines((prev) => dropLastExchange(prev))
    setTurnsLeft(result.turnsLeft)
    setCapReached(result.capReached)
    setError(null)
  })

  const changeDraft = useCallback(
    (value: string) => setDraft(value.slice(0, CHAT_QUEUE_MAX_MESSAGE_CHARS)),
    [],
  )

  return {
    lines,
    applyDecision,
    draft,
    changeDraft,
    turnsLeft,
    limitReached,
    loading,
    sending,
    resolving,
    budgetPaused,
    error,
    rejecting,
    showsStarters: lines.length === 0 && !loading && !limitReached && !budgetPaused,
    canSend:
      !limitReached && !budgetPaused && !sending && !resolving && draft.trim().length > 0,
    send,
    sendWithId,
    retryLast,
    accept,
    reject,
    backToTriage,
    clearChat,
    sendRejectReason,
    skipRejectReason,
    removal,
  }
}
