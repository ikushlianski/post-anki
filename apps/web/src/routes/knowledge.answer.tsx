import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getNextQuestionVariants,
  gradeQuestionVariant,
} from '../knowledge-bit/knowledge-answer.api'
import { KnowledgeBitChatPanel } from '../knowledge-bit/knowledge-bit-chat-panel'
import type { GradeQuestionVariantAnswerResult } from '../curriculum/api-client'

interface AnswerScreenSearch {
  tagId?: string
  topicId?: string
  knowledgeBitId?: string
}

export const Route = createFileRoute('/knowledge/answer')({
  validateSearch: (search: Record<string, unknown>): AnswerScreenSearch => ({
    tagId: typeof search.tagId === 'string' ? search.tagId : undefined,
    topicId: typeof search.topicId === 'string' ? search.topicId : undefined,
    knowledgeBitId:
      typeof search.knowledgeBitId === 'string' ? search.knowledgeBitId : undefined,
  }),
  component: AnswerScreen,
})

const BATCH_LIMIT = 5

function answerQueueQueryKey(
  tagId: string | undefined,
  topicId: string | undefined,
  knowledgeBitId: string | undefined,
) {
  return [
    'knowledge-answer-queue',
    tagId ?? null,
    topicId ?? null,
    knowledgeBitId ?? null,
  ] as const
}

function AnswerScreen() {
  const { tagId, topicId, knowledgeBitId } = Route.useSearch()
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<GradeQuestionVariantAnswerResult | null>(null)

  const [refilling, setRefilling] = useState(false)
  const grading = useRef(false)

  const {
    data: batch,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: answerQueueQueryKey(tagId, topicId, knowledgeBitId),
    queryFn: () =>
      getNextQuestionVariants({ data: { limit: BATCH_LIMIT, tagId, topicId, knowledgeBitId } }),
  })

  const gradeMutation = useMutation({
    mutationFn: (input: { variantId: string; userAnswer: string }) =>
      gradeQuestionVariant({ data: input }),
  })

  const waitingForRefill = refilling && isFetching
  const current = waitingForRefill || isError ? null : (batch?.[index] ?? null)

  async function submit() {
    if (!current || draft.trim() === '' || grading.current) {
      return
    }

    grading.current = true

    try {
      const outcome = await gradeMutation.mutateAsync({
        variantId: current.variantId,
        userAnswer: draft,
      })

      setResult(outcome)
    } catch {
      setResult({ ok: false, error: 'grading_failed' })
    } finally {
      grading.current = false
    }
  }

  function next() {
    setDraft('')
    setResult(null)

    if (batch && index + 1 < batch.length) {
      setIndex(index + 1)
      return
    }

    setIndex(0)
    setRefilling(true)
    void queryClient.invalidateQueries({
      queryKey: answerQueueQueryKey(tagId, topicId, knowledgeBitId),
    })
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Answer knowledge bits</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A knowledge fisher probing for the why behind what you've captured.
          </p>
        </div>
        <Link
          to="/knowledge/review"
          search={{ tagId, topicId, knowledgeBitId }}
          data-testid="answer-screen-switch-to-anki"
          className="text-sm text-indigo-600 hover:underline"
        >
          Switch to Anki review
        </Link>
      </header>

      {(isLoading || waitingForRefill) && <p data-testid="answer-screen-loading">Loading…</p>}

      {isError && !isLoading && (
        <div data-testid="answer-screen-load-error" className="flex flex-col gap-2">
          <p className="text-sm text-red-600">Couldn't load your questions.</p>
          <button
            type="button"
            data-testid="answer-screen-retry"
            onClick={() => void refetch()}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && !waitingForRefill && (!batch || batch.length === 0) && (
        <p data-testid="answer-screen-empty">Nothing to answer right now.</p>
      )}

      {current && (
        <div data-testid="answer-screen-question" className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">{current.bitBody}</p>
          <p className="font-medium">{current.prompt}</p>

          <KnowledgeBitChatPanel
            key={current.knowledgeBitId}
            knowledgeBitId={current.knowledgeBitId}
          />

          {!result && (
            <>
              <textarea
                data-testid="answer-screen-textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    void submit()
                  }
                }}
                className="min-h-24 rounded-md border border-neutral-200 p-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="answer-screen-submit"
                  onClick={() => void submit()}
                  disabled={gradeMutation.isPending || draft.trim() === ''}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Submit
                </button>
                <button
                  type="button"
                  data-testid="answer-screen-skip"
                  onClick={next}
                  disabled={gradeMutation.isPending}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-40"
                >
                  Skip for now
                </button>
              </div>
            </>
          )}

          {result && result.ok && (
            <div data-testid="answer-screen-feedback" className="flex flex-col gap-2">
              <p className="font-medium">{result.verdict}</p>
              <p className="text-sm text-neutral-700">{result.feedback}</p>
              {result.followUpQuestion && (
                <p className="text-sm italic text-neutral-500">{result.followUpQuestion}</p>
              )}
              <button
                type="button"
                data-testid="answer-screen-next"
                onClick={next}
                className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Next
              </button>
            </div>
          )}

          {result && !result.ok && (
            <div data-testid="answer-screen-error" className="flex flex-col gap-2">
              <p className="text-sm text-red-600">
                We couldn't grade your answer. Your answer is still saved here, so you can try
                again.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="answer-screen-try-again"
                  onClick={() => setResult(null)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Try again
                </button>
                <button
                  type="button"
                  data-testid="answer-screen-next"
                  onClick={next}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
                >
                  Skip this question
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
