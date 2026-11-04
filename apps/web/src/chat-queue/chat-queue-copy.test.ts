// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from './chat-queue-copy'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('should copy through the clipboard when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('should fall back to selection copy when the clipboard rejects', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    expect(await copyText('hello')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('should report failure instead of throwing when nothing can copy', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(await copyText('hello')).toBe(false)
  })
})
