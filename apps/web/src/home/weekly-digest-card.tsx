import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KNOWLEDGE_BIT_REJECT_REASON_LABELS, type WeeklyDigestCard as WeeklyDigestCardData } from '@post-anki/shared'

import { getWeeklyDigestCard } from '../analytics/analytics.api'
import { describeDelta } from './weekly-digest-card-delta'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; digest: WeeklyDigestCardData }

function Stat({ id, label, value, note }: { id: string; label: string; value: number; note: string }) {
  return (
    <div data-testid={`weekly-digest-${id}`}>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-neutral-900">{value}</dd>
      <dd className="text-xs text-neutral-500">{note}</dd>
    </div>
  )
}

export function WeeklyDigestCardView({ digest }: { digest: WeeklyDigestCardData }) {
  const { current, previous, chatBacklog } = digest
  const isEmpty =
    current.accepted + current.rejected + current.reviewed + previous.accepted + previous.rejected + previous.reviewed === 0 &&
    chatBacklog === 0

  if (isEmpty) {
    return (
      <p data-testid="weekly-digest-empty" className="text-sm text-neutral-500">
        No activity in the last two weeks yet.
      </p>
    )
  }

  const topReasons = digest.topRejectReasons ?? []

  return (
    <>
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat id="accepted" label="Accepted" value={current.accepted} note={describeDelta(current.accepted, previous.accepted)} />
      <Stat id="rejected" label="Rejected" value={current.rejected} note={describeDelta(current.rejected, previous.rejected)} />
      <Stat id="reviewed" label="Reviewed" value={current.reviewed} note={describeDelta(current.reviewed, previous.reviewed)} />
      <div data-testid="weekly-digest-backlog">
        <dt className="text-xs text-neutral-500">Chat backlog</dt>
        <dd className="text-xl font-semibold tabular-nums text-neutral-900">{chatBacklog}</dd>
        <dd className="text-xs">
          <Link to="/knowledge/chat" className="text-indigo-600 hover:underline">
            Open Chat
          </Link>
        </dd>
      </div>
    </dl>
    {(digest.chatTurns ?? 0) > 0 ? (
      <p data-testid="weekly-digest-chat-activity" className="mt-3 text-xs text-neutral-500">
        Chat: {digest.chatCards ?? 0} {digest.chatCards === 1 ? 'card' : 'cards'}, {digest.chatTurns}{' '}
        {digest.chatTurns === 1 ? 'turn' : 'turns'} this week
      </p>
    ) : null}
    {topReasons.length > 0 ? (
      <div data-testid="weekly-digest-reject-reasons" className="mt-4">
        <h3 className="text-xs text-neutral-500">Top reject reasons</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {topReasons.map(({ reason, count, delta }) => (
            <li key={reason}>
              <Link to="/knowledge/rejected" search={{ reason }} className="text-indigo-600 hover:underline">
                {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason]}
              </Link>{' '}
              <span className="tabular-nums text-neutral-500">({count})</span>
              {delta ? (
                <span data-testid={`weekly-digest-reason-delta-${reason}`} className="ml-1 text-xs tabular-nums text-neutral-500">
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    </>
  )
}

export function WeeklyDigestCard() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getWeeklyDigestCard()
      .then((digest) => {
        if (active) {
          setState({ status: 'ready', digest })
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error' })
        }
      })

    return () => {
      active = false
    }
  }, [attempt])

  return (
    <section data-testid="weekly-digest-card" className="card-compact mb-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Last 7 days</h2>
      {state.status === 'loading' ? <p role="status" className="text-sm text-neutral-500">Loading...</p> : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="weekly-digest-error" className="text-sm text-neutral-600">
          Couldn't load the weekly digest.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? <WeeklyDigestCardView digest={state.digest} /> : null}
    </section>
  )
}
