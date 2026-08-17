import { describe, expect, it } from 'vitest'

import { captureErrorMessage, isDescriptionRequired } from './capture-error'

describe('captureErrorMessage', () => {
  it('should explain a video captured without a description', () => {
    expect(captureErrorMessage('video_requires_description', null)).toContain(
      'paste the video description',
    )
  })

  it('should say nothing was captured for every known rejection', () => {
    const codes = [
      'video_requires_description',
      'source_blocked',
      'source_unreachable',
      'source_empty',
      'invalid_input',
    ]

    for (const code of codes) {
      expect(captureErrorMessage(code, null)).toContain('Nothing was captured')
    }
  })

  it('should fall back to the API message for an unmapped code', () => {
    expect(captureErrorMessage('teapot', 'the server is a teapot')).toBe(
      'the server is a teapot',
    )
  })

  it('should fall back to a generic message when the API sent none', () => {
    expect(captureErrorMessage('teapot', null)).toBe(
      'Nothing was captured. The request was rejected.',
    )
  })

  it('should ignore a blank API message', () => {
    expect(captureErrorMessage('teapot', '   ')).toBe(
      'Nothing was captured. The request was rejected.',
    )
  })
})

describe('isDescriptionRequired', () => {
  it('should require a description for a video with none', () => {
    expect(isDescriptionRequired('video', '  ')).toBe(true)
  })

  it('should not require a description once one is typed', () => {
    expect(isDescriptionRequired('video', 'a talk about effects')).toBe(false)
  })

  it('should never require a description for an article', () => {
    expect(isDescriptionRequired('article', '')).toBe(false)
  })
})
