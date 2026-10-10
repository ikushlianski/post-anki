import { describe, expect, it } from 'vitest'

import { variantKindLabel } from './knowledge-bit-variant-kind-label'

describe('variantKindLabel', () => {
  it('should tell the reviewer which type of card each variant is', () => {
    expect(variantKindLabel('basic')).toBe('Front / back')
    expect(variantKindLabel('fill_in_the_blank')).toBe('Fill in the blank')
    expect(variantKindLabel('wh_question')).toBe('Why question')
  })
})
