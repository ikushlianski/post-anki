import { describe, expect, it } from 'vitest'

import { formatTokens } from './format-tokens'

describe('formatTokens', () => {
  it('shows token counts for calls that reported usage', () => {
    expect(formatTokens(1200, 340, 1540)).toBe('1200 / 340 / 1540')
  })

  it('shows a dash for calls recorded before usage was captured', () => {
    expect(formatTokens(null, null, null)).toBe('—')
  })

  it('shows a per-field dash when only some usage fields are known', () => {
    expect(formatTokens(null, 340, 1540)).toBe('— / 340 / 1540')
  })
})
