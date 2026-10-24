import { describe, expect, it } from 'vitest'

import { resolveCardSubjectId } from './card-subject'

describe('resolveCardSubjectId', () => {
  it('should chat about the subject the current card belongs to, on any review screen', () => {
    expect(resolveCardSubjectId({ subjectId: 'subject-1' })).toBe('subject-1')
  })

  it('should leave chat disabled for a card without a subject, an old-API card or no card', () => {
    expect(resolveCardSubjectId({ subjectId: null })).toBeNull()
    expect(resolveCardSubjectId({})).toBeNull()
    expect(resolveCardSubjectId(null)).toBeNull()
  })
})
