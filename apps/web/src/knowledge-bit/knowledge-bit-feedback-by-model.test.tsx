// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import {
  KnowledgeBitFeedbackByModel,
  formatRejectRate,
  modelLabel,
} from './knowledge-bit-feedback-by-model'

afterEach(() => cleanup())

describe('formatRejectRate', () => {
  it('should show the share of rejected suggestions as a whole percent', () => {
    expect(formatRejectRate({ approved: 3, rejected: 1 })).toBe('25%')
  })

  it('should show a dash when nothing was reviewed yet', () => {
    expect(formatRejectRate({ approved: 0, rejected: 0 })).toBe('-')
  })
})

describe('modelLabel', () => {
  it('should use the friendly name of a model on the list and the raw id otherwise', () => {
    expect(modelLabel('openrouter/anthropic/claude-haiku-5.5')).toBe('Claude Haiku 5.5')
    expect(modelLabel('some/removed-model')).toBe('some/removed-model')
  })
})

describe('KnowledgeBitFeedbackByModel', () => {
  it('should say so when no suggestion was reviewed yet', () => {
    render(<KnowledgeBitFeedbackByModel data={{ models: [] }} />)

    expect(screen.getByTestId('feedback-by-model-empty')).toBeDefined()
  })

  it('should compare models by approved, rejected, reject rate and the top reasons', () => {
    render(
      <KnowledgeBitFeedbackByModel
        data={{
          models: [
            {
              modelId: 'openrouter/anthropic/claude-haiku-5.5',
              approved: 6,
              rejected: 2,
              topReasons: [
                { reasonCode: 'meta_wording', count: 2 },
                { reasonCode: 'unspecified', count: 1 },
              ],
            },
          ],
        }}
      />,
    )

    const row = screen.getByTestId('feedback-by-model-row-openrouter/anthropic/claude-haiku-5.5')

    expect(row.textContent).toContain('Claude Haiku 5.5')
    expect(row.textContent).toContain('25%')
    expect(row.textContent).toContain('Meta wording')
    expect(row.textContent).toContain('No reason given (1)')
  })
})
