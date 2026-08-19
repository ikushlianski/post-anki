import { useState } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DecideBlindSpot, DecideSession } from './decide.model'
import { listDecideSessions, resolveDecideBlindSpot, submitDecide } from './decide.server-fns'

export function decideHistoryQuery() {
  return queryOptions({
    queryKey: ['decide-sessions'] as const,
    queryFn: () => listDecideSessions(),
  })
}

function DecideList({ title, testId, items }: { title: string; testId: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</h2>
      <ul data-testid={testId} className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="text-neutral-400">·</span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function BlindSpotItem({
  blindSpot,
  index,
  onResolve,
}: {
  blindSpot: DecideBlindSpot
  index: number
  onResolve: (blindSpotId: string, status: 'accepted' | 'rejected') => void
}) {
  const [busy, setBusy] = useState(false)

  async function resolve(status: 'accepted' | 'rejected') {
    setBusy(true)

    try {
      const updated = await resolveDecideBlindSpot({
        data: { blindSpotId: blindSpot.id, status },
      })

      onResolve(updated.id, updated.status as 'accepted' | 'rejected')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      data-testid={`decide-blind-spot-item-${index}`}
      data-blind-spot-id={blindSpot.id}
      data-status={blindSpot.status}
      className="flex flex-wrap items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
    >
      <span className="text-neutral-400">·</span>
      <span className="flex-1" data-testid={`decide-blind-spot-description-${index}`}>
        {blindSpot.description}
      </span>

      {blindSpot.status === 'pending' ? (
        <span className="flex gap-2">
          <button
            type="button"
            data-testid={`decide-blind-spot-flag-button-${index}`}
            disabled={busy}
            onClick={() => resolve('accepted')}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40 dark:border-neutral-700"
          >
            Flag as a gap to revisit
          </button>
          <button
            type="button"
            data-testid={`decide-blind-spot-dismiss-button-${index}`}
            disabled={busy}
            onClick={() => resolve('rejected')}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40 dark:border-neutral-700"
          >
            Dismiss
          </button>
        </span>
      ) : (
        <span className="text-xs font-medium text-neutral-500">
          {blindSpot.status === 'accepted' ? 'Flagged' : 'Dismissed'}
        </span>
      )}
    </li>
  )
}

export function Decide() {
  const queryClient = useQueryClient()
  const { data: history } = useQuery(decideHistoryQuery())

  const [decision, setDecision] = useState('')
  const [opinion, setOpinion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DecideSession | null>(null)

  const canSubmit = decision.trim().length > 0 && opinion.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) {
      return
    }

    setBusy(true)

    try {
      const session = await submitDecide({
        data: { decision: decision.trim(), opinion: opinion.trim() },
      })

      setResult(session)
      void queryClient.invalidateQueries({ queryKey: decideHistoryQuery().queryKey })
    } finally {
      setBusy(false)
    }
  }

  function handleBlindSpotResolved(blindSpotId: string, status: 'accepted' | 'rejected') {
    setResult((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        blindSpots: current.blindSpots.map((blindSpot) =>
          blindSpot.id === blindSpotId ? { ...blindSpot, status } : blindSpot,
        ),
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3 card-compact dark:border-neutral-800 dark:bg-transparent">
        <div>
          <label className="text-xs text-neutral-400">The decision you're facing</label>
          <textarea
            data-testid="decide-decision-input"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            placeholder="e.g. Should we move sessions from JWTs to server-side sessions?"
            rows={2}
            className="mt-1 w-full input dark:border-neutral-700 dark:bg-transparent"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Your opinion — what you'd do and why</label>
          <textarea
            data-testid="decide-opinion-input"
            value={opinion}
            onChange={(event) => setOpinion(event.target.value)}
            placeholder="Say where you currently lean and your reasoning."
            rows={4}
            className="mt-1 w-full input dark:border-neutral-700 dark:bg-transparent"
          />
        </div>
        <button
          type="button"
          data-testid="decide-submit-button"
          disabled={!canSubmit || busy}
          onClick={handleSubmit}
          className="btn-primary dark:bg-white dark:text-neutral-900"
        >
          {busy ? 'Evaluating…' : 'Challenge my thinking'}
        </button>
      </div>

      {result ? (
        <div
          data-testid="decide-result"
          data-verdict={result.verdict}
          className="space-y-5 card-compact dark:border-neutral-800"
        >
          <div className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white">
            <span className="text-neutral-400">Verdict · </span>
            {result.verdict}
          </div>

          <DecideList title="Strengths" testId="decide-result-strengths" items={result.strengths} />

          {result.blindSpots.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Blind spots
              </h2>
              <ul className="space-y-1.5">
                {result.blindSpots.map((blindSpot, index) => (
                  <BlindSpotItem
                    key={blindSpot.id}
                    blindSpot={blindSpot}
                    index={index}
                    onResolve={handleBlindSpotResolved}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <DecideList title="Questions to sit with" testId="decide-result-questions" items={result.questions} />
        </div>
      ) : null}

      {history && history.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Previous decisions
          </h2>
          {history.map((session, index) => (
            <div
              key={session.id}
              data-testid={`decide-history-item-${index}`}
              data-verdict={session.verdict}
              className="card-compact text-sm dark:border-neutral-800"
            >
              <p className="font-medium">{session.decision}</p>
              <p className="mt-1 text-neutral-500">{session.verdict}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
