import { describe, expect, it } from 'vitest'

import type { StudyMaterial } from '@post-anki/shared'

import { hasGeneratingMaterial, kindLabel } from './study-material-status'

function material(overrides: Partial<StudyMaterial>): StudyMaterial {
  return {
    id: 'sm-1',
    topicId: 'topic-1',
    kind: 'worked_example',
    status: 'ready',
    body: 'body',
    citations: [],
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('hasGeneratingMaterial', () => {
  it('should be true when any row is still generating', () => {
    expect(
      hasGeneratingMaterial([material({ status: 'ready' }), material({ status: 'generating' })]),
    ).toBe(true)
  })

  it('should be false when every row settled', () => {
    expect(
      hasGeneratingMaterial([material({ status: 'ready' }), material({ status: 'failed' })]),
    ).toBe(false)
  })

  it('should be false for an empty list', () => {
    expect(hasGeneratingMaterial([])).toBe(false)
  })
})

describe('kindLabel', () => {
  it('should label a worked example', () => {
    expect(kindLabel('worked_example')).toBe('Worked example')
  })

  it('should label an analogy', () => {
    expect(kindLabel('analogy')).toBe('Analogy')
  })
})
