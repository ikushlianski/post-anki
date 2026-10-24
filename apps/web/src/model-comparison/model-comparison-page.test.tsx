// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelSuggestionResult } from '@post-anki/core'
import type { ModelComparisonEstimate, ModelComparisonRunDetail, ModelComparisonRunSummary } from '@post-anki/shared'

import { MODEL_COMPARISON_SAMPLES } from './model-comparison-samples'

import {
  createModelComparisonRun,
  estimateModelComparison,
  getModelComparisonRun,
  gradeModelComparisonCard,
  gradeModelComparisonResult,
  listModelComparisonRuns,
} from './model-comparison.api'
import { getKnowledgeBitModelSuggestionForAdmin } from '../knowledge-bit/knowledge-bit-review.api'
import { ModelComparisonPage } from './model-comparison-page'

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getKnowledgeBitModelSuggestionForAdmin: vi.fn(),
}))

vi.mock('./model-comparison.api', () => ({
  createModelComparisonRun: vi.fn(),
  estimateModelComparison: vi.fn(),
  getModelComparisonRun: vi.fn(),
  gradeModelComparisonCard: vi.fn(),
  gradeModelComparisonResult: vi.fn(),
  listModelComparisonRuns: vi.fn(),
}))

const HAIKU = 'openrouter/anthropic/claude-haiku-5.5'
const RUN_ID = '5b0e7a4e-3c8d-4d4e-9d54-0d5f7f4c0a11'

const CHEAP: ModelComparisonEstimate = { perModel: [], totalEstimatedCostUsd: 0.0123, chunkCount: 1, withinCap: true }
const DEAR: ModelComparisonEstimate = { perModel: [], totalEstimatedCostUsd: 0.4, chunkCount: 2, withinCap: false }

const RUN: ModelComparisonRunDetail = {
  runId: RUN_ID,
  createdAt: '2026-10-11T12:00:00Z',
  excerpt: 'Redis хранит данные в памяти.',
  estimatedCostUsd: 0.0123,
  results: [
    {
      modelId: HAIKU,
      status: 'ok',
      ms: 4000,
      returned: 2,
      cards: [{ statement: 's', question: 'Где Redis хранит данные?', answer: 'В памяти.', kind: 'basic', quote: 'q' }],
      dropped: [],
      error: null,
      inputTokens: 2410,
      outputTokens: 930,
      actualCostUsd: 0.0007,
      estimatedCostUsd: 0.0012,
      extractionRating: 3,
      extractionNote: 'ok split',
      cardGrades: [{ cardIndex: 0, rating: 5, wordingRating: null }],
    },
  ],
}

const SESSION_WAIT = { timeout: 3000 }

