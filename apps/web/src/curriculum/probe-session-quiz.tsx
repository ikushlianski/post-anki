import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProbeSession, ProbeSessionQuestion } from '@post-anki/shared'

import { answerProbeSession, prepareProbeSession } from './probe-session.api'

function probeSessionQueryKey(topicId: string) {
  return ['probe-session', topicId] as const
}

function nextQuestion(
  session: ProbeSession | null | undefined,
): ProbeSessionQuestion | null {
  if (!session) {
    return null
  }

  const pending = session.questions
    .filter((q) => q.answeredIndex === null)
    .sort((a, b) => a.order - b.order)

  return pending[0] ?? null
}

export function ProbeSessionQuiz({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient()
  const queryKey = probeSessionQueryKey(topicId)

  const { data: session, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      prepareProbeSession({
        data: { scope: 'topic', scopeId: topicId, allowMultiSelect: true },
      }),
  })

  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [selectedMulti, setSelectedMulti] = useState<number[]>([])

  useEffect(() => {
    if (session && currentQuestionId === null) {
      setCurrentQuestionId(nextQuestion(session)?.id ?? null)
    }
  }, [session, currentQuestionId])

  const current =
    session?.questions.find((q) => q.id === currentQuestionId) ?? null
  const answered = current !== null && current.answeredIndex !== null

  const mutation = useMutation({
    mutationFn: (vars: { selectedIndex?: number; selectedIndices?: number[] }) =>
      answerProbeSession({
        data: {
          sessionId: session!.id,
          questionId: current!.id,
          selectedIndex: vars.selectedIndex,
          selectedIndices: vars.selectedIndices,
        },
      }),
    onSuccess: (result, vars) => {
      if (!result) {
        return
      }

      queryClient.setQueryData<ProbeSession | null | undefined>(queryKey, (prev) => {
        if (!prev) {
          return prev
        }

        return {
          ...prev,
          correct: result.correct,
          answered: result.answered,
          total: result.total,
          status: result.status,
          questions: prev.questions.map((q) =>
            q.id === result.questionId
              ? {
                  ...q,
                  answeredIndex:
                    vars.selectedIndex ??
                    (vars.selectedIndices && vars.selectedIndices.length > 0
                      ? Math.min(...vars.selectedIndices)
                      : -1),
                  answeredIndexes: vars.selectedIndices ?? null,
                  outcome: result.outcome,
                  correctAnswerIndex: result.correctAnswerIndex,
                  correctAnswerIndexes: result.correctAnswerIndexes,
                }
              : q,
          ),
        }
      })
    },
  })

  function submitSingle(index: number) {
    if (!current || answered || mutation.isPending) {
      return
    }

    mutation.mutate({ selectedIndex: index })
  }

  function toggleMulti(index: number) {
    if (answered) {
      return
    }

    setSelectedMulti((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    )
  }

  function submitMulti() {
    if (!current || answered || mutation.isPending || selectedMulti.length === 0) {
      return
    }

    mutation.mutate({ selectedIndices: selectedMulti })
  }

  function goNext() {
    setSelectedMulti([])
    setCurrentQuestionId(nextQuestion(session)?.id ?? null)
  }

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-400">Preparing the quiz…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-500">
          Couldn’t prepare a quiz right now. Try reloading.
        </p>
      </div>
    )
  }

  if (!current) {
    return (
      <div
        className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4"
        data-testid="quiz-complete"
      >
        <p className="text-sm font-medium text-emerald-700">
          Quiz complete — {session.correct}/{session.total} correct.
        </p>
      </div>
    )
  }

  const isPass = current.outcome === 'pass'

  return (
    <div
      className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4"
      data-testid="quiz-question"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Question {session.answered + (answered ? 0 : 1)}/{session.total}
        </span>
        <span className="text-xs text-neutral-400">
          Score {session.correct}/{session.answered}
        </span>
      </div>

      <p className="text-sm text-neutral-800" data-testid="quiz-prompt">
        {current.prompt}
      </p>

      {current.type === 'multi' ? (
        <p className="mt-1 text-xs text-neutral-400">
          Select all that apply, then submit.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {current.options.map((option, index) => (
          <li key={index}>
            {current.type === 'multi' ? (
              <label
                className={multiOptionClass(current, selectedMulti, index)}
                data-testid={`quiz-option-${index}`}
              >
                <input
                  type="checkbox"
                  className="mr-2"
                  disabled={answered || mutation.isPending}
                  checked={selectedMulti.includes(index)}
                  onChange={() => toggleMulti(index)}
                />
                {option}
              </label>
            ) : (
              <button
                type="button"
                data-testid={`quiz-option-${index}`}
                disabled={answered || mutation.isPending}
                onClick={() => submitSingle(index)}
                className={singleOptionClass(current, index)}
              >
                {option}
              </button>
            )}
          </li>
        ))}
      </ul>

      {current.type === 'multi' && !answered ? (
        <button
          type="button"
          data-testid="quiz-submit-multi"
          disabled={mutation.isPending || selectedMulti.length === 0}
          onClick={submitMulti}
          className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Submit
        </button>
      ) : null}

      {answered ? (
        <div className="mt-3 space-y-2" data-testid="quiz-result">
          <p
            className={`text-sm font-medium ${isPass ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {isPass ? 'Correct.' : 'Not quite.'}
          </p>
          <button
            type="button"
            data-testid="quiz-next"
            onClick={goNext}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500"
          >
            Next question
          </button>
        </div>
      ) : null}
    </div>
  )
}

function singleOptionClass(
  question: ProbeSessionQuestion,
  index: number,
): string {
  const base =
    'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default'

  if (question.answeredIndex === null) {
    return `${base} border-neutral-300 bg-white hover:border-neutral-500`
  }

  if (index === question.correctAnswerIndex) {
    return `${base} border-emerald-500 bg-emerald-50 text-emerald-800`
  }

  if (index === question.answeredIndex) {
    return `${base} border-amber-400 bg-amber-50 text-amber-800`
  }

  return `${base} border-neutral-200 bg-white text-neutral-400`
}

function multiOptionClass(
  question: ProbeSessionQuestion,
  selected: number[],
  index: number,
): string {
  const base =
    'flex w-full items-center rounded-md border px-3 py-2 text-left text-sm transition-colors'

  if (question.answeredIndex === null) {
    return selected.includes(index)
      ? `${base} border-neutral-500 bg-neutral-100`
      : `${base} border-neutral-300 bg-white`
  }

  const correctIndexes = question.correctAnswerIndexes ?? []

  if (correctIndexes.includes(index)) {
    return `${base} border-emerald-500 bg-emerald-50 text-emerald-800`
  }

  if (question.answeredIndexes?.includes(index)) {
    return `${base} border-amber-400 bg-amber-50 text-amber-800`
  }

  return `${base} border-neutral-200 bg-white text-neutral-400`
}
