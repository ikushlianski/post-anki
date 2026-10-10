import { useReducer } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewCounts } from '@post-anki/shared'

import { AnkiReviewCard } from './anki-review-card'
import { AnkiReviewCardActions } from './anki-review-card-actions'
import { AnkiReviewCardEditor } from './anki-review-card-editor'
import { AnkiReviewCounts } from './anki-review-counts'
import { AnkiReviewDone } from './anki-review-done'
import { AnkiReviewGradeButtons } from './anki-review-grade-buttons'
import { useAnkiReviewKeyboard } from './anki-review-keyboard'
import {
  ankiReviewSessionReducer,
  applyEdit,
  initialAnkiReviewSession,
  type SessionTally,
} from './anki-review-session'
import {
  actionErrorMessage,
  browserTimeZone,
  NON_RETRYABLE_ERRORS,
  useAnkiReviewSessionActions,
} from './anki-review-session-actions'
import { AnkiReviewSessionBar } from './anki-review-session-bar'
import { deriveSessionStats } from './anki-review-session-stats'
import { AnkiReviewSummary } from './anki-review-summary'
import { getReviewCards } from './anki-review.api'

export interface AnkiReviewScope {
  tagId?: string
  topicId?: string
  knowledgeBitId?: string
}

const BATCH_LIMIT = 10

function remainingCounts(server: ReviewCounts, tally: SessionTally | null, stamp: number) {
  const graded = tally && tally.stamp === stamp ? tally : { new: 0, review: 0 }

  return {
    ...server,
    new: Math.max(0, server.new - graded.new),
    review: Math.max(0, server.review - graded.review),
  }
}

function reviewQueueQueryKey(scope: AnkiReviewScope) {
  return [
    'anki-review-queue',
    scope.tagId ?? null,
    scope.topicId ?? null,
    scope.knowledgeBitId ?? null,
  ] as const
}

export function AnkiReviewScreen({ scope }: { scope: AnkiReviewScope }) {
  const scopeKey = reviewQueueQueryKey(scope).join('|')

  return <AnkiReviewSession key={scopeKey} scope={scope} />
}

