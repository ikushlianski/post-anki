import { describe, expect, it } from 'vitest'

import { sessionTargetLabel } from './session-target-label'

describe('sessionTargetLabel', () => {
  it('labels a null target as "Anything"', () => {
    expect(sessionTargetLabel(null, null, {})).toBe('Anything')
  })

  it('labels a curriculum target with its resolved name', () => {
    expect(sessionTargetLabel('curriculum', 'c1', { c1: 'React' })).toBe('Curriculum: React')
  })

  it('falls back to a generic label when the name is not in the lookup', () => {
    expect(sessionTargetLabel('curriculum', 'c1', {})).toBe('Curriculum')
  })

  it('labels a learning path target with its resolved name', () => {
    expect(sessionTargetLabel('learning_path', 'p1', { p1: 'Frontend Engineer' })).toBe(
      'Learning path: Frontend Engineer',
    )
  })
})
