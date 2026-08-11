import { describe, expect, it } from 'vitest'

import { noteCaptureErrorMessage } from './note-capture-error'

describe('noteCaptureErrorMessage', () => {
  it('should map invalid_input to a human message', () => {
    expect(noteCaptureErrorMessage('invalid_input', null)).toContain(
      'empty or malformed',
    )
  })

  it('should map not_found to a human message', () => {
    expect(noteCaptureErrorMessage('not_found', null)).toContain(
      'could not be found',
    )
  })

  it('should fall back to the server message for an unknown code', () => {
    expect(noteCaptureErrorMessage('weird_code', 'server said no')).toBe(
      'server said no',
    )
  })

  it('should fall back to a generic message when nothing else is available', () => {
    expect(noteCaptureErrorMessage('weird_code', null)).toBe(
      'Nothing was captured. The request was rejected.',
    )
  })
})
