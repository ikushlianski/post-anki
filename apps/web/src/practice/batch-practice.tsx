import { useEffect, useMemo, useState } from 'react'

import type { Pack, PracticeAttempt, PracticeLevel } from '@post-anki/shared'

import { submitAttempts } from './practice.api'
import { usePracticeBatch } from './use-practice-batch'
import { BATCH_SIZE, PACK_LABELS } from './practice.constants'

type GradedAttempt = Omit<PracticeAttempt, 'createdAt'>

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

export function BatchPractice({
  subjectId,
  level,
  pack,
}: {
  subjectId: string
  level: PracticeLevel | undefined
  pack: Pack | undefined
}) {
  const { batchId, phrases, isBatchReady, isNextBatchReady, prefetchNextBatch, advanceToNextBatch } =
    usePracticeBatch(subjectId, level, pack)

  const [chunkSize, setChunkSize] = useState<5 | 10>(5)
  const [chunkStart, setChunkStart] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, GradedAttempt>>({})
  const [isGrading, setIsGrading] = useState(false)

  useEffect(() => {
    setChunkStart(0)
    setAnswers({})
    setResults({})
  }, [batchId])

  useEffect(() => {
    if (isBatchReady) prefetchNextBatch()
    // Deliberately keyed on batchId, not prefetchNextBatch's own identity:
    // prefetchNextBatch is recreated (via useCallback) whenever level/pack
    // change, which used to re-fire this effect on every pack switch even
    // though isBatchReady's value hadn't actually changed yet (still true
    // from the batch about to be replaced) — racing prefetchNextBatch's
    // stale-mid-transition pack value against usePracticeBatch's own
    // reset-and-regenerate call for the same stub queue. Keying on the
    // stable batchId means this only fires on a genuine "a batch just
    // became ready" transition. Any prefetch call that still turns out to be
    // stale by the time it resolves (a level/pack switch landed moments
    // later) is aborted by usePracticeBatch itself, not handled here.
  }, [isBatchReady, batchId])

  const chunk = useMemo(() => phrases.slice(chunkStart, chunkStart + chunkSize), [phrases, chunkStart, chunkSize])

  const allChunkAnswered = chunk.length > 0 && chunk.every((p) => answers[p.id]?.trim())

  const chunkGraded = chunk.length > 0 && chunk.every((p) => results[p.id])
  const isFinalChunk = chunkStart + chunkSize >= BATCH_SIZE
  const batchDone = isFinalChunk && chunkGraded

  useEffect(() => {
    if (batchDone && isNextBatchReady) advanceToNextBatch()
  }, [batchDone, isNextBatchReady, advanceToNextBatch])

  async function submitChunk() {
    setIsGrading(true)
    try {
      const graded = await submitAttempts({
        data: {
          subjectId,
          answers: chunk.map((p) => ({
            phraseId: p.id,
            userAnswer: answers[p.id] ?? '',
          })),
        },
      })

      setResults((prev) => {
        const next = { ...prev }
        for (const g of graded) next[g.phraseId] = g
        return next
      })
    } finally {
      setIsGrading(false)
    }
  }

  function continueToNextChunk() {
    setChunkStart((prev) => prev + chunkSize)
  }

  if (!level || !pack || !isBatchReady) {
    return (
      <p data-testid="generating-batch-message" className="text-neutral-500">
        Generating your next batch of phrases…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p data-testid="batch-progress-label" className="text-sm text-neutral-500">
            Sentence {chunkStart + 1}–{Math.min(chunkStart + chunkSize, BATCH_SIZE)} of {BATCH_SIZE}
          </p>
          <span
            data-testid="batch-pack-label"
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800"
          >
            {PACK_LABELS[phrases[0]?.pack ?? pack]}
          </span>
        </div>
        {chunkStart === 0 && (
          <div className="flex gap-1 text-sm">
            {([5, 10] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setChunkSize(size)}
                className={
                  'rounded-md px-2 py-1 ' +
                  (chunkSize === size
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
                }
              >
                Answer {size} at a time
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {chunk.map((phrase, index) => {
          const result = results[phrase.id]
          return (
            <div
              key={phrase.id}
              data-testid={`phrase-card-${index}`}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="mb-2 flex items-center justify-between">
                <p data-testid={`phrase-russian-${index}`} className="text-lg">
                  {phrase.russian}
                </p>
                <span
                  data-testid={`phrase-domain-${index}`}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800"
                >
                  {phrase.domain}
                </span>
              </div>
              <textarea
                rows={2}
                data-testid={`phrase-answer-${index}`}
                disabled={Boolean(result)}
                value={answers[phrase.id] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [phrase.id]: e.target.value }))}
                placeholder="Your English translation…"
                className="w-full resize-none rounded-md border border-neutral-300 bg-transparent p-2 text-base disabled:opacity-60 dark:border-neutral-700"
              />
              {result && (
                <div
                  data-testid={`phrase-result-${index}`}
                  data-verdict={result.verdict}
                  className={'mt-3 rounded-md border p-3 text-sm ' + VERDICT_STYLES[result.verdict]}
                >
                  <p className="font-semibold">
                    <span data-testid={`phrase-result-score-${index}`}>{result.score}</span>/10 ·{' '}
                    <span data-testid={`phrase-result-verdict-${index}`}>{VERDICT_LABELS[result.verdict]}</span>
                  </p>
                  <p className="mt-1">{result.feedback}</p>
                  {result.nativeAlternatives.length > 0 && (
                    <ul data-testid={`phrase-result-alternatives-${index}`} className="mt-1 list-inside list-disc">
                      {result.nativeAlternatives.map((alt) => (
                        <li key={alt}>{alt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!chunkGraded && (
        <button
          type="button"
          data-testid="submit-chunk-button"
          disabled={!allChunkAnswered || isGrading}
          onClick={submitChunk}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {isGrading ? 'Grading…' : 'Submit'}
        </button>
      )}

      {chunkGraded && !isFinalChunk && (
        <button
          type="button"
          data-testid="continue-chunk-button"
          onClick={continueToNextChunk}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
        >
          Continue
        </button>
      )}

      {batchDone && !isNextBatchReady && <p className="text-neutral-500">Preparing your next batch…</p>}
    </div>
  )
}
