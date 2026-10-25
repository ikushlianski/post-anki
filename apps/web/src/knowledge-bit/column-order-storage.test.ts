// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearColumnLayout, readColumnLayout, writeColumnLayout } from './column-order-storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('column layout storage', () => {
  it('should give back the order and hidden columns saved for the same table', () => {
    writeColumnLayout('subject-1', { order: ['answer', 'phrasings'], hidden: ['answer'] })

    expect(readColumnLayout('subject-1')).toEqual({ order: ['answer', 'phrasings'], hidden: ['answer'] })
  })

  it('should keep each table layout separate', () => {
    writeColumnLayout('subject-1', { order: ['answer'], hidden: [] })

    expect(readColumnLayout('subject-2')).toBeNull()
  })

  it('should still load an order saved before columns could be hidden', () => {
    window.localStorage.setItem('knowledge-browser-columns:v1:subject-1', '["answer","phrasings"]')

    expect(readColumnLayout('subject-1')).toEqual({ order: ['answer', 'phrasings'], hidden: null })
  })

  it('should forget both the layout and an older saved order after a reset', () => {
    window.localStorage.setItem('knowledge-browser-columns:v1:subject-1', '["answer"]')
    writeColumnLayout('subject-1', { order: ['answer'], hidden: [] })
    clearColumnLayout('subject-1')

    expect(readColumnLayout('subject-1')).toBeNull()
  })

  it('should ignore a saved value that is not a list of column names', () => {
    window.localStorage.setItem('knowledge-browser-columns:v1:subject-1', '{"a":1}')

    expect(readColumnLayout('subject-1')).toBeNull()
  })

  it('should not break the page when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readColumnLayout('subject-1')).toBeNull()
    expect(() => writeColumnLayout('subject-1', { order: ['answer'], hidden: [] })).not.toThrow()
  })
})
