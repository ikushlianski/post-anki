import { useEffect, useState } from 'react'

import { listKnowledgeBrowserSubjectCounts } from '../knowledge-bit/knowledge-browser.api'
import { CARD_MATURITY_PALETTE } from '../knowledge-bit/card-maturity-palette'
import { cardMaturityOf, percentOf, type CardMaturity } from './card-maturity'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; maturity: CardMaturity }

const SEGMENTS = [
  { key: 'mature', label: 'Mature', color: CARD_MATURITY_PALETTE.mature.fill },
  { key: 'learning', label: 'Learning', color: CARD_MATURITY_PALETTE.learning.fill },
  { key: 'new', label: 'New', color: CARD_MATURITY_PALETTE.new.fill },
] as const

export function StatsCardMaturity() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    listKnowledgeBrowserSubjectCounts()
      .then((outcome) => {
        if (active) {
          setState(outcome.ok ? { status: 'ready', maturity: cardMaturityOf(outcome.counts) } : { status: 'error' })
        }
      })
      .catch(() => active && setState({ status: 'error' }))

    return () => {
      active = false
    }
  }, [])

  return (
    <section data-testid="stats-card-maturity">
      <h2 className="mb-3 text-lg font-medium">Card maturity</h2>
      {state.status === 'loading' ? (
        <p role="status" className="text-sm text-neutral-500">
          Loading...
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="stats-card-maturity-error" className="text-sm text-neutral-600">
          Couldn't load card maturity.
        </p>
      ) : null}
      {state.status === 'ready' ? <MaturityBreakdown maturity={state.maturity} /> : null}
    </section>
  )
}

function MaturityBreakdown({ maturity }: { maturity: CardMaturity }) {
  if (maturity.total === 0) {
    return <p className="text-sm text-neutral-500">No cards yet.</p>
  }

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
        {SEGMENTS.map(({ key, color }) => (
          <div key={key} className={color} style={{ width: `${(maturity[key] / maturity.total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {SEGMENTS.map(({ key, label, color }) => (
          <li key={key} data-testid={`maturity-${key}`} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
            <span>{label}</span>
            <span className="ml-auto tabular-nums text-neutral-600">
              {percentOf(maturity[key], maturity.total)}% · {maturity[key]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
