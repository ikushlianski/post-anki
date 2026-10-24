// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelComparisonModelResult } from '@post-anki/shared'

import { ModelComparisonResults, describeActualUsage } from './model-comparison-results'

const OK: ModelComparisonModelResult = {
  modelId: 'openrouter/anthropic/claude-haiku-5.5',
  status: 'ok',
  ms: 9400,
  returned: 3,
  cards: [{ statement: 's', question: 'Где Redis хранит данные?', answer: 'В памяти.', kind: 'basic', quote: 'q' }],
  dropped: ['bad_card', 'wrong_language'],
  error: null,
  inputTokens: 2410,
  outputTokens: 930,
  actualCostUsd: 0.0007,
}

const FAILED: ModelComparisonModelResult = {
  modelId: 'openrouter/openai/gpt-oss-120b',
  status: 'failed',
  ms: 0,
  returned: 0,
  cards: [],
  dropped: [],
  error: 'provider timeout',
  inputTokens: null,
  outputTokens: null,
  actualCostUsd: null,
}

afterEach(cleanup)

describe('ModelComparisonResults', () => {
  it('should show each model with its price, kept cards and time side by side', () => {
    render(<ModelComparisonResults results={[OK, FAILED]} />)

    expect(screen.getByText('Claude Haiku 5.5')).toBeDefined()
    expect(screen.getByText(/1 of 3 cards kept/)).toBeDefined()
    expect(screen.getByText('Где Redis хранит данные?')).toBeDefined()
    expect(screen.getAllByText(/per 1M/).length).toBe(2)
  })

  it('should say which checks dropped cards and show a failed model without hiding the others', () => {
    render(<ModelComparisonResults results={[OK, FAILED]} />)

    expect(screen.getByText('Dropped by checks: bad_card, wrong_language')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toBe('provider timeout')
  })

  it('should let the page add grade controls under each card and model', () => {
    render(
      <ModelComparisonResults
        results={[OK]}
        renderCardExtras={(modelId, index) => <span>card grade {modelId} {index}</span>}
        renderModelExtras={(modelId) => <span>model grade {modelId}</span>}
      />,
    )

    expect(screen.getByText(/card grade openrouter\/anthropic\/claude-haiku-5.5 0/)).toBeDefined()
    expect(screen.getByText(/model grade openrouter\/anthropic\/claude-haiku-5.5/)).toBeDefined()
  })

  it('should show the actual tokens and cost next to the saved estimate', () => {
    render(<ModelComparisonResults results={[{ ...OK, estimatedCostUsd: 0.0012 }]} />)

    expect(screen.getByTestId('model-comparison-usage-openrouter/anthropic/claude-haiku-5.5').textContent).toBe(
      'Actual (successful calls): 2,410 in / 930 out tokens, about $0.0007 (estimate was $0.0012)',
    )
  })

  it('should leave out the estimate clause when the run has no saved estimate', () => {
    expect(describeActualUsage(OK)).toBe('Actual (successful calls): 2,410 in / 930 out tokens, about $0.0007')
  })

  it('should say usage was not reported instead of inventing numbers', () => {
    render(<ModelComparisonResults results={[{ ...OK, inputTokens: null, outputTokens: null, actualCostUsd: null }]} />)

    expect(screen.getByTestId('model-comparison-usage-openrouter/anthropic/claude-haiku-5.5').textContent).toBe(
      'usage not reported',
    )
  })

  it('should not show a usage line for a model that failed', () => {
    render(<ModelComparisonResults results={[FAILED]} />)

    expect(screen.queryByTestId('model-comparison-usage-openrouter/openai/gpt-oss-120b')).toBeNull()
  })
})
