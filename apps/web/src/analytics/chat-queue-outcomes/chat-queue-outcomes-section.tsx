import { useEffect, useState } from 'react'
import type { ChatQueueOutcomesStatistics } from '@post-anki/shared'

import { getChatQueueOutcomesStatistics } from '../analytics.api'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; statistics: ChatQueueOutcomesStatistics }

const OUTCOMES = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'waiting', label: 'Still waiting' },
  { key: 'snoozed', label: 'Snoozed' },
] as const

export function ChatQueueOutcomesSection() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getChatQueueOutcomesStatistics()
      .then((statistics) => {
        if (active) {
          setState({ status: 'ready', statistics })
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
    <section data-testid="chat-queue-outcomes" className="mt-8">
      <h2 className="mb-3 text-lg font-medium">What happened to cards sent to Chat</h2>
      {state.status === 'loading' ? <p role="status" className="text-sm text-neutral-500">Loading...</p> : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="chat-queue-outcomes-error" className="text-sm text-neutral-600">
          Couldn't load this.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? <OutcomeRows statistics={state.statistics} /> : null}
    </section>
  )
}

function OutcomeRows({ statistics }: { statistics: ChatQueueOutcomesStatistics }) {
  if (statistics.total === 0) {
    return (
      <p data-testid="chat-queue-outcomes-empty" className="text-sm text-neutral-500">
        No cards were sent to Chat in the last {statistics.windowDays} days
      </p>
    )
  }

  return (
    <>
      <p data-testid="chat-queue-outcomes-total" className="mb-3 text-sm text-neutral-600">
        {statistics.total} cards sent to Chat in the last {statistics.windowDays} days
      </p>
      <ul className="space-y-2">
        {OUTCOMES.map(({ key, label }) => {
          const count = statistics[key]
          const share = count / statistics.total

          return (
            <li key={key} data-testid={`chat-queue-outcome-${key}`} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-neutral-600">{label}</span>
              <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 flex-1">
                <rect x={0} y={0} width={100} height={8} className="fill-neutral-100" />
                <rect x={0} y={0} width={share * 100} height={8} className="fill-neutral-800" />
              </svg>
              <span className="w-24 text-right tabular-nums">
                {count} ({Math.round(share * 100)}%)
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
