// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelComparisonExtractionGrade } from './model-comparison-extraction-grade'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ID = 'openrouter/openai/gpt-6-luna'

describe('ModelComparisonExtractionGrade', () => {
  it('should save the split grade when one is chosen', async () => {
    const saveRating = vi.fn().mockResolvedValue(true)

    render(
      <ModelComparisonExtractionGrade modelId={ID} initialRating={null} initialNote={null} saveRating={saveRating} saveNote={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId(`model-comparison-extraction-${ID}-rating-3`))

    await waitFor(() => expect(saveRating).toHaveBeenCalledWith(3))
  })

  it('should save the note on its own once typing has paused', async () => {
    vi.useFakeTimers()

    const saveNote = vi.fn().mockResolvedValue(true)

    render(
      <ModelComparisonExtractionGrade modelId={ID} initialRating={4} initialNote={null} saveRating={vi.fn()} saveNote={saveNote} />,
    )

    fireEvent.change(screen.getByTestId(`model-comparison-extraction-${ID}-note`), {
      target: { value: 'missed the hedge' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(saveNote).toHaveBeenCalledWith('missed the hedge')
  })

  it('should open with the saved note and grade', () => {
    render(
      <ModelComparisonExtractionGrade modelId={ID} initialRating={2} initialNote="too coarse" saveRating={vi.fn()} saveNote={vi.fn()} />,
    )

    expect((screen.getByTestId(`model-comparison-extraction-${ID}-note`) as HTMLTextAreaElement).value).toBe('too coarse')
    expect(screen.getByTestId(`model-comparison-extraction-${ID}-rating-2`).getAttribute('aria-pressed')).toBe('true')
  })
})
