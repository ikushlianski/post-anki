import { describe, expect, it } from 'vitest'

import { parseExpandedSubjects } from './subject-expansion'

describe('parseExpandedSubjects', () => {
  it('should treat missing or malformed stored state as all subjects collapsed', () => {
    expect(parseExpandedSubjects(null)).toEqual({})
    expect(parseExpandedSubjects('not json')).toEqual({})
    expect(parseExpandedSubjects('["sub-business"]')).toEqual({})
  })

  it('should keep only subjects stored as expanded', () => {
    expect(parseExpandedSubjects('{"sub-business":true,"sub-sales":false}')).toEqual({
      'sub-business': true,
    })
  })
})
