import { useEffect, useReducer, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { GAMIFICATION_PROFILE_KEY } from '../gamification/gamification-profile.query'
import { SessionCelebration } from '../gamification/session-celebration'
import { resolveCardSubjectId } from '../subject-chat/card-subject'
import { SessionClosure } from '../motivation/session-closure'
import { DailyGoalChipLoader } from '../study-goal/daily-goal-chip'
import { SubjectChatPanel } from '../subject-chat/subject-chat-panel'
import { useCardSelection } from '../subject-chat/use-card-selection'
import { useSubjectHinting } from '../subject-study-options/use-subject-hinting'
import { AnkiReviewCard } from './anki-review-card'
import { AnkiReviewCardActions } from './anki-review-card-actions'
import { AnkiReviewCardEditPanel } from './anki-review-card-edit-panel'
import { AnkiReviewGradeError } from './anki-review-grade-error'
import { AnkiReviewCounts } from './anki-review-counts'
import { AnkiReviewDone } from './anki-review-done'
import { AnkiReviewGradeButtons } from './anki-review-grade-buttons'
import { AnkiReviewRehearsalButtons, AnkiReviewRehearsalLabel } from './anki-review-rehearsal-buttons'
import { useAnkiReviewKeyboard } from './anki-review-keyboard'
import {
  ankiReviewSessionReducer,
  applyEdit,
  initialAnkiReviewSession,
} from './anki-review-session'
import { useAnkiReviewSessionActions } from './anki-review-session-actions'
import { AnkiReviewSessionBar } from './anki-review-session-bar'
import { deriveSessionStats } from './anki-review-session-stats'
import { AnkiReviewSummary } from './anki-review-summary'
import { AnkiReviewLimitReached } from './anki-review-limit-reached'
import { useAnkiReviewQueue } from './anki-review-queue-query'
import {
  isScoped,
  remainingCounts,
  reviewQueueQueryKey,
  type AnkiReviewScope,
} from './anki-review-queue'
import { AnkiReviewShortcutsHelp } from './anki-review-shortcuts-help'
import { useOnlineStatus } from '../shared/use-online-status'

export type { AnkiReviewScope }

export function AnkiReviewScreen({ scope }: { scope: AnkiReviewScope }) {
  const scopeKey = reviewQueueQueryKey(scope).join('|')

  return <AnkiReviewSession key={scopeKey} scope={scope} />
}

function AnkiReviewSession({ scope }: { scope: AnkiReviewScope }) {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(ankiReviewSessionReducer, Date.now(), initialAnkiReviewSession)

  const undoRef = useRef(state.undo)
  const studyAheadRef = useRef(false)

  undoRef.current = state.undo

  const [aheadDays, setAheadDays] = useState(0)
  const queue = useAnkiReviewQueue({ scope, aheadDays, undoRef, studyAheadRef })

  const queuedCards = queue.data?.ok ? queue.data.cards : []
  const cards = state.hidden.length > 0 ? queuedCards.filter((c) => !state.hidden.includes(c.variantId)) : queuedCards
  const stamp = queue.dataUpdatedAt
  const rawCurrent = state.front[0] ?? cards[state.index] ?? null
  const card = rawCurrent ? applyEdit(rawCurrent, state.edits) : null
  const online = useOnlineStatus()
  const actions = useAnkiReviewSessionActions({
    state,
    dispatch,
    batchSize: cards.length,
    stamp,
    burySiblings: scope.knowledgeBitId === undefined,
    current: card,
    refill: () => queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey(scope) }),
  })
  const current = actions.refilling ? null : card
  const hintingEnabled = useSubjectHinting(resolveCardSubjectId(current))
  const editing = state.editingSince !== null
  const [chatCardId, setChatCardId] = useState<string | null>(null)
  const chatOpen = current !== null && chatCardId === current.variantId
  const setChatOpen = (open: boolean) => setChatCardId(open && current ? current.variantId : null)
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

  useEffect(() => {
    if (stats.pointsEarned > 0) {
      void queryClient.invalidateQueries({ queryKey: GAMIFICATION_PROFILE_KEY })
    }
  }, [stats.pointsEarned, queryClient])

  const celebration = (
    <SessionCelebration
      pointsEarned={stats.pointsEarned}
      leveledUp={stats.leveledUp}
      level={stats.levelReached}
    />
  )
  const cardAreaRef = useRef<HTMLDivElement | null>(null)
  const cardSelection = useCardSelection(cardAreaRef, state.revealed, current?.variantId ?? '')
  const noApprovedCards =
    queue.data?.ok === true &&
    queue.data.nextDueAt === null &&
    queue.data.counts.new + queue.data.counts.learning + queue.data.counts.review === 0 &&
    stats.done === 0

  useAnkiReviewKeyboard(
    { hasCard: current !== null, revealed: state.revealed, busy: actions.busy, canUndo, editing, chatOpen },
    (action) => {
      switch (action.type) {
        case 'reveal':
          return dispatch({ type: 'reveal' })
        case 'grade':
          return void actions.gradeKey(action.grade)
        case 'undo':
          return void actions.undo()
        case 'edit':
          return dispatch({ type: 'editStarted', now: Date.now() })
        case 'bury':
          return void actions.control('bury')
        case 'suspend':
          return void actions.control('suspend')
        case 'chat':
          return setChatOpen(true)
      }
    },
  )

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <AnkiReviewShortcutsHelp />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Recall the answer, reveal it, then grade yourself.
        </p>
      </header>

      <div className="mb-4">
        <DailyGoalChipLoader refreshKey={stats.done} />
      </div>

      {queue.isLoading && <p data-testid="anki-review-loading">Loading…</p>}

      {!queue.isLoading && loadFailed && (
        <div role="alert" data-testid="anki-review-load-error" className="flex flex-col gap-2">
          <p className="text-sm text-red-600">Couldn't load cards.</p>
          <button
            type="button"
            data-testid="anki-review-retry"
            disabled={!online}
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

      <div role="status" aria-live="polite">
        {state.notice && (
          <p data-testid="anki-review-notice" className="mb-4 text-sm text-amber-700">
            {state.notice}
          </p>
        )}
      </div>

      {loaded && state.view === 'summary' && (
        <>
          {celebration}
          <AnkiReviewSummary stats={stats} onKeepReviewing={() => dispatch({ type: 'summaryClosed' })} />
        </>
      )}

      {loaded && state.view === 'reviewing' && !actions.refilling && !current && queue.data?.ok && (
        queue.data.limitReached && aheadDays === 0 && queuedCards.length === 0 ? (
          <>
            <AnkiReviewLimitReached
              reviewedToday={queue.data.reviewedToday ?? 0}
              limit={queue.data.limit ?? 0}
              onReviewAhead={setAheadDays}
            />
            {celebration}
            {canUndo && <AnkiReviewSummary stats={stats} />}
          </>
        ) : (
        <>
          <AnkiReviewDone
            nextDueAt={queue.data.nextDueAt}
            noApprovedCards={noApprovedCards}
            newLimitReached={queue.data.newLimitReached}
            subjectId={scope.subjectId}
            onStudyAhead={
              isScoped(scope) && !studyAheadRef.current && queue.data.nextDueAt !== null
                ? () => {
                    studyAheadRef.current = true
                    void queue.refetch()
                  }
                : undefined
            }
          />
          <SessionClosure refreshKey={stats.done} />
          {celebration}
          {canUndo && <AnkiReviewSummary stats={stats} />}
        </>
        )
      )}

      {current && state.view === 'reviewing' && (
        <div className="flex flex-col gap-6">
          <div ref={cardAreaRef}>
            {actions.rehearsal && <AnkiReviewRehearsalLabel />}
            <AnkiReviewCard
              card={current}
              hintingEnabled={hintingEnabled}
              revealed={state.revealed}
              onReveal={() => dispatch({ type: 'reveal' })}
              chatOpen={chatOpen}
              onChatOpenChange={setChatOpen}
              onReplaceAccepted={() => void actions.control('suspend')}
              actions={
                <AnkiReviewCardActions
                  revealed={state.revealed && !editing}
                  leech={current.leech}
                  disabled={actions.busy || editing}
                  onEdit={() => dispatch({ type: 'editStarted', now: Date.now() })}
                  onBury={() => void actions.control('bury')}
                  onSuspend={() => void actions.control('suspend')}
                  onChat={() => setChatOpen(true)}
                />
              }
              editor={
                editing ? (
                  <AnkiReviewCardEditPanel
                    card={current}
                    actions={actions}
                    onCancel={() => {
                      actions.setEditError(null)
                      dispatch({ type: 'editCancelled', now: Date.now() })
                    }}
                  />
                ) : undefined
              }
            />
          </div>

          {state.revealed && !editing && actions.rehearsal && (
            <AnkiReviewRehearsalButtons disabled={actions.busy} onGrade={(value) => void actions.grade(value)} />
          )}

          {state.revealed && !editing && !actions.rehearsal && (
            <AnkiReviewGradeButtons
              disabled={actions.busy}
              intervalPreview={current.intervalPreview}
              onGrade={(value) => void actions.grade(value)}
            />
          )}

          <SubjectChatPanel
            key={resolveCardSubjectId(current) ?? 'no-subject'}
            subjectId={resolveCardSubjectId(current)}
            selection={cardSelection.selection}
            onClearSelection={cardSelection.clear}
            card={{
              cardId: current.variantId,
              text: state.revealed ? `${current.prompt}\n${current.answer}` : current.prompt,
            }}
          />

          <AnkiReviewGradeError actions={actions} />
        </div>
      )}
    </main>
  )
}
