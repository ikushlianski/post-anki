import { useEffect, useState } from 'react'
import type { NothingExtractedStatistics } from '@post-anki/shared'

import { getNothingExtractedStatistics } from '../analytics.api'
import { NothingExtractedWeeklyBars } from './nothing-extracted-weekly-bars'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; statistics: NothingExtractedStatistics }

export function NothingExtractedSection() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getNothingExtractedStatistics()
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
    <section data-testid="nothing-extracted" className="mt-8">
      <h2 className="mb-3 text-lg font-medium">Notes that gave no cards</h2>
      {state.status === 'loading' ? <p role="status" className="text-sm text-neutral-500">Loading...</p> : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="nothing-extracted-error" className="text-sm text-neutral-600">
          Couldn't load this.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? <NothingExtractedWeeklyBars weekly={state.statistics.weekly} /> : null}
    </section>
  )
}
