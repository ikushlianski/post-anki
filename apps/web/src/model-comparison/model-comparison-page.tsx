import { useCallback, useEffect, useState } from 'react'
import type { ModelSuggestionResult } from '@post-anki/core'
import {
  MODEL_COMPARISON_MAX_ESTIMATED_COST_USD,
  MODEL_COMPARISON_MAX_EXCERPT_CHARS,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
  type ModelComparisonRunDetail,
  type ModelComparisonRunSummary,
} from '@post-anki/shared'

import {
  createModelComparisonRun,
  estimateModelComparison,
  getModelComparisonRun,
  gradeModelComparisonCard,
  getSourceTextForComparison,
  gradeModelComparisonResult,
  listModelComparisonRuns,
} from './model-comparison.api'
import { ModelComparisonCardGrades } from './model-comparison-card-grades'
import { ModelComparisonExtractionGrade } from './model-comparison-extraction-grade'
import { ModelComparisonPicker } from './model-comparison-picker'
import { ModelComparisonResults } from './model-comparison-results'
import { ModelComparisonRunsList } from './model-comparison-runs-list'
import { ModelComparisonSamplesPicker } from './model-comparison-samples-picker'
import { ModelSuggestionNote } from '../admin-settings/model-suggestion-note'
import { getKnowledgeBitModelSuggestionForAdmin } from '../knowledge-bit/knowledge-bit-review.api'
import { shortenExcerpt } from './shorten-excerpt'
import { useModelComparisonEstimate } from './use-model-comparison-estimate'

