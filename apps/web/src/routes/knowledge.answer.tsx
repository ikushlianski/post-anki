import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getNextQuestionVariants,
  gradeQuestionVariant,
} from '../knowledge-bit/knowledge-answer.api'
import type { GradeQuestionVariantAnswerResult } from '../curriculum/api-client'

interface AnswerScreenSearch {
  tagId?: string
}

export const Route = createFileRoute('/knowledge/answer')({
  validateSearch: (search: Record<string, unknown>): AnswerScreenSearch => ({
    tagId: typeof search.tagId === 'string' ? search.tagId : undefined,
  }),
  component: AnswerScreen,
})

const BATCH_LIMIT = 5

function answerQueueQueryKey(tagId: string | undefined) {
  return ['knowledge-answer-queue', tagId ?? null] as const
}

function AnswerScreen() {
  const { tagId } = Route.useSearch()
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<GradeQuestionVariantAnswerResult | null>(null)

  const { data: batch, isLoading } = useQuery({
    queryKey: answerQueueQueryKey(tagId),
    queryFn: () => getNextQuestionVariants({ data: { limit: BATCH_LIMIT, tagId } }),
  })

  const gradeMutation = useMutation({
    mutationFn: (input: { variantId: string; userAnswer: string }) =>
      gradeQuestionVariant({ data: input }),
  })

  const current = batch?.[index] ?? null

  async function submit() {
    if (!current || draft.trim() === '') {
      return
    }

    try {
      const outcome = await gradeMutation.mutateAsync({
        variantId: current.variantId,
        userAnswer: draft,
      })

      setResult(outcome)
    } catch {
      setResult({ ok: false, error: 'grading_failed' })
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
    void queryClient.invalidateQueries({ queryKey: answerQueueQueryKey(tagId) })
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Answer knowledge bits</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A knowledge fisher probing for the why behind what you've captured.
        </p>
      </header>

      {isLoading && <p data-testid="answer-screen-loading">Loading…</p>}

      {!isLoading && (!batch || batch.length === 0) && (
        <p data-testid="answer-screen-empty">Nothing to answer right now.</p>
      )}

      {current && (
        <div data-testid="answer-screen-question" className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">{current.bitBody}</p>
          <p className="font-medium">{current.prompt}</p>

          {!result && (
            <>
              <textarea
                data-testid="answer-screen-textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-24 rounded-md border border-neutral-200 p-2 text-sm"
              />
              <button
                type="button"
                data-testid="answer-screen-submit"
                onClick={() => void submit()}
                disabled={gradeMutation.isPending || draft.trim() === ''}
                className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Submit
              </button>
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
              <p className="text-sm text-red-600">Couldn't grade that answer: {result.error}</p>
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
        </div>
      )}
    </main>
  )
}
