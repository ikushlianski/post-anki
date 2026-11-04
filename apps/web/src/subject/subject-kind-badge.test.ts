import { describe, expect, it } from 'vitest'

import { subjectKindBadge } from './subject-kind-badge'

describe('subjectKindBadge', () => {
  it('should show no badge for the default architecture-mentor kind', () => {
    expect(subjectKindBadge('architecture-mentor')).toBeNull()
  })

  it('should show no badge when the subject has no kind', () => {
    expect(subjectKindBadge(undefined)).toBeNull()
    expect(subjectKindBadge('')).toBeNull()
  })

  it('should label language-practice subjects as Language practice', () => {
    expect(subjectKindBadge('language-practice')).toBe('Language practice')
  })

  it('should humanise any other kind by replacing dashes and capitalising', () => {
    expect(subjectKindBadge('exam-prep')).toBe('Exam prep')
    expect(subjectKindBadge('deep_dive')).toBe('Deep dive')
  })
})
