import { describe, expect, it } from 'vitest'

import type { ProbeQuestion } from '@post-anki/shared'

import { mapPushQuestion } from './map-push-question'

function question(overrides: Partial<ProbeQuestion>): ProbeQuestion {
  return {
    gapId: 'gap-1',
    gapLabel: 'closures',
    kind: 'socratic',
    prompt: 'Explain closures.',
    ...overrides,
  }
}

describe('mapPushQuestion', () => {
  it('should derive a stable id from the gap and question kind', () => {
    const mapped = mapPushQuestion('topic-1', question({ gapId: 'gap-9', kind: 'quick_test' }))

    expect(mapped.id).toBe('gap-9:quick_test')
  })

  it('should key an opener question (no gap yet) distinctly', () => {
    const mapped = mapPushQuestion('topic-1', question({ gapId: null, kind: 'socratic' }))

    expect(mapped.id).toBe('opener:socratic')
    expect(mapped.gapId).toBeNull()
  })

  it('should carry the topic id and every question field through', () => {
    const mapped = mapPushQuestion(
      'topic-1',
      question({
        options: ['a', 'b'],
        correctAnswerIndex: 1,
        sources: ['https://example.com'],
      }),
    )

    expect(mapped.topicId).toBe('topic-1')
    expect(mapped.options).toEqual(['a', 'b'])
    expect(mapped.correctAnswerIndex).toBe(1)
    expect(mapped.sources).toEqual(['https://example.com'])
  })

  it('should turn a null correctAnswerIndex into undefined, never a fabricated 0', () => {
    const mapped = mapPushQuestion('topic-1', question({ correctAnswerIndex: null }))

    expect(mapped.correctAnswerIndex).toBeUndefined()
  })
})
