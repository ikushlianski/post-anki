// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearColumnOrder, readColumnOrder, writeColumnOrder } from './column-order-storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('column order storage', () => {
  it('should give back the order saved for the same table', () => {
    writeColumnOrder('subject-1', ['answer', 'phrasings'])

    expect(readColumnOrder('subject-1')).toEqual(['answer', 'phrasings'])
  })

  it('should keep each table order separate', () => {
    writeColumnOrder('subject-1', ['answer'])

    expect(readColumnOrder('subject-2')).toBeNull()
  })

  it('should forget the order after a reset', () => {
    writeColumnOrder('subject-1', ['answer'])
    clearColumnOrder('subject-1')

    expect(readColumnOrder('subject-1')).toBeNull()
  })

  it('should ignore a saved value that is not a list of column names', () => {
    window.localStorage.setItem('knowledge-browser-columns:v1:subject-1', '{"a":1}')

    expect(readColumnOrder('subject-1')).toBeNull()
  })

  it('should not break the page when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readColumnOrder('subject-1')).toBeNull()
    expect(() => writeColumnOrder('subject-1', ['answer'])).not.toThrow()
  })
})
