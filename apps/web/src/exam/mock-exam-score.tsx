export function MockExamScore({
  correct,
  total,
  answered,
  timedOut,
  onRetake,
}: {
  correct: number
  total: number
  answered: number
  timedOut: boolean
  onRetake: () => void
}) {
  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-6 text-center"
      data-testid="exam-score"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">
        {timedOut ? "Time's up" : 'Exam complete'}
      </p>
      <p className="mt-2 text-3xl font-semibold text-neutral-900">
        {correct}/{total}
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        {answered} of {total} question{total === 1 ? '' : 's'} answered.
      </p>
      <button
        type="button"
        data-testid="retake-mock-exam"
        onClick={onRetake}
        className="mt-5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Take another exam
      </button>
    </div>
  )
}