function AnkiReviewSession({ scope }: { scope: AnkiReviewScope }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(ankiReviewSessionReducer, Date.now(), initialAnkiReviewSession)

  const queue = useQuery({
    queryKey: reviewQueueQueryKey(scope),
    queryFn: () => getReviewCards({ data: { limit: BATCH_LIMIT, tz: browserTimeZone(), ...scope } }),
  })

  const cards = queue.data?.ok ? queue.data.cards : []
  const stamp = queue.dataUpdatedAt
  const rawCurrent = state.front[0] ?? cards[state.index] ?? null
  const card = rawCurrent ? applyEdit(rawCurrent, state.edits) : null
  const actions = useAnkiReviewSessionActions({
    state,
    dispatch,
    batchSize: cards.length,
    stamp,
    current: card,
    refill: () => queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey(scope) }),
  })
  const current = actions.refilling ? null : card
  const editing = state.editingSince !== null
  const loadFailed = queue.isError || queue.data?.ok === false
  const loaded = queue.data?.ok === true && !loadFailed
  const counts = queue.data?.ok ? remainingCounts(queue.data.counts, state.tally, stamp) : null
  const stats = deriveSessionStats(
    state.undo,
    Object.keys(state.edits).length,
    queue.data?.ok ? queue.data.counts : null,
    state.tally,
    stamp,
  )
  const canUndo = state.undo.length > 0
  const noApprovedCards =
    queue.data?.ok === true &&
    queue.data.nextDueAt === null &&
    queue.data.counts.new + queue.data.counts.learning + queue.data.counts.review === 0 &&
    stats.done === 0

  useAnkiReviewKeyboard(
    { hasCard: current !== null, revealed: state.revealed, busy: actions.busy, canUndo, editing },
    (action) => {
      switch (action.type) {
        case 'reveal':
          return dispatch({ type: 'reveal' })
        case 'grade':
          return void actions.grade(action.grade)
        case 'undo':
          return void actions.undo()
        case 'edit':
          return dispatch({ type: 'editStarted', now: Date.now() })
        case 'bury':
          return void actions.control('bury')
        case 'suspend':
          return void actions.control('suspend')
      }
    },
  )

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Recall the answer, reveal it, then grade yourself.
          </p>
        </div>
        <Link
          to="/knowledge/answer"
          search={scope}
          data-testid="anki-review-switch-to-typed"
          className="text-sm text-indigo-600 hover:underline"
        >
          Switch to typed answer
        </Link>
      </header>

      {queue.isLoading && <p data-testid="anki-review-loading">Loading…</p>}

      {!queue.isLoading && loadFailed && (
        <div data-testid="anki-review-load-error" className="flex flex-col gap-2">
          <p className="text-sm text-red-600">Couldn't load cards.</p>
          <button
            type="button"
            data-testid="anki-review-retry"
            onClick={() => void queue.refetch()}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {actions.refilling && !loadFailed && <p data-testid="anki-review-loading">Loading…</p>}

      {loaded && counts && <AnkiReviewCounts counts={counts} />}

      {loaded && (current || state.undo.length > 0) && (
        <AnkiReviewSessionBar
          stats={stats}
          canUndo={canUndo}
          disabled={actions.busy}
          onUndo={() => void actions.undo()}
          onEnd={() => dispatch({ type: 'summaryShown' })}
        />
      )}

      {state.notice && (
        <p data-testid="anki-review-notice" className="mb-4 text-sm text-amber-700">
          {state.notice}
        </p>
      )}

      {loaded && state.view === 'summary' && (
        <AnkiReviewSummary stats={stats} onKeepReviewing={() => dispatch({ type: 'summaryClosed' })} />
      )}

      {loaded && state.view === 'reviewing' && !actions.refilling && !current && queue.data?.ok && (
        <>
          <AnkiReviewDone nextDueAt={queue.data.nextDueAt} noApprovedCards={noApprovedCards} />
          {canUndo && <AnkiReviewSummary stats={stats} />}
        </>
      )}

      {current && state.view === 'reviewing' && (
        <div className="flex flex-col gap-6">
          <AnkiReviewCard
            card={current}
            revealed={state.revealed}
            onReveal={() => dispatch({ type: 'reveal' })}
            actions={
              <AnkiReviewCardActions
                revealed={state.revealed && !editing}
                leech={current.leech}
                disabled={actions.busy || editing}
                onEdit={() => dispatch({ type: 'editStarted', now: Date.now() })}
                onBury={() => void actions.control('bury')}
                onSuspend={() => void actions.control('suspend')}
              />
            }
            editor={
              editing ? (
                <AnkiReviewCardEditor
                  prompt={current.prompt}
                  answer={current.answer}
                  error={actions.editError}
                  disabled={actions.busy}
                  onSave={(prompt, answer) => void actions.saveEdit(prompt, answer)}
                  onCancel={() => {
                    actions.setEditError(null)
                    dispatch({ type: 'editCancelled', now: Date.now() })
                  }}
                />
              ) : undefined
            }
          />

          {state.revealed && !editing && (
            <AnkiReviewGradeButtons
              disabled={actions.busy}
              intervalPreview={current.intervalPreview}
              onGrade={(value) => void actions.grade(value)}
            />
          )}

          {actions.error && (
            <div data-testid="anki-review-grade-error" className="flex flex-col gap-2">
              <p className="text-sm text-red-600">{actionErrorMessage(actions.error)}</p>
              {NON_RETRYABLE_ERRORS.has(actions.error) && (
                <button
                  type="button"
                  data-testid="anki-review-skip"
                  onClick={() => void actions.advance()}
                  className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Skip this card
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
