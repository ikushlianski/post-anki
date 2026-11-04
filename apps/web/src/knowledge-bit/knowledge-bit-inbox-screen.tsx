import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import {
  discardKnowledgeBitFromInboxForReview,
  getInboxKnowledgeBits,
  returnKnowledgeBitFromInboxForReview,
} from './knowledge-bit-inbox.api'
import { moveKnowledgeBitToChatQueueForReview } from './knowledge-bit-chat-move.api'
import { KnowledgeBitInboxFilterBar } from './knowledge-bit-inbox-filter-bar'
import { KnowledgeBitInboxRow } from './knowledge-bit-inbox-row'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { ListTruncatedNotice } from './list-truncated-notice'
import { listTruncation, truncationAfterRemoval, type ListTruncation } from './list-truncation'
import { useInboxFilter } from './use-inbox-filter'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: InboxKnowledgeBit[] }

const NO_ITEMS: InboxKnowledgeBit[] = []

export function KnowledgeBitInboxScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [truncation, setTruncation] = useState<ListTruncation | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const filter = useInboxFilter(state.status === 'ready' ? state.items : NO_ITEMS)

  const load = useCallback(async () => {
    setState({ status: 'loading' })

    try {
      const list = await getInboxKnowledgeBits()

      setTruncation(listTruncation(list))
      setState({ status: 'ready', items: list.items })
    } catch {
      setState({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)

      if (busy) {
        next.add(id)
      } else {
        next.delete(id)
      }

      return next
    })
  }

  async function leave(id: string, failure: string, call: () => Promise<unknown>) {
    setBusy(id, true)
    setErrors((prev) => ({ ...prev, [id]: '' }))

    try {
      await call()
      setTruncation((prev) => truncationAfterRemoval(prev, 1))
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', items: prev.items.filter((item) => item.id !== id) }
          : prev,
      )
      notifyPendingReviewChanged()
    } catch {
      setErrors((prev) => ({ ...prev, [id]: failure }))
    } finally {
      setBusy(id, false)
    }
  }

  function backToTriage(id: string) {
    void leave(id, "Couldn't send back to triage. Try again.", () =>
      returnKnowledgeBitFromInboxForReview({ data: { bitId: id } }),
    )
  }

  function sendToChat(id: string) {
    void leave(id, "Couldn't send to Chat. Try again.", () =>
      moveKnowledgeBitToChatQueueForReview({ data: { bitId: id } }),
    )
  }

  function discard(id: string) {
    void leave(id, "Couldn't discard. Try again.", () =>
      discardKnowledgeBitFromInboxForReview({ data: { bitId: id } }),
    )
  }

  function change(id: string, patch: Partial<Omit<InboxKnowledgeBit, 'id'>>) {
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
        : prev,
    )
  }

  return (
    <main data-testid="knowledge-bit-inbox" className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set aside</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Items you set aside while triaging. Ask the tutor about them, then send them back to triage or discard them.
        </p>
      </header>

      {state.status === 'loading' ? (
        <p role="status" data-testid="knowledge-bit-inbox-loading" className="text-sm text-neutral-500">
          Loading…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div role="alert" data-testid="knowledge-bit-inbox-error" className="space-y-2 text-sm text-red-700">
          <p>Couldn't load your Inbox.</p>
          <button type="button" onClick={() => void load()} className={SECONDARY_BUTTON_CLASS}>
            Try again
          </button>
        </div>
      ) : null}

      <ListTruncatedNotice truncation={truncation} testId="knowledge-bit-inbox-truncated" />

      {state.status === 'ready' && state.items.length === 0 ? (
        <p data-testid="knowledge-bit-inbox-empty" className="text-sm text-neutral-600">
          Nothing is set aside. While{' '}
          <Link to="/knowledge-bit-review" className="font-medium text-neutral-900 underline">
            triaging suggested cards
          </Link>
          , choose "Set aside" to keep an item here.
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <>
          <KnowledgeBitInboxFilterBar
            query={filter.input}
            subject={filter.subject}
            subjects={filter.subjects}
            shown={filter.visible.length}
            total={state.items.length}
            active={filter.active}
            onQueryChange={filter.setInput}
            onSubjectChange={filter.setSubject}
            onClear={filter.clear}
          />
          {filter.visible.length === 0 ? (
            <div data-testid="knowledge-bit-inbox-no-matches" className="space-y-2 text-sm text-neutral-600">
              <p>No Inbox items match your filters.</p>
              <button type="button" onClick={filter.clear} className={SECONDARY_BUTTON_CLASS}>
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filter.visible.map((item) => (
                <KnowledgeBitInboxRow
                  key={item.id}
                  item={item}
                  busy={busyIds.has(item.id)}
                  error={errors[item.id] || null}
                  onBackToTriage={backToTriage}
                  onSendToChat={sendToChat}
                  onDiscard={discard}
                  onChange={change}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </main>
  )
}
