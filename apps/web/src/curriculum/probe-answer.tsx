import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { AttemptResult, Question, QuestionKind } from './model'
import { nextQuestion, submitAttempt } from './curriculum.api'

export function ProbeAnswer({
  topicId,
  mode,
  question,
  autoInvalidate = true,
}: {
  topicId: string
  mode: QuestionKind
  question: Question
  autoInvalidate?: boolean
}) {
  const router = useRouter()
  const [current, setCurrent] = useState<Question>(question)
  const [answer, setAnswer] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingNext, setLoadingNext] = useState(false)
  const [noMore, setNoMore] = useState(false)

  useEffect(() => {
    setCurrent(question)
    setResult(null)
    setAnswer('')
    setSelected(null)
  }, [question.id])

  function advanceTo(next: Question) {
    setResult(null)
    setAnswer('')
    setSelected(null)
    setCurrent(next)
  }

  async function persist(payload: {
    answer: string
    selfOutcome?: 'pass' | 'fail'
  }) {
    setBusy(true)

    const res = await submitAttempt({
      data: {
        topicId,
        gapId: current.gapId,
        mode,
        answer: payload.answer,
        selfOutcome: payload.selfOutcome,
      },
    })

    setBusy(false)

    if (res) {
      setResult(res)
    }

    if (autoInvalidate) {
      void router.invalidate()
    }
  }

  function chooseOption(index: number) {
    if (result !== null || busy) {
      return
    }

    setSelected(index)

    if (!current.gapId) {
      void persist({ answer: String(index) })

      return
    }

    const outcome =
      current.correctAnswerIndex !== undefined &&
      index === current.correctAnswerIndex
        ? 'pass'
        : 'fail'

    setResult({
      outcome,
      coveredGapLabels:
        outcome === 'pass' && current.gapLabel ? [current.gapLabel] : [],
      nextQuestion: null,
      feedback: localFeedback(outcome),
    })

    void persist({ answer: String(index), selfOutcome: outcome })
  }

  async function loadNext() {
    setLoadingNext(true)
    setNoMore(false)

    const next = await nextQuestion({ data: { topicId, mode } })

    setLoadingNext(false)

    if (next) {
      advanceTo(next)

      return
    }

    setNoMore(true)
  }

  return (
    <>
      {!current.gapId ? (
        <p className="mb-2 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-500">
          Opening question — your answer helps me map what you already know, and
          I’ll turn it into specific gaps to probe next.
        </p>
      ) : (
        <p className="mb-1 text-xs text-neutral-400">gap: {current.gapLabel}</p>
      )}
      <p className="text-sm text-neutral-800">{current.prompt}</p>

      {current.sources && current.sources.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
          <span>grounded in</span>
          {current.sources.map((url, index) => (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="max-w-[14rem] truncate text-blue-600 underline underline-offset-2"
              title={url}
            >
              {sourceLabel(url)}
            </a>
          ))}
        </div>
      ) : null}

      {mode === 'socratic' ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Reason it through — say more than was asked; the mentor checks off what you cover."
            rows={3}
            disabled={result !== null}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100"
          />
          {result === null ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => persist({ answer, selfOutcome: 'pass' })}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                I answered it well
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => persist({ answer, selfOutcome: 'fail' })}
                className="rounded-md bg-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
              >
                I struggled
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {current.options?.map((option, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={result !== null || busy}
                onClick={() => chooseOption(index)}
                className={optionClass(result, current.correctAnswerIndex, selected, index)}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!current.gapId && busy && result === null ? (
        <p className="mt-3 text-sm text-neutral-500">
          Checking your answer and mapping the gaps it reveals…
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-2">
          <p
            className={`text-sm font-medium ${
              result.outcome === 'pass' ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {result.feedback}
          </p>
          {result.coveredGapLabels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-700">
              <span className="text-neutral-400">closed</span>
              {result.coveredGapLabels.map((gapLabel, index) => (
                <span
                  key={index}
                  className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px]"
                >
                  ✓ {gapLabel}
                </span>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={loadingNext}
            onClick={() => void loadNext()}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
          >
            {loadingNext ? 'Loading next…' : 'Probe the next gap'}
          </button>
          {noMore ? (
            <p className="text-xs text-neutral-500">
              Nothing left to probe here right now — every in-scope gap is
              covered. Try another topic from the menu.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function localFeedback(outcome: 'pass' | 'fail'): string {
  return outcome === 'pass'
    ? 'Solid — that holds up. We’ll move to what’s still open.'
    : 'Not yet — this one stays open so we can come back to it.'
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function optionClass(
  result: AttemptResult | null,
  correctIndex: number | undefined,
  selected: number | null,
  index: number,
): string {
  const base =
    'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default'

  if (result === null) {
    return `${base} border-neutral-300 bg-white hover:border-neutral-500`
  }

  if (index === correctIndex) {
    return `${base} border-emerald-500 bg-emerald-50 text-emerald-800`
  }

  if (index === selected) {
    return `${base} border-amber-400 bg-amber-50 text-amber-800`
  }

  return `${base} border-neutral-200 bg-white text-neutral-400`
}
