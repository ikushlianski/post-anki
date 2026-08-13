import { describe, expect, it } from 'vitest'

import { depthLevelSchema } from '@post-anki/shared'

import {
  DEPTH_FOR_CHOICE,
  choiceForDepth,
  depthChoiceIntent,
  depthForChoice,
  electedDepthForTopic,
  nextDepthElectedAt,
  normalizeDepthLevel,
} from './depth-choice'

describe('depthForChoice', () => {
  it('should map basics onto the existing working depth', () => {
    expect(depthForChoice('basics')).toBe('working')
  })

  it('should map advanced onto the existing deep depth', () => {
    expect(depthForChoice('advanced')).toBe('deep')
  })

  it('should only ever produce values from the shared depth ladder', () => {
    for (const depth of Object.values(DEPTH_FOR_CHOICE)) {
      expect(depthLevelSchema.safeParse(depth).success).toBe(true)
    }
  })
})

describe('choiceForDepth', () => {
  it('should round-trip both choices', () => {
    expect(choiceForDepth(depthForChoice('basics'))).toBe('basics')
    expect(choiceForDepth(depthForChoice('advanced'))).toBe('advanced')
  })

  it('should have no choice for the awareness rung', () => {
    expect(choiceForDepth('awareness')).toBeNull()
  })
})

describe('depthChoiceIntent', () => {
  it('should reuse the shared depth intent wording', () => {
    expect(depthChoiceIntent('basics')).toContain('day to day')
    expect(depthChoiceIntent('advanced')).toContain('internals')
  })
})

describe('normalizeDepthLevel', () => {
  it('should translate the web aware alias onto awareness', () => {
    expect(normalizeDepthLevel('aware')).toBe('awareness')
  })

  it('should pass shared ladder values through', () => {
    expect(normalizeDepthLevel('deep')).toBe('deep')
  })

  it('should fall back to working for anything unknown', () => {
    expect(normalizeDepthLevel('nonsense')).toBe('working')
  })
})

describe('electedDepthForTopic', () => {
  it('should report no election for a topic never asked', () => {
    expect(
      electedDepthForTopic({ depthElectedAt: null, depth: 'working' }),
    ).toBeNull()
  })

  it('should report the elected depth once a depth has been stamped', () => {
    expect(
      electedDepthForTopic({
        depthElectedAt: '2026-08-06T10:00:00.000Z',
        depth: 'deep',
      }),
    ).toBe('deep')
  })

})

describe('nextDepthElectedAt', () => {
  it('should stamp the first election with now', () => {
    expect(nextDepthElectedAt(null, '2026-08-07T10:00:00.000Z')).toBe(
      '2026-08-07T10:00:00.000Z',
    )
  })

  it('should keep the original election timestamp on a later depth change', () => {
    expect(
      nextDepthElectedAt('2026-08-01T10:00:00.000Z', '2026-08-07T10:00:00.000Z'),
    ).toBe('2026-08-01T10:00:00.000Z')
  })
})
