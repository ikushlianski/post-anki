// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

vi.mock('./chat-queue.api', () => ({ exportChatQueueMarkdown: vi.fn() }))

import { exportChatQueueMarkdown } from './chat-queue.api'
import { useChatQueueExport } from './use-chat-queue-export'

describe('useChatQueueExport', () => {
  beforeEach(() => {
    vi.mocked(exportChatQueueMarkdown).mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should download the markdown file under the server filename and finish without an error', async () => {
    vi.mocked(exportChatQueueMarkdown).mockResolvedValue({
      ok: true,
      data: { markdown: '# Notes', filename: 'physics.md' },
    } as never)

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = renderHook(() => useChatQueueExport())

    await act(async () => {
      await result.current.exportSubject('s1')
    })

    expect(exportChatQueueMarkdown).toHaveBeenCalledWith({ data: { subjectId: 's1' } })
    expect(click).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    expect(result.current.error).toBeNull()
    expect(result.current.exporting).toBe(false)
  })

  it('should show the failure and download nothing when the server refuses', async () => {
    vi.mocked(exportChatQueueMarkdown).mockResolvedValue({ ok: false, failure: 'not_found' } as never)

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = renderHook(() => useChatQueueExport())

    await act(async () => {
      await result.current.exportSubject('s1')
    })

    expect(result.current.error).toBe('This card no longer exists.')
    expect(click).not.toHaveBeenCalled()
    expect(result.current.exporting).toBe(false)
  })

  it('should show a generic failure when the request throws and clear it on the next success', async () => {
    vi.mocked(exportChatQueueMarkdown).mockRejectedValueOnce(new Error('x'))

    const { result } = renderHook(() => useChatQueueExport())

    await act(async () => {
      await result.current.exportSubject('s1')
    })
    expect(result.current.error).not.toBeNull()

    vi.mocked(exportChatQueueMarkdown).mockResolvedValue({
      ok: true,
      data: { markdown: 'a', filename: 'a.md' },
    } as never)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await act(async () => {
      await result.current.exportSubject('s1')
    })

    expect(result.current.error).toBeNull()
  })
})
