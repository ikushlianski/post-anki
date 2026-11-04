import { describe, expect, it } from 'vitest'

import { matchesSubjectPath, subjectPathOptions } from './subject-path-filter'

describe('subject path filter', () => {
  it('should offer every parent of a nested subject as a choice', () => {
    expect(subjectPathOptions(['Business › Sales › Cold sales', null])).toEqual([
      'Business',
      'Business › Sales',
      'Business › Sales › Cold sales',
    ])
  })

  it('should match a parent subject and its sub-subjects but not look-alike names', () => {
    expect(matchesSubjectPath('Business › Sales › Cold sales', 'Business › Sales')).toBe(true)
    expect(matchesSubjectPath('Business › Sales', 'Business › Sales')).toBe(true)
    expect(matchesSubjectPath('Business Law', 'Business')).toBe(false)
    expect(matchesSubjectPath(null, 'Business')).toBe(false)
  })
})