beforeEach(() => {
  vi.mocked(listModelComparisonRuns).mockResolvedValue([])
  vi.mocked(estimateModelComparison).mockResolvedValue(CHEAP)
  vi.mocked(gradeModelComparisonCard).mockResolvedValue({ ok: true })
  vi.mocked(gradeModelComparisonResult).mockResolvedValue({ ok: true })
  vi.mocked(getKnowledgeBitModelSuggestionForAdmin).mockResolvedValue({
    status: 'not_enough_evidence',
    modelsReady: 0,
    modelsNeeded: 5,
    perModelProgress: [],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function fillExcerptAndPickModel(text = 'Redis хранит данные в памяти.') {
  fireEvent.change(screen.getByTestId('model-comparison-excerpt'), { target: { value: text } })
  fireEvent.click(screen.getByTestId(`model-comparison-model-${HAIKU}`))
}

describe('ModelComparisonPage', () => {
  it('should keep Run disabled and ask for a model until one is chosen', () => {
    render(<ModelComparisonPage />)
    fireEvent.change(screen.getByTestId('model-comparison-excerpt'), { target: { value: 'text' } })

    expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('model-comparison-estimate').textContent).toBe('Choose at least one model.')
  })

  it('should count characters against the excerpt cap', () => {
    render(<ModelComparisonPage />)
    fireEvent.change(screen.getByTestId('model-comparison-excerpt'), { target: { value: 'abc' } })

    expect(screen.getByTestId('model-comparison-excerpt-count').textContent).toBe('3 / 6000 characters')
  })

  it('should show the estimated cost and enable Run once a model and an excerpt exist', async () => {
    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()

    await waitFor(() => {
      expect(screen.getByTestId('model-comparison-estimate').textContent).toContain('about $0.012')
    }, SESSION_WAIT)

    expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should say over the cap and block Run when the estimate passes the cap', async () => {
    vi.mocked(estimateModelComparison).mockResolvedValue(DEAR)

    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()

    await waitFor(() => {
      expect(screen.getByTestId('model-comparison-estimate').textContent).toContain('Over the cap')
    }, SESSION_WAIT)

    expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should show progress while running and then the results with saved grades', async () => {
    let finish!: (value: { ok: true; run: ModelComparisonRunDetail }) => void

    vi.mocked(createModelComparisonRun).mockReturnValue(new Promise((resolve) => (finish = resolve)))

    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))

    await waitFor(() => expect(screen.getByTestId('model-comparison-run').textContent).toBe('Running…'))

    finish({ ok: true, run: RUN })

    await waitFor(() => expect(screen.getByTestId('model-comparison-active-run')).toBeDefined())

    expect(screen.getByText('Где Redis хранит данные?')).toBeDefined()
    expect(screen.getByTestId(`model-comparison-card-${HAIKU}-0-quality-5`).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-3`).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId(`model-comparison-usage-${HAIKU}`).textContent).toBe(
      'Actual (successful calls): 2,410 in / 930 out tokens, about $0.0007 (estimate was $0.0012)',
    )
  })

  it('should send the chosen models and excerpt when running', async () => {
    vi.mocked(createModelComparisonRun).mockResolvedValue({ ok: true, run: RUN })

    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))

    await waitFor(() => {
      expect(createModelComparisonRun).toHaveBeenCalledWith({
        data: { excerpt: 'Redis хранит данные в памяти.', modelIds: [HAIKU] },
      })
    })
  })

  it('should show an error and keep the form when the run fails', async () => {
    vi.mocked(createModelComparisonRun).mockResolvedValue({ ok: false, error: 'failed' })

    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))

    await waitFor(() => expect(screen.getByTestId('model-comparison-error').textContent).toContain('failed'))

    expect((screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement).value).toBe('Redis хранит данные в памяти.')
  })

  it('should save a card grade on the server as soon as it is chosen', async () => {
    vi.mocked(getModelComparisonRun).mockResolvedValue(RUN)
    vi.mocked(listModelComparisonRuns).mockResolvedValue([
      { runId: RUN_ID, createdAt: RUN.createdAt, modelIds: [HAIKU], excerptPreview: 'Redis' },
    ])

    render(<ModelComparisonPage initialRuns={[{ runId: RUN_ID, createdAt: RUN.createdAt, modelIds: [HAIKU], excerptPreview: 'Redis' }]} />)
    fireEvent.click(screen.getByTestId(`model-comparison-run-${RUN_ID}`))

    await waitFor(() => expect(screen.getByTestId('model-comparison-active-run')).toBeDefined())
    fireEvent.click(screen.getByTestId(`model-comparison-card-${HAIKU}-0-wording-2`))

    await waitFor(() => {
      expect(gradeModelComparisonCard).toHaveBeenCalledWith({
        data: { runId: RUN_ID, modelId: HAIKU, cardIndex: 0, wordingRating: 2 },
      })
    })
  })

  it('should show an error and keep the grade selected when saving a grade fails', async () => {
    vi.mocked(getModelComparisonRun).mockResolvedValue(RUN)
    vi.mocked(gradeModelComparisonResult).mockRejectedValue(new Error('network'))

    render(<ModelComparisonPage initialRuns={[{ runId: RUN_ID, createdAt: RUN.createdAt, modelIds: [HAIKU], excerptPreview: 'Redis' }]} />)
    fireEvent.click(screen.getByTestId(`model-comparison-run-${RUN_ID}`))

    await waitFor(() => expect(screen.getByTestId('model-comparison-active-run')).toBeDefined())
    fireEvent.click(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-5`))

    await waitFor(() => {
      expect(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-status`).textContent).toContain('Could not save')
    })

    expect(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-5`).getAttribute('aria-pressed')).toBe('true')
  })

  it('should offer ready samples and fill the excerpt only when one is chosen', () => {
    render(<ModelComparisonPage />)

    const textarea = screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement

    expect(textarea.value).toBe('')
    expect(screen.getAllByRole('option').filter((option) => option.textContent?.includes('characters'))).toHaveLength(
      MODEL_COMPARISON_SAMPLES.length,
    )

    fireEvent.change(screen.getByTestId('model-comparison-sample'), { target: { value: 'ru-sales' } })

    expect(textarea.value).toBe(MODEL_COMPARISON_SAMPLES[0]!.text)
    expect(screen.getByTestId('model-comparison-excerpt-count').textContent).toBe(
      `${MODEL_COMPARISON_SAMPLES[0]!.text.length} / 6000 characters`,
    )
  })

  it('should keep every sample inside the excerpt cap', () => {
    expect(MODEL_COMPARISON_SAMPLES.every((sample) => sample.text.length > 0 && sample.text.length <= 6000)).toBe(true)
  })

  it('should run the same excerpt and models again as a new run from the results view', async () => {
    const second: ModelComparisonRunDetail = {
      ...RUN,
      runId: '7c1f8b5f-4d9e-4e5f-8e65-1e6a8a5d1b22',
      results: RUN.results.map((result) => ({ ...result, extractionRating: null, extractionNote: null, cardGrades: [] })),
    }

    vi.mocked(createModelComparisonRun).mockResolvedValueOnce({ ok: true, run: RUN }).mockResolvedValueOnce({ ok: true, run: second })
    vi.mocked(getModelComparisonRun).mockResolvedValue(RUN)

    render(<ModelComparisonPage />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))
    await screen.findByTestId('model-comparison-active-run', undefined, SESSION_WAIT)

    fireEvent.click(screen.getByTestId('model-comparison-run-again'))

    await waitFor(() => {
      expect(createModelComparisonRun).toHaveBeenLastCalledWith({ data: { excerpt: RUN.excerpt, modelIds: [HAIKU] } })
    }, SESSION_WAIT)
    await waitFor(() => {
      expect(screen.queryByTestId(`model-comparison-extraction-${HAIKU}-rating-3`)?.getAttribute('aria-pressed')).toBe('false')
    }, SESSION_WAIT)
  })

  it('should repeat an earlier comparison from the list and block repeating while a run is in progress', async () => {
    const earlier: ModelComparisonRunSummary = {
      runId: RUN_ID,
      createdAt: '2026-10-11T12:00:00Z',
      modelIds: [HAIKU],
      excerptPreview: 'Redis хранит',
    }
    let finish!: (value: { ok: true; run: ModelComparisonRunDetail }) => void

    vi.mocked(listModelComparisonRuns).mockResolvedValue([earlier])
    vi.mocked(getModelComparisonRun).mockResolvedValue(RUN)
    vi.mocked(createModelComparisonRun).mockReturnValue(new Promise((resolve) => (finish = resolve)))

    render(<ModelComparisonPage initialRuns={[earlier]} />)
    fireEvent.click(screen.getByTestId(`model-comparison-repeat-${RUN_ID}`))

    await waitFor(() => {
      expect(createModelComparisonRun).toHaveBeenCalledWith({ data: { excerpt: RUN.excerpt, modelIds: [HAIKU] } })
    }, SESSION_WAIT)
    expect((screen.getByTestId(`model-comparison-repeat-${RUN_ID}`) as HTMLButtonElement).disabled).toBe(true)

    finish({ ok: true, run: RUN })

    await waitFor(() => {
      expect((screen.getByTestId(`model-comparison-repeat-${RUN_ID}`) as HTMLButtonElement).disabled).toBe(false)
    }, SESSION_WAIT)
  })

  it('should show a repeat failure without losing the form', async () => {
    const earlier: ModelComparisonRunSummary = {
      runId: RUN_ID,
      createdAt: '2026-10-11T12:00:00Z',
      modelIds: [HAIKU],
      excerptPreview: 'Redis хранит',
    }

    vi.mocked(listModelComparisonRuns).mockResolvedValue([earlier])
    vi.mocked(getModelComparisonRun).mockRejectedValue(new Error('gone'))

    render(<ModelComparisonPage initialRuns={[earlier]} />)
    fireEvent.change(screen.getByTestId('model-comparison-excerpt'), { target: { value: 'my text' } })
    fireEvent.click(screen.getByTestId(`model-comparison-repeat-${RUN_ID}`))

    await waitFor(() => {
      expect(screen.getByTestId('model-comparison-error').textContent).toBe('Could not repeat that comparison.')
    }, SESSION_WAIT)

    expect((screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement).value).toBe('my text')
  })

  it('should show how far the grades are from a default-model suggestion, without a Use as default action', () => {
    const suggestion: ModelSuggestionResult = {
      status: 'not_enough_evidence',
      modelsReady: 3,
      modelsNeeded: 5,
      perModelProgress: [{ modelId: HAIKU, gradedRuns: 1, remainingRuns: 2 }],
    }

    render(<ModelComparisonPage suggestion={suggestion} />)

    expect(screen.getByTestId('model-suggestion-summary').textContent).toContain('3 of 5 models have 3 graded runs')
    expect(screen.queryByTestId('model-suggestion-use')).toBeNull()
  })

  it('should show the suggested model without a Use as default action once evidence exists', () => {
    const suggestion: ModelSuggestionResult = {
      status: 'suggestion',
      modelId: HAIKU,
      score: 4.3,
      basis: { gradedRuns: 18, models: 5 },
    }

    render(<ModelComparisonPage suggestion={suggestion} />)

    expect(screen.getByTestId('model-suggestion-summary').textContent).toContain('Suggested default: Claude Haiku 5.5')
    expect(screen.queryByTestId('model-suggestion-use')).toBeNull()
  })

  it('should start only one comparison when Run again is clicked twice quickly', async () => {
    const earlier: ModelComparisonRunSummary = {
      runId: RUN_ID,
      createdAt: '2026-10-11T12:00:00Z',
      modelIds: [HAIKU],
      excerptPreview: 'Redis хранит',
    }
    let finishFetch!: (value: ModelComparisonRunDetail) => void

    vi.mocked(listModelComparisonRuns).mockResolvedValue([earlier])
    vi.mocked(getModelComparisonRun).mockReturnValue(new Promise((resolve) => (finishFetch = resolve)))
    vi.mocked(createModelComparisonRun).mockResolvedValue({ ok: true, run: RUN })

    render(<ModelComparisonPage initialRuns={[earlier]} />)

    const button = screen.getByTestId(`model-comparison-repeat-${RUN_ID}`)

    fireEvent.click(button)
    fireEvent.click(button)
    finishFetch(RUN)

    await waitFor(() => expect(createModelComparisonRun).toHaveBeenCalledTimes(1), SESSION_WAIT)
    expect(getModelComparisonRun).toHaveBeenCalledTimes(1)
  })

  it('should refresh the progress line right after a grade is saved', async () => {
    const before: ModelSuggestionResult = { status: 'not_enough_evidence', modelsReady: 0, modelsNeeded: 5, perModelProgress: [] }
    const after: ModelSuggestionResult = { status: 'not_enough_evidence', modelsReady: 1, modelsNeeded: 5, perModelProgress: [] }

    vi.mocked(getModelComparisonRun).mockResolvedValue(RUN)
    vi.mocked(createModelComparisonRun).mockResolvedValue({ ok: true, run: RUN })
    vi.mocked(getKnowledgeBitModelSuggestionForAdmin).mockResolvedValue(after)

    render(<ModelComparisonPage suggestion={before} />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))
    await screen.findByTestId('model-comparison-active-run', undefined, SESSION_WAIT)

    expect(screen.getByTestId('model-suggestion-summary').textContent).toContain('0 of 5 models')

    fireEvent.click(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-5`))

    await waitFor(() => {
      expect(screen.getByTestId('model-suggestion-summary').textContent).toContain('1 of 5 models')
    }, SESSION_WAIT)
  })

  it('should keep the old progress line when refreshing it fails', async () => {
    const before: ModelSuggestionResult = { status: 'not_enough_evidence', modelsReady: 2, modelsNeeded: 5, perModelProgress: [] }

    vi.mocked(createModelComparisonRun).mockResolvedValue({ ok: true, run: RUN })
    vi.mocked(getKnowledgeBitModelSuggestionForAdmin).mockRejectedValue(new Error('down'))

    render(<ModelComparisonPage suggestion={before} />)
    fillExcerptAndPickModel()
    await waitFor(() => expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(false), SESSION_WAIT)
    fireEvent.click(screen.getByTestId('model-comparison-run'))
    await screen.findByTestId('model-comparison-active-run', undefined, SESSION_WAIT)
    fireEvent.click(screen.getByTestId(`model-comparison-extraction-${HAIKU}-rating-5`))

    await waitFor(() => expect(getKnowledgeBitModelSuggestionForAdmin).toHaveBeenCalled(), SESSION_WAIT)
    expect(screen.getByTestId('model-suggestion-summary').textContent).toContain('2 of 5 models')
  })
})
