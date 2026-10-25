// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LAST_SUBJECT_STORAGE_KEY, readLastSubjectId, writeLastSubjectId } from './last-subject-storage'

describe('last subject storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('should give back the subject that was saved last on this device', () => {
    writeLastSubjectId('sub_a')
    writeLastSubjectId('sub_b')

    expect(readLastSubjectId()).toBe('sub_b')
    expect(window.localStorage.getItem(LAST_SUBJECT_STORAGE_KEY)).toBe('sub_b')
  })

  it('should start with no subject when nothing was saved yet', () => {
    expect(readLastSubjectId()).toBe('')
  })

  it('should start with no subject when the browser refuses to read storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readLastSubjectId()).toBe('')
  })

  it('should not break adding knowledge when the browser refuses to write storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => writeLastSubjectId('sub_a')).not.toThrow()
  })
})
