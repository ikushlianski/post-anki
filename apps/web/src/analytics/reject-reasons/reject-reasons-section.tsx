import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KNOWLEDGE_BIT_REJECT_REASON_LABELS, type RejectReasonsStatistics } from '@post-anki/shared'

import { getRejectReasonsStatistics } from '../analytics.api'
import { RejectReasonsByType } from './reject-reasons-by-type'
import { RejectReasonsBySubject } from './reject-reasons-by-subject'
import { RejectReasonsWeeklyTrend } from './reject-reasons-weekly-trend'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; statistics: RejectReasonsStatistics }

export function RejectReasonsSection() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getRejectReasonsStatistics()
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
    <section data-testid="reject-reasons" className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Reject reasons</h2>
        <Link
          to="/knowledge/rejected"
          data-testid="reject-reasons-browse-link"
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          Browse rejected cards →
        </Link>
      </div>
      {state.status === 'loading' ? <p role="status" className="text-sm text-neutral-500">Loading...</p> : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="reject-reasons-error" className="text-sm text-neutral-600">
          Couldn't load reject reasons.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? <ReasonRows statistics={state.statistics} /> : null}
    </section>
  )
}

function ReasonRows({ statistics }: { statistics: RejectReasonsStatistics }) {
  const trend = (
    <>
      {statistics.weekly ? <RejectReasonsWeeklyTrend weekly={statistics.weekly} /> : null}
      {statistics.bySubjectType ? <RejectReasonsByType byType={statistics.bySubjectType} /> : null}
      {statistics.bySubject ? <RejectReasonsBySubject bySubject={statistics.bySubject} /> : null}
    </>
  )

  if (statistics.total === 0) {
    return (
      <>
        <p data-testid="reject-reasons-empty" className="text-sm text-neutral-500">
          No rejected cards yet
        </p>
        {trend}
      </>
    )
  }

  return (
    <>
    <ul data-testid="reject-reasons-list" className="space-y-2">
      {statistics.reasons.map(({ reasonCode, count, share }) => (
        <li key={reasonCode} data-testid={`reject-reason-${reasonCode}`} className="flex items-center gap-3 text-sm">
          <span className="w-64 shrink-0 truncate text-neutral-600">{KNOWLEDGE_BIT_REJECT_REASON_LABELS[reasonCode]}</span>
          <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 flex-1">
            <rect x={0} y={0} width={100} height={8} className="fill-neutral-100" />
            <rect x={0} y={0} width={share * 100} height={8} className="fill-neutral-800" />
          </svg>
          <span className="w-24 text-right tabular-nums">
            {count} ({Math.round(share * 100)}%)
          </span>
        </li>
      ))}
    </ul>
    {trend}
    </>
  )
}
