import { useState } from 'react'

// Must match the server's fixed menu exactly (probe-session.service.ts's
// EXAM_TARGET_COUNTS) — a free-form count is rejected with a 400.
const QUESTION_COUNT_OPTIONS = [10, 20, 30] as const

export type ExamQuestionCount = (typeof QUESTION_COUNT_OPTIONS)[number]

export function MockExamStart({
  busy,
  onStart,
  error = null,
}: {
  busy: boolean
  onStart: (targetCount: ExamQuestionCount) => void
  error?: string | null
}) {
  const [targetCount, setTargetCount] = useState<ExamQuestionCount>(10)

  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-6"
      data-testid="mock-exam-start"
    >
      <h1 className="text-xl font-semibold text-neutral-900">Mock exam</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick how many questions — a timed, one-shot quiz with a final score.
        It doesn&apos;t track gap mastery or change topic depth.
      </p>

      <div className="mt-4 flex gap-2">
        {QUESTION_COUNT_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            data-testid={`exam-count-${count}`}
            onClick={() => setTargetCount(count)}
            className={
              targetCount === count
                ? 'rounded-md border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500'
            }
          >
            {count} questions
          </button>
        ))}
      </div>

      <button
        type="button"
        data-testid="start-mock-exam"
        disabled={busy}
        onClick={() => onStart(targetCount)}
        className="mt-5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Generating…' : 'Start exam'}
      </button>

      {error ? (
        <p data-testid="mock-exam-error" className="mt-2 text-sm text-neutral-500">
          {error}
        </p>
      ) : null}
    </div>
  )
}
