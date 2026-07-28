import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldReplenish } from '@post-anki/core'
import type {
  AnswerProbeSessionGapMasteryResult,
  OptionExplanation,
  ProbeScope,
  ProbeSession,
  ProbeSessionQuestion,
} from '@post-anki/shared'

// Kept in sync with the server's own floor (apps/api/src/probe-session/probe-session.service.ts,
// REPLENISH_FLOOR) — SCENARIO 17's "at least 10 ready" invariant is checked
// identically on both sides, so the client's refetch-on-low check fires at
// the same moment the server's own background generation does.
const REPLENISH_FLOOR = 10

import {
  answerProbeSession,
  getActiveProbeSession,
  prepareProbeSession,
} from './probe-session.api'
import { ItemFeedbackButtons } from '../feedback/item-feedback-buttons'

function probeSessionQueryKey(scope: ProbeScope, scopeId: string) {
  return ['probe-session', scope, scopeId] as const
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

function buildAskAboutThisSeed(question: ProbeSessionQuestion): string {
  const correctIndexes =
    question.correctAnswerIndexes ?? (question.correctAnswerIndex !== null
      ? [question.correctAnswerIndex]
      : [])
  const correctAnswers = correctIndexes
    .map((i) => question.options[i])
    .filter((option): option is string => Boolean(option))
    .join(', ')

  return [
    `About this question: "${question.prompt}"`,
    `Options: ${question.options.join(' / ')}`,
    correctAnswers ? `Correct answer: ${correctAnswers}` : '',
    'Can you explain why?',
  ]
    .filter(Boolean)
    .join(' ')
}

function UngroundedNotice() {
  return (
    <p
      data-testid="quiz-ungrounded-notice"
      className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      This course's material isn't citation-verified — treat explanations as
      unverified.
    </p>
  )
}

export function ProbeSessionQuiz({
  topicId,
  scope = 'topic',
  scopeId,
  hasCitableSources = true,
  onAskAboutThis,
}: {
  topicId?: string
  scope?: ProbeScope
  scopeId?: string
  hasCitableSources?: boolean
  onAskAboutThis?: (seed: string) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const resolvedScopeId = scopeId ?? topicId ?? ''
  const queryKey = probeSessionQueryKey(scope, resolvedScopeId)

  const { data: session, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getActiveProbeSession({ data: { scope, scopeId: resolvedScopeId } }),
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      prepareProbeSession({
        data: { scope, scopeId: resolvedScopeId, allowMultiSelect: true },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result)
    },
  })

  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [selectedMulti, setSelectedMulti] = useState<number[]>([])
  // Generalized recall-gap mastery tracking (issue #57) — the mutation
  // result's gapMastery sub-object only exists transiently on the response
  // (the session model itself has no per-question mastery field), so it's
  // held here to render the resolution acknowledgment / practicing-progress
  // feedback, cleared whenever the learner moves to the next question.
  const [lastGapMastery, setLastGapMastery] =
    useState<AnswerProbeSessionGapMasteryResult | null>(null)

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
                  optionExplanations: result.optionExplanations,
                }
              : q,
          ),
        }
      })

      setLastGapMastery(result.gapMastery)

      if (result.coveredGapLabels.length > 0 || result.gapMastery) {
        void router.invalidate()
      }

      // Refetch-on-low (SCENARIO 17, 18): the server fires its own
      // background top-up once remaining unanswered questions crosses the
      // same floor (probe-session.service.ts's REPLENISH_FLOOR) — this is
      // the client picking up whatever that generation has produced so far
      // by re-querying the already-existing active-session endpoint, no new
      // polling loop. If the refetch lands before generation finishes, the
      // learner simply doesn't see the new questions until they answer past
      // this point again (an accepted staleness window, not a bug — see
      // architecture.md's Phase 4 notes).
      if (shouldReplenish(result.total, result.answered, REPLENISH_FLOOR)) {
        void queryClient.invalidateQueries({ queryKey })
      }
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
    setLastGapMastery(null)
    setCurrentQuestionId(nextQuestion(session)?.id ?? null)
  }

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-400">Checking for an active quiz…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div
        className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4"
        data-testid="quiz-empty-state"
      >
        {!hasCitableSources ? <UngroundedNotice /> : null}
        {generateMutation.isPending ? (
          <p className="text-sm text-neutral-400" data-testid="quiz-generating">
            Generating probing questions…
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-600">
              No quiz has been generated for this topic yet.
            </p>
            <button
              type="button"
              data-testid="generate-quiz"
              onClick={() => generateMutation.mutate()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Generate Probing Questions
            </button>
            {generateMutation.isError || generateMutation.data === null ? (
              <p className="mt-2 text-sm text-neutral-500">
                Couldn’t generate a quiz right now. Try again.
              </p>
            ) : null}
          </>
        )}
      </div>
    )
  }

  if (!current) {
    return (
      <div
        className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4"
        data-testid="quiz-complete"
      >
        {!hasCitableSources ? <UngroundedNotice /> : null}
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
      {!hasCitableSources ? <UngroundedNotice /> : null}
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

      <ItemFeedbackButtons itemType="probe_question" itemId={current.id} />

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
            {answered ? (
              <OptionExplanationText
                explanation={current.optionExplanations?.[index] ?? null}
                index={index}
              />
            ) : null}
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
          <GapMasteryFeedback gapMastery={lastGapMastery} />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="quiz-next"
              onClick={goNext}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500"
            >
              Next question
            </button>
            {onAskAboutThis ? (
              <button
                type="button"
                data-testid="quiz-ask-about-this"
                onClick={() => onAskAboutThis(buildAskAboutThisSeed(current))}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500"
              >
                Ask about this
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Generalized recall-gap mastery tracking (issue #57) — a resolution
// acknowledgment ("✓ Resolved: <label>"), rendered distinctly from the
// ordinary "correct, still practicing (n/3)" language shown on the 1st/2nd
// corrects (and on a same-session repeat, which stays at whatever n/3 it
// already was). Never rendered below mastered — a single correct answer on
// a fresh gap must never read as resolved (the "resolved lie" regression
// guard, spec.md's S5).
function GapMasteryFeedback({
  gapMastery,
}: {
  gapMastery: AnswerProbeSessionGapMasteryResult | null
}) {
  // No currentGapId cross-check: lastGapMastery is set exactly once per
  // mutation success, scoped 1:1 to whichever question was just answered
  // (and cleared on goNext) — cross-checking against the QUESTION's own
  // gapId field would wrongly suppress this for a novel gap created
  // reactively at answer time (SCENARIO 2/4), whose question never had a
  // resolved gapId to begin with even though the answer itself did create
  // and track one.
  if (!gapMastery) {
    return null
  }

  if (gapMastery.justMastered) {
    return (
      <p
        className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
        data-testid="gap-resolution-ack"
      >
        ✓ Resolved: {gapMastery.label}
      </p>
    )
  }

  if (gapMastery.status === 'practicing' || gapMastery.status === 'struggling') {
    return (
      <p className="text-xs text-neutral-500" data-testid="gap-mastery-progress">
        {gapMastery.label} — {gapMastery.status} ({gapMastery.masteryStage}/3)
      </p>
    )
  }

  return null
}

function OptionExplanationText({
  explanation,
  index,
}: {
  explanation: OptionExplanation | null
  index: number
}) {
  if (!explanation) {
    return null
  }

  return (
    <p
      className="mt-1 pl-1 text-xs text-neutral-500"
      data-testid={`quiz-option-explanation-${index}`}
    >
      {explanation.text}
      {explanation.citationUrl ? (
        <>
          {' '}
          <a
            href={explanation.citationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-700 underline"
            data-testid={`quiz-option-citation-${index}`}
          >
            source
          </a>
        </>
      ) : null}
    </p>
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
