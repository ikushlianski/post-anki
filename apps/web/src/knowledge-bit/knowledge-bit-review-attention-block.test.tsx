// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewAttentionBlock } from './knowledge-bit-review-attention-block'
import type { SourceRegenerationState } from './knowledge-bit-review-regeneration'

afterEach(cleanup)

function notice(id: string): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: id,
    sourceText: null,
    subjectName: null,
    bits: [],
    attention: {
      knowledgeSourceId: id,
      kind: 'failed',
      reason: 'no_valid_items',
      firstWords: `Note ${id}`,
      sourceText: `Text ${id}`,
      since: new Date().toISOString(),
    },
  } as PendingKnowledgeSourceForReview
}

function renderBlock(
  ids: string[],
  states: Record<string, SourceRegenerationState | undefined> = {},
  onRetry = vi.fn(),
) {
  render(
    <KnowledgeBitReviewAttentionBlock
      notices={ids.map(notice)}
      states={states}
      actions={{ onRetry, onRetryWithText: vi.fn() }}
      onDiscard={vi.fn(async () => true)}
    />,
  )

  return onRetry
}

describe('KnowledgeBitReviewAttentionBlock', () => {
  it('should retry every failed note with one click on Retry all', () => {
    const onRetry = renderBlock(['a', 'b', 'c'])

    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-retry-all'))

    expect(onRetry.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c'])
  })

  it('should skip notes that are already retrying', () => {
    const onRetry = renderBlock(['a', 'b'], { a: { phase: 'running' } })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-retry-all'))

    expect(onRetry.mock.calls.map(([id]) => id)).toEqual(['b'])
  })

  it('should not offer Retry all for a single note', () => {
    renderBlock(['a'])

    expect(screen.queryByTestId('knowledge-bit-review-attention-retry-all')).toBeNull()
  })
})
