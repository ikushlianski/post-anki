import { useState } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'

import type { WritingCheck } from '@post-anki/shared'

import { getWritingChecks, submitWritingCheck } from './writing-check.api'

const VERDICT_STYLES: Record<string, string> = {
  Ok: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  NeedsReview:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  NeedsDeepDive: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
}

const VERDICT_LABELS: Record<string, string> = {
  Ok: 'Ok',
  NeedsReview: 'Needs review',
  NeedsDeepDive: 'Needs deep dive',
}

export function checkWritingHistoryQuery(subjectId: string) {
  return queryOptions({
    queryKey: ['writing-checks', subjectId] as const,
    queryFn: () => getWritingChecks({ data: subjectId }),
  })
}

export function CheckWriting({ subjectId }: { subjectId: string }) {
  const queryClient = useQueryClient()
  const { data: history } = useQuery(checkWritingHistoryQuery(subjectId))

  const [text, setText] = useState('')
  const [result, setResult] = useState<WritingCheck | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const canSubmit = text.trim().length > 0

  async function handleSubmit() {
    setIsChecking(true)
    try {
      const graded = await submitWritingCheck({ data: { subjectId, text } })

      setResult(graded)
      setText('')

      void queryClient.invalidateQueries({ queryKey: checkWritingHistoryQuery(subjectId).queryKey })
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <textarea
          rows={5}
          data-testid="check-writing-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a Slack message, PR description, email — anything you wrote…"
          className="w-full resize-none rounded-md border border-neutral-300 bg-transparent p-3 text-base dark:border-neutral-700"
        />
        <button
          type="button"
          data-testid="check-writing-submit-button"
          disabled={!canSubmit || isChecking}
          onClick={handleSubmit}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </div>

      {result && (
        <div
          data-testid="check-writing-result"
          data-verdict={result.verdict}
          className={'rounded-md border p-4 text-sm ' + VERDICT_STYLES[result.verdict]}
        >
          <p className="font-semibold">
            <span data-testid="check-writing-result-score">{result.score}</span>/10 ·{' '}
            <span data-testid="check-writing-result-verdict">{VERDICT_LABELS[result.verdict]}</span>
          </p>
          <p data-testid="check-writing-result-feedback" className="mt-1">
            {result.feedback}
          </p>
          <ul data-testid="check-writing-result-alternatives" className="mt-2 list-inside list-disc">
            {result.nativeAlternatives.map((alt) => (
              <li key={alt}>{alt}</li>
            ))}
          </ul>
        </div>
      )}

      {history && history.length > 0 && (
        <div data-testid="check-writing-history" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Previously checked</h2>
          {history.map((entry, index) => (
            <div
              key={entry.id}
              data-testid={`check-writing-history-item-${index}`}
              data-verdict={entry.verdict}
              className={'rounded-md border p-3 text-sm ' + VERDICT_STYLES[entry.verdict]}
            >
              <p className="font-semibold">
                <span data-testid={`check-writing-history-item-score-${index}`}>{entry.score}</span>/10 ·{' '}
                <span data-testid={`check-writing-history-item-verdict-${index}`}>
                  {VERDICT_LABELS[entry.verdict]}
                </span>
              </p>
              <p className="mt-1 text-neutral-500">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
