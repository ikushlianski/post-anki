// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_COMPARISON_MAX_EXCERPT_CHARS } from '@post-anki/shared'

import {
  createModelComparisonRun,
  estimateModelComparison,
  getSourceTextForComparison,
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
  getSourceTextForComparison: vi.fn(),
  gradeModelComparisonCard: vi.fn(),
  gradeModelComparisonResult: vi.fn(),
  listModelComparisonRuns: vi.fn(),
}))

const SESSION_WAIT = { timeout: 3000 }

beforeEach(() => {
  vi.mocked(listModelComparisonRuns).mockResolvedValue([])
  vi.mocked(estimateModelComparison).mockResolvedValue({
    perModel: [],
    totalEstimatedCostUsd: 0.001,
    chunkCount: 1,
    withinCap: true,
  })
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

describe('ModelComparisonPage with a source id', () => {
  it('should fill the excerpt with the source text and never start a run by itself', async () => {
    vi.mocked(getSourceTextForComparison).mockResolvedValue({ text: 'Redis хранит данные в памяти.' })

    render(<ModelComparisonPage sourceId="ksrc_1" />)

    await waitFor(() => {
      expect((screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement).value).toBe(
        'Redis хранит данные в памяти.',
      )
    }, SESSION_WAIT)

    expect(getSourceTextForComparison).toHaveBeenCalledWith({ data: { sourceId: 'ksrc_1' } })
    expect(createModelComparisonRun).not.toHaveBeenCalled()
    expect(screen.queryByTestId('model-comparison-source-shortened')).toBeNull()
  })

  it('should leave every model unchecked after the source text loads', async () => {
    vi.mocked(getSourceTextForComparison).mockResolvedValue({ text: 'Короткий текст.' })

    render(<ModelComparisonPage sourceId="ksrc_1" />)

    await waitFor(() => {
      expect((screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement).value).toBe('Короткий текст.')
    }, SESSION_WAIT)

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]

    expect(boxes.every((box) => !box.checked)).toBe(true)
    expect((screen.getByTestId('model-comparison-run') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should say the text was shortened when the source is longer than the limit', async () => {
    const paragraph = 'а'.repeat(2500)
    const long = [paragraph, paragraph, paragraph, paragraph].join('\n\n')

    vi.mocked(getSourceTextForComparison).mockResolvedValue({ text: long })

    render(<ModelComparisonPage sourceId="ksrc_long" />)

    const note = await screen.findByTestId('model-comparison-source-shortened', undefined, SESSION_WAIT)

    expect(note.textContent).toBe(`Text shortened to fit the ${MODEL_COMPARISON_MAX_EXCERPT_CHARS} character limit.`)
    expect((screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement).value.length).toBeLessThanOrEqual(
      MODEL_COMPARISON_MAX_EXCERPT_CHARS,
    )
  })

  it('should show an error and keep the textarea editable and empty when the source cannot be loaded', async () => {
    vi.mocked(getSourceTextForComparison).mockRejectedValue(new Error('not_found'))

    render(<ModelComparisonPage sourceId="ksrc_gone" />)

    const error = await screen.findByTestId('model-comparison-source-error', undefined, SESSION_WAIT)
    const textarea = screen.getByTestId('model-comparison-excerpt') as HTMLTextAreaElement

    expect(error.textContent).toContain('Could not load the source text')
    expect(textarea.value).toBe('')

    fireEvent.change(textarea, { target: { value: 'Свой текст.' } })

    expect(textarea.value).toBe('Свой текст.')
  })

  it('should not ask for any source text when the page is opened without a source id', async () => {
    render(<ModelComparisonPage />)

    await waitFor(() => {
      expect(listModelComparisonRuns).toHaveBeenCalled()
    }, SESSION_WAIT)

    expect(getSourceTextForComparison).not.toHaveBeenCalled()
  })
})
