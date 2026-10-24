// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelComparisonCardGrades } from './model-comparison-card-grades'

afterEach(cleanup)

const ID = 'openrouter/anthropic/claude-haiku-5.5'

describe('ModelComparisonCardGrades', () => {
  it('should save card quality and question wording as separate grades', async () => {
    const save = vi.fn().mockResolvedValue(true)

    render(<ModelComparisonCardGrades modelId={ID} cardIndex={2} initial={undefined} save={save} />)
    fireEvent.click(screen.getByTestId(`model-comparison-card-${ID}-2-quality-4`))

    await waitFor(() => expect(save).toHaveBeenCalledWith({ rating: 4 }))

    fireEvent.click(screen.getByTestId(`model-comparison-card-${ID}-2-wording-2`))

    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ wordingRating: 2 }))
  })

  it('should show grades that were saved earlier', () => {
    render(
      <ModelComparisonCardGrades
        modelId={ID}
        cardIndex={0}
        initial={{ cardIndex: 0, rating: 5, wordingRating: 3 }}
        save={vi.fn()}
      />,
    )

    expect(screen.getByTestId(`model-comparison-card-${ID}-0-quality-5`).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId(`model-comparison-card-${ID}-0-wording-3`).getAttribute('aria-pressed')).toBe('true')
  })
})
