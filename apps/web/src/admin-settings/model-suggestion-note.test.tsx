// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ModelSuggestionResult } from '@post-anki/core'

import { ModelSuggestionNote } from './model-suggestion-note'

afterEach(() => cleanup())

const NOT_ENOUGH: ModelSuggestionResult = {
  status: 'not_enough_evidence',
  modelsReady: 3,
  modelsNeeded: 5,
  perModelProgress: [
    { modelId: 'openrouter/openai/gpt-6-luna', gradedRuns: 3, remainingRuns: 0 },
    { modelId: 'openrouter/anthropic/claude-haiku-5.5', gradedRuns: 1, remainingRuns: 2 },
  ],
}

const SUGGESTION: ModelSuggestionResult = {
  status: 'suggestion',
  modelId: 'openrouter/anthropic/claude-haiku-5.5',
  score: 4.34,
  basis: { gradedRuns: 18, models: 5 },
}

describe('ModelSuggestionNote', () => {
  it('should show nothing when the suggestion could not be loaded', () => {
    const { container } = render(
      <ModelSuggestionNote suggestion={null} currentModelId="openrouter/openai/gpt-6-luna" onUse={vi.fn()} />,
    )

    expect(container.textContent).toBe('')
  })

  it('should say quietly how many models already have enough graded runs', () => {
    render(
      <ModelSuggestionNote suggestion={NOT_ENOUGH} currentModelId="openrouter/openai/gpt-6-luna" onUse={vi.fn()} />,
    )

    expect(screen.getByTestId('model-suggestion-summary').textContent).toBe(
      'Not enough grades yet: 3 of 5 models have 3 graded runs.',
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should list per model how many more graded runs are needed', () => {
    render(
      <ModelSuggestionNote suggestion={NOT_ENOUGH} currentModelId="openrouter/openai/gpt-6-luna" onUse={vi.fn()} />,
    )

    const list = screen.getByTestId('model-suggestion-progress').textContent

    expect(list).toContain('GPT-6 Luna: 3 of 3 graded runs')
    expect(list).toContain('Claude Haiku 5.5: 1 of 3 graded runs (needs 2 more graded runs)')
  })

  it('should keep the per-model progress collapsed behind a summary', () => {
    render(
      <ModelSuggestionNote suggestion={NOT_ENOUGH} currentModelId="openrouter/openai/gpt-6-luna" onUse={vi.fn()} />,
    )

    expect(screen.getByText('Progress per model').closest('details')!.open).toBe(false)
  })

  it('should not show a progress list when no model has any graded run', () => {
    render(
      <ModelSuggestionNote
        suggestion={{ ...NOT_ENOUGH, modelsReady: 0, perModelProgress: [] }}
        currentModelId="openrouter/openai/gpt-6-luna"
        onUse={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('model-suggestion-progress')).toBeNull()
  })

  it('should show the suggested default with its score and what it is based on', () => {
    render(
      <ModelSuggestionNote suggestion={SUGGESTION} currentModelId="openrouter/openai/gpt-6-luna" onUse={vi.fn()} />,
    )

    expect(screen.getByTestId('model-suggestion-summary').textContent).toBe(
      'Suggested default: Claude Haiku 5.5 (score 4.3, based on 18 graded runs across 5 models)',
    )
  })

  it('should switch the default only when the button is pressed', () => {
    const onUse = vi.fn()

    render(<ModelSuggestionNote suggestion={SUGGESTION} currentModelId="openrouter/openai/gpt-6-luna" onUse={onUse} />)

    expect(onUse).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('model-suggestion-use'))

    expect(onUse).toHaveBeenCalledWith('openrouter/anthropic/claude-haiku-5.5')
  })

  it('should say the suggestion is already the default instead of offering the button', () => {
    render(
      <ModelSuggestionNote suggestion={SUGGESTION} currentModelId="openrouter/anthropic/claude-haiku-5.5" onUse={vi.fn()} />,
    )

    const button = screen.getByTestId('model-suggestion-use') as HTMLButtonElement

    expect(button.textContent).toBe('Already the default')
    expect(button.disabled).toBe(true)
  })

  it('should not offer to use a model that is no longer on the list', () => {
    render(
      <ModelSuggestionNote
        suggestion={{ ...SUGGESTION, modelId: 'some/removed-model' }}
        currentModelId="openrouter/openai/gpt-6-luna"
        onUse={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('model-suggestion-use')).toBeNull()
  })
})
