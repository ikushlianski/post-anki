import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewGrade } from '@post-anki/shared'

import { AnkiReviewCard } from './anki-review-card'
import { AnkiReviewGradeButtons } from './anki-review-grade-buttons'
import { useAnkiReviewKeyboard } from './anki-review-keyboard'
import { getReviewCards, submitReview } from './anki-review.api'

export interface AnkiReviewScope {
  tagId?: string
  topicId?: string
  knowledgeBitId?: string
}

const BATCH_LIMIT = 10

function reviewQueueQueryKey(scope: AnkiReviewScope) {
  return [
    'anki-review-queue',
    scope.tagId ?? null,
    scope.topicId ?? null,
    scope.knowledgeBitId ?? null,
  ] as const
}

const NON_RETRYABLE_ERRORS = new Set(['not_approved', 'variant_not_found'])

function gradeErrorMessage(error: string): string {
  if (NON_RETRYABLE_ERRORS.has(error)) {
    return 'This card is no longer available for review. Skip it to continue.'
  }

  return "Couldn't save that grade. Try again."
}

export function AnkiReviewScreen({ scope }: { scope: AnkiReviewScope }) {
  const scopeKey = reviewQueueQueryKey(scope).join('|')

  return <AnkiReviewSession key={scopeKey} scope={scope} />
}

function AnkiReviewSession({ scope }: { scope: AnkiReviewScope }) {
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [shownAt, setShownAt] = useState(() => Date.now())
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [exhaustedAt, setExhaustedAt] = useState<number | null>(null)

  const queue = useQuery({
    queryKey: reviewQueueQueryKey(scope),
    queryFn: () => getReviewCards({ data: { limit: BATCH_LIMIT, ...scope } }),
  })

  const gradeMutation = useMutation({
    mutationFn: (input: { variantId: string; grade: ReviewGrade; durationMs: number }) =>
      submitReview({ data: input }),
  })

  const cards = queue.data?.ok ? queue.data.cards : []
  const awaitingFresh = exhaustedAt !== null && exhaustedAt === queue.dataUpdatedAt
  const current = awaitingFresh ? null : (cards[index] ?? null)
  const loadFailed = queue.isError || queue.data?.ok === false

  function reveal() {
    setRevealed(true)
  }

  function advance() {
    setRevealed(false)
    setGradeError(null)
    setShownAt(Date.now())

    if (index + 1 < cards.length) {
      setIndex(index + 1)
      return
    }

    setIndex(0)
    setExhaustedAt(queue.dataUpdatedAt)
    void queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey(scope) })
  }

  async function grade(value: ReviewGrade) {
    if (!current || gradeMutation.isPending) {
      return
    }

    setGradeError(null)

    const outcome = await gradeMutation
      .mutateAsync({
        variantId: current.variantId,
        grade: value,
        durationMs: Math.min(Math.max(Date.now() - shownAt, 0), 86_400_000),
      })
      .catch(() => ({ ok: false as const, error: 'grading_failed' }))

    if (!outcome.ok) {
      setGradeError(outcome.error)
      return
    }

    advance()
  }

  useAnkiReviewKeyboard(
    { hasCard: current !== null, revealed, busy: gradeMutation.isPending },
    (action) => (action.type === 'reveal' ? reveal() : void grade(action.grade)),
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

      {awaitingFresh && !loadFailed && <p data-testid="anki-review-loading">Loading…</p>}

      {!queue.isLoading && !loadFailed && !awaitingFresh && !current && (
        <p data-testid="anki-review-empty">Nothing to review right now.</p>
      )}

      {current && (
        <div className="flex flex-col gap-6">
          <AnkiReviewCard card={current} revealed={revealed} onReveal={reveal} />

          {revealed && (
            <AnkiReviewGradeButtons
              disabled={gradeMutation.isPending}
              onGrade={(value) => void grade(value)}
            />
          )}

          {gradeError && (
            <div data-testid="anki-review-grade-error" className="flex flex-col gap-2">
              <p className="text-sm text-red-600">{gradeErrorMessage(gradeError)}</p>
              {NON_RETRYABLE_ERRORS.has(gradeError) && (
                <button
                  type="button"
                  data-testid="anki-review-skip"
                  onClick={advance}
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
