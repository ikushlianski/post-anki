import { describe, expect, it } from 'vitest'

import { suggestedModelId } from './use-model-suggestion'

describe('suggestedModelId', () => {
  it('should return the suggested model when there is enough evidence', () => {
    expect(
      suggestedModelId({
        status: 'suggestion',
        modelId: 'openrouter/openai/gpt-6-luna',
        score: 4.2,
        basis: { gradedRuns: 15, models: 5 },
      }),
    ).toBe('openrouter/openai/gpt-6-luna')
  })

  it('should suggest nothing while there is not enough evidence', () => {
    expect(
      suggestedModelId({ status: 'not_enough_evidence', modelsReady: 4, modelsNeeded: 5, perModelProgress: [] }),
    ).toBeNull()
  })

  it('should suggest nothing when the suggestion has not loaded', () => {
    expect(suggestedModelId(null)).toBeNull()
  })

  it('should never suggest a model that is not on the list', () => {
    expect(
      suggestedModelId({ status: 'suggestion', modelId: 'some/removed-model', score: 5, basis: { gradedRuns: 15, models: 5 } }),
    ).toBeNull()
  })
})
