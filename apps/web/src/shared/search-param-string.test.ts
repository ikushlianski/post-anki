import { describe, expect, it } from 'vitest'

import { searchParamString } from './search-param-string'

describe('searchParamString', () => {
  it('should return the value unchanged when it is already a string', () => {
    expect(searchParamString('React')).toBe('React')
  })

  it('should coerce a numeric-looking value to its string form', () => {
    expect(searchParamString(2024)).toBe('2024')
  })

  it('should default to an empty string when the value is missing or not coercible', () => {
    expect(searchParamString(undefined)).toBe('')
    expect(searchParamString(null)).toBe('')
    expect(searchParamString(Number.NaN)).toBe('')
  })
})
