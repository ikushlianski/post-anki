import { describe, expect, it } from 'vitest'

import type { LivenessStatus } from '@post-anki/shared'

import {
  isVisuallyMuted,
  livenessBadgeClass,
  livenessDescription,
  livenessLabel,
  livenessTone,
} from './liveness-presentation'

function status(overrides: Partial<LivenessStatus>): LivenessStatus {
  return {
    entityType: 'learning_list_item',
    entityId: 'item-1',
    score: 7,
    dormant: false,
    generationAllowed: true,
    nudgeDue: false,
    ...overrides,
  }
}

describe('livenessTone', () => {
  it('should read an above-threshold item as live', () => {
    expect(livenessTone(status({}))).toBe('live')
  })

  it('should read a decayed but never-declined item as quiet, not dormant', () => {
    expect(
      livenessTone(status({ score: 3, generationAllowed: false })),
    ).toBe('quiet')
  })

  it('should read a declined item as dormant', () => {
    expect(
      livenessTone(status({ score: 1, dormant: true, generationAllowed: false })),
    ).toBe('dormant')
  })

  it('should read a folded-in item with no liveness row as untracked', () => {
    expect(livenessTone(null)).toBe('untracked')
  })
})

describe('livenessLabel', () => {
  it('should show the score for a live item', () => {
    expect(livenessLabel(status({ score: 8 }))).toBe('Live · 8/10')
  })

  it('should show fading for a quiet item', () => {
    expect(
      livenessLabel(status({ score: 3, generationAllowed: false })),
    ).toBe('Fading · 3/10')
  })

  it('should show dormant for a declined item', () => {
    expect(livenessLabel(status({ score: 2, dormant: true }))).toBe(
      'Dormant · 2/10',
    )
  })

  it('should cope with an unset score', () => {
    expect(livenessLabel(status({ score: null }))).toBe('Live')
    expect(livenessLabel(null)).toBe('Not scored')
  })
})

describe('livenessDescription', () => {
  it('should say a dormant item was not deleted', () => {
    expect(livenessDescription(status({ dormant: true }))).toContain(
      'Nothing was deleted',
    )
  })

  it('should say a quiet item stays listed', () => {
    expect(
      livenessDescription(status({ generationAllowed: false })),
    ).toContain('stays on this list')
  })
})

describe('livenessBadgeClass', () => {
  it('should give a dormant item a different class from a live one', () => {
    expect(livenessBadgeClass(status({ dormant: true }))).not.toBe(
      livenessBadgeClass(status({})),
    )
  })
})

describe('isVisuallyMuted', () => {
  it('should mute only dormant items', () => {
    expect(isVisuallyMuted(status({ dormant: true }))).toBe(true)
    expect(isVisuallyMuted(status({ generationAllowed: false }))).toBe(false)
    expect(isVisuallyMuted(null)).toBe(false)
  })
})
