import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { ReviewStatistics } from '@post-anki/shared'

import { browserTimeZone } from '../../shared/browser-time-zone'
import { useKnowledgeOverviewSubjects } from '../../knowledge-bit/use-knowledge-overview-subjects'
import { SearchableSelect } from '../../ui/searchable-select'
import { getReviewStatistics } from '../analytics.api'
import { AnswerButtonsChart } from './answer-buttons-chart'
import { DueForecastChart } from './due-forecast-chart'
import { RetentionChart } from './retention-chart'

const FORECAST_OPTIONS = [7, 14, 30]
const HISTORY_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
  { value: 0, label: 'All time' },
]

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; statistics: ReviewStatistics }

const SELECT_CLASS = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm'

export function ReviewStatisticsSection({
  subjectId,
  onSubjectChange,
}: {
  subjectId: string | null
  onSubjectChange: (subjectId: string | null) => void
}) {
  const { options } = useKnowledgeOverviewSubjects()
  const [forecastDays, setForecastDays] = useState(14)
  const [historyDays, setHistoryDays] = useState(90)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getReviewStatistics({
      data: { tz: browserTimeZone(), subjectId: subjectId ?? undefined, forecastDays, historyDays },
    })
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
  }, [subjectId, forecastDays, historyDays, attempt])

  return (
    <div data-testid="review-statistics" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <SearchableSelect
          options={options}
          value={subjectId ?? ''}
          onChange={(id) => onSubjectChange(id === '' ? null : id)}
          ariaLabel="Subject"
          testId="statistics-subject"
          placeholder="All subjects"
          clearable
          containerClassName="w-64"
        />
        <select
          aria-label="History window"
          data-testid="statistics-history"
          className={SELECT_CLASS}
          value={historyDays}
          onChange={(event) => setHistoryDays(Number(event.target.value))}
        >
          {HISTORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Forecast horizon"
          data-testid="statistics-forecast"
          className={SELECT_CLASS}
          value={forecastDays}
          onChange={(event) => setForecastDays(Number(event.target.value))}
        >
          {FORECAST_OPTIONS.map((days) => (
            <option key={days} value={days}>
              Next {days} days
            </option>
          ))}
        </select>
      </div>

      {state.status === 'loading' ? <p role="status" className="text-sm text-neutral-500">Loading statistics...</p> : null}

      {state.status === 'error' ? (
        <p data-testid="statistics-error" className="text-sm text-neutral-600">
          Couldn't load statistics right now.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </p>
      ) : null}

      {state.status === 'ready' ? <StatisticsPanels statistics={state.statistics} /> : null}
    </div>
  )
}

function StatisticsPanels({ statistics }: { statistics: ReviewStatistics }) {
  const neverReviewed = statistics.range.earliestReviewDate === null

  return (
    <>
      {neverReviewed ? (
        <p data-testid="statistics-no-reviews" className="text-sm text-neutral-600">
          No reviews yet. Do a review session and your statistics appear here.{' '}
          <Link to="/knowledge/review" className="underline">
            Start reviewing
          </Link>
        </p>
      ) : (
        <p className="text-xs text-neutral-500">History starts on {statistics.range.earliestReviewDate}.</p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Due forecast</h2>
        <DueForecastChart forecast={statistics.forecast} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Review retention</h2>
        <RetentionChart retention={statistics.retention} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Answer buttons</h2>
        <AnswerButtonsChart answerButtons={statistics.answerButtons} />
      </section>
    </>
  )
}
