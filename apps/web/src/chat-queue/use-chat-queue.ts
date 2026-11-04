import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { listTruncation, truncationAfterRemoval, type ListTruncation } from '../knowledge-bit/list-truncation'
import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'
import { chatQueueFailureFromThrown, chatQueueFailureMessage } from './chat-queue-failure'
import { getChatQueue } from './chat-queue.api'
import { useRefetchOnFocus } from './use-refetch-on-focus'

export type ChatQueueState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ChatQueueKnowledgeBit[] }

export function useChatQueue() {
  const [state, setState] = useState<ChatQueueState>({ status: 'loading' })
  const [truncation, setTruncation] = useState<ListTruncation | null>(null)
  const removedRef = useRef<Set<string>>(new Set())
  const snoozeChangesRef = useRef<Map<string, string | null> | null>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })

    try {
      const outcome = await getChatQueue()

      setTruncation(outcome.ok ? listTruncation(outcome.data) : null)
      setState(
        outcome.ok
          ? { status: 'ready', items: outcome.data.items }
          : { status: 'error', message: chatQueueFailureMessage(outcome.failure) },
      )
    } catch {
      setState({ status: 'error', message: chatQueueFailureMessage(chatQueueFailureFromThrown()) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    removedRef.current = new Set()

    const snoozeChanges = new Map<string, string | null>()

    snoozeChangesRef.current = snoozeChanges

    try {
      const outcome = await getChatQueue()

      if (!outcome.ok) {
        return
      }

      const removed = removedRef.current

      setTruncation(listTruncation(outcome.data))
      setState({
        status: 'ready',
        items: outcome.data.items
          .filter((item) => !removed.has(item.id))
          .map((item) =>
            snoozeChanges.has(item.id)
              ? { ...item, snoozedUntil: snoozeChanges.get(item.id) ?? null }
              : item,
          ),
      })
    } catch {
      return
    } finally {
      if (snoozeChangesRef.current === snoozeChanges) {
        snoozeChangesRef.current = null
      }
    }
  }, [])

  useRefetchOnFocus(() => {
    void refresh()
  })

  const resolved = useCallback((id: string) => {
    removedRef.current.add(id)
    setTruncation((prev) => truncationAfterRemoval(prev, 1))
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', items: prev.items.filter((item) => item.id !== id) }
        : prev,
    )
    notifyPendingReviewChanged()
  }, [])

  const resolvedMany = useCallback((ids: string[]) => {
    const gone = new Set(ids)

    ids.forEach((id) => removedRef.current.add(id))
    setTruncation((prev) => truncationAfterRemoval(prev, gone.size))

    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', items: prev.items.filter((item) => !gone.has(item.id)) }
        : prev,
    )
    notifyPendingReviewChanged()
  }, [])

  const snoozedChanged = useCallback((id: string, snoozedUntil: string | null) => {
    snoozeChangesRef.current?.set(id, snoozedUntil)
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            items: prev.items.map((item) => (item.id === id ? { ...item, snoozedUntil } : item)),
          }
        : prev,
    )
    notifyPendingReviewChanged()
  }, [])

  return { state, truncation, load, resolved, resolvedMany, snoozedChanged }
}