function formatUsd(value: number): string {
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`
}

export function ModelComparisonPage({
  initialRuns = [],
  suggestion: initialSuggestion = null,
  sourceId,
}: {
  initialRuns?: ModelComparisonRunSummary[]
  suggestion?: ModelSuggestionResult | null
  sourceId?: string
}) {
  const [excerpt, setExcerpt] = useState('')
  const [sourceState, setSourceState] = useState<'idle' | 'loading' | 'failed'>(sourceId ? 'loading' : 'idle')
  const [shortened, setShortened] = useState(false)
  const [selected, setSelected] = useState<KnowledgeItemModelId[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<ModelComparisonRunDetail | null>(null)
  const [runs, setRuns] = useState<ModelComparisonRunSummary[]>(initialRuns)
  const [suggestion, setSuggestion] = useState<ModelSuggestionResult | null>(initialSuggestion)
  const { estimate, failed: estimateFailed } = useModelComparisonEstimate(excerpt, selected, (input) =>
    estimateModelComparison({ data: input }),
  )

  const overCap = estimate !== null && !estimate.withinCap
  const tooLong = excerpt.length > MODEL_COMPARISON_MAX_EXCERPT_CHARS
  const canRun =
    !running && selected.length > 0 && excerpt.trim().length > 0 && !tooLong && !overCap

  const refreshRuns = useCallback(async () => {
    setRuns(await listModelComparisonRuns())
  }, [])

  useEffect(() => {
    void refreshRuns().catch(() => undefined)
  }, [refreshRuns])

  useEffect(() => {
    if (!sourceId) {
      return
    }

    let active = true

    setSourceState('loading')
    getSourceTextForComparison({ data: { sourceId } })
      .then(({ text }) => {
        if (!active) {
          return
        }

        const fitted = shortenExcerpt(text, MODEL_COMPARISON_MAX_EXCERPT_CHARS)

        setExcerpt((current) => (current.length === 0 ? fitted.text : current))
        setShortened(fitted.shortened)
        setSourceState('idle')
      })
      .catch(() => {
        if (active) {
          setSourceState('failed')
        }
      })

    return () => {
      active = false
    }
  }, [sourceId])

  async function runComparison(excerptText: string, modelIds: KnowledgeItemModelId[]) {
    setRunning(true)
    setError(null)

    const outcome = await createModelComparisonRun({ data: { excerpt: excerptText, modelIds } }).catch(() => ({
      ok: false as const,
      error: 'failed' as const,
    }))

    setRunning(false)

    if (!outcome.ok) {
      setError(
        outcome.error === 'over_cost_cap'
          ? 'This run would cost more than the cap.'
          : 'The comparison failed. Try again.',
      )

      return
    }

    setRun(outcome.run)
    await refreshRuns().catch(() => undefined)
  }

  async function startRun() {
    await runComparison(excerpt.trim(), selected)
  }

  async function repeatRun(runId: string) {
    if (running) {
      return
    }

    setRunning(true)
    setError(null)

    try {
      const earlier = await getModelComparisonRun({ data: { runId } })

      await runComparison(
        earlier.excerpt,
        earlier.results.map((result) => knowledgeItemModelIdSchema.parse(result.modelId)),
      )
    } catch {
      setRunning(false)
      setError('Could not repeat that comparison.')
    }
  }

  async function openRun(runId: string) {
    setError(null)

    try {
      setRun(await getModelComparisonRun({ data: { runId } }))
    } catch {
      setError('Could not open that comparison.')
    }
  }

  async function save(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action()
      void getKnowledgeBitModelSuggestionForAdmin()
        .then(setSuggestion)
        .catch(() => undefined)

      return true
    } catch {
      return false
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Compare models</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Run one excerpt through several extraction models and grade what comes back. Nothing here becomes a real
          suggestion or card.
        </p>
      </header>

      <section className="space-y-4">
        <ModelSuggestionNote suggestion={suggestion} />

        <div className="space-y-1">
          <label htmlFor="comparison-excerpt" className="text-sm font-medium text-neutral-800">
            Excerpt
          </label>
          <textarea
            id="comparison-excerpt"
            data-testid="model-comparison-excerpt"
            value={excerpt}
            rows={6}
            disabled={running}
            onChange={(event) => {
              setShortened(false)
              setExcerpt(event.target.value)
            }}
            className="w-full rounded-md bg-neutral-100/70 px-3 py-2 text-sm leading-relaxed text-neutral-900 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300"
          />
          {sourceState === 'loading' ? (
            <p data-testid="model-comparison-source-loading" className="text-xs text-neutral-500">
              Loading the source text…
            </p>
          ) : null}
          {sourceState === 'failed' ? (
            <p role="alert" data-testid="model-comparison-source-error" className="text-xs text-red-600">
              Could not load the source text. You can paste it here instead.
            </p>
          ) : null}
          {shortened ? (
            <p data-testid="model-comparison-source-shortened" className="text-xs text-neutral-500">
              Text shortened to fit the {MODEL_COMPARISON_MAX_EXCERPT_CHARS} character limit.
            </p>
          ) : null}
          <ModelComparisonSamplesPicker
            onPick={(sample) => {
              setShortened(false)
              setExcerpt(sample)
            }}
            disabled={running}
          />
          <p
            data-testid="model-comparison-excerpt-count"
            className={`text-xs ${tooLong ? 'text-red-600' : 'text-neutral-500'}`}
          >
            {excerpt.length} / {MODEL_COMPARISON_MAX_EXCERPT_CHARS} characters
          </p>
        </div>

        <ModelComparisonPicker selected={selected} onChange={setSelected} disabled={running} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="model-comparison-run"
            disabled={!canRun}
            onClick={() => void startRun()}
            className="inline-flex min-h-[44px] items-center rounded-md bg-neutral-900 px-4 sm:min-h-8 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run comparison'}
          </button>
          <p data-testid="model-comparison-estimate" className={`text-sm ${overCap ? 'text-red-600' : 'text-neutral-600'}`}>
            {selected.length === 0
              ? 'Choose at least one model.'
              : estimateFailed
                ? 'Could not estimate the cost.'
                : estimate === null
                  ? 'Estimating the cost…'
                  : overCap
                    ? `Over the cap: about ${formatUsd(estimate.totalEstimatedCostUsd)} against ${formatUsd(MODEL_COMPARISON_MAX_ESTIMATED_COST_USD)}. Choose fewer models or a shorter excerpt.`
                    : `Estimated cost about ${formatUsd(estimate.totalEstimatedCostUsd)} for ${selected.length} model${selected.length === 1 ? '' : 's'}.`}
          </p>
        </div>

        {error ? (
          <p role="alert" data-testid="model-comparison-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {run ? (
        <section className="space-y-3" data-testid="model-comparison-active-run">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Results</h2>
            <button
              type="button"
              data-testid="model-comparison-run-again"
              disabled={running}
              onClick={() => void repeatRun(run.runId)}
              className="min-h-[44px] rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {running ? 'Running…' : 'Run again'}
            </button>
          </div>
          <ModelComparisonResults
            key={run.runId}
            results={run.results}
            renderCardExtras={(modelId, index) => (
              <ModelComparisonCardGrades
                key={`${run.runId}-${modelId}-${index}`}
                modelId={modelId}
                cardIndex={index}
                initial={run.results.find((result) => result.modelId === modelId)?.cardGrades.find((grade) => grade.cardIndex === index)}
                save={(patch) =>
                  save(() => gradeModelComparisonCard({ data: { runId: run.runId, modelId: knowledgeItemModelIdSchema.parse(modelId), cardIndex: index, ...patch } }))
                }
              />
            )}
            renderModelExtras={(modelId) => {
              const result = run.results.find((entry) => entry.modelId === modelId)

              return result?.status === 'ok' ? (
                <ModelComparisonExtractionGrade
                  key={`${run.runId}-${modelId}`}
                  modelId={modelId}
                  initialRating={result.extractionRating}
                  initialNote={result.extractionNote}
                  saveRating={(extractionRating) =>
                    save(() => gradeModelComparisonResult({ data: { runId: run.runId, modelId: knowledgeItemModelIdSchema.parse(modelId), extractionRating } }))
                  }
                  saveNote={(note) =>
                    save(() => gradeModelComparisonResult({ data: { runId: run.runId, modelId: knowledgeItemModelIdSchema.parse(modelId), note } }))
                  }
                />
              ) : null
            }}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Earlier comparisons</h2>
        <ModelComparisonRunsList
          runs={runs}
          activeRunId={run?.runId ?? null}
          onOpen={(runId) => void openRun(runId)}
          onRepeat={(runId) => void repeatRun(runId)}
          repeatDisabled={running}
        />
      </section>
    </main>
  )
}
