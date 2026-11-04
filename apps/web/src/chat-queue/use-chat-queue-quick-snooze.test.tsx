// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

vi.mock('./chat-queue.api', () => ({ snoozeChatQueueCard: vi.fn() }))

import { snoozeChatQueueCard } from './chat-queue.api'
import {
  CHAT_QUEUE_QUICK_SNOOZE_DAYS,
  CHAT_QUEUE_SNOOZE_ERROR,
  useChatQueueQuickSnooze,
} from './use-chat-queue-quick-snooze'

describe('useChatQueueQuickSnooze', () => {
  beforeEach(() => {
    vi.mocked(snoozeChatQueueCard).mockReset()
  })

  afterEach(cleanup)

  it('should snooze for the shortest option and report the new wake-up time', async () => {
    vi.mocked(snoozeChatQueueCard).mockResolvedValue({
      ok: true,
      data: { snoozedUntil: '2026-10-30T00:00:00.000Z' },
    } as never)

    const onSnoozed = vi.fn()
    const { result } = renderHook(() => useChatQueueQuickSnooze(onSnoozed))

    await act(async () => {
      await result.current.snooze('a')
    })

    expect(snoozeChatQueueCard).toHaveBeenCalledWith({ data: { bitId: 'a', days: CHAT_QUEUE_QUICK_SNOOZE_DAYS } })
    expect(onSnoozed).toHaveBeenCalledWith('a', '2026-10-30T00:00:00.000Z')
    expect(result.current.error).toBeNull()
  })

  it('should show an error and leave the card alone when the snooze fails or returns no time', async () => {
    const onSnoozed = vi.fn()
    const { result } = renderHook(() => useChatQueueQuickSnooze(onSnoozed))

    vi.mocked(snoozeChatQueueCard).mockResolvedValueOnce({ ok: false, failure: 'other' } as never)
    await act(async () => {
      await result.current.snooze('a')
    })
    expect(result.current.error).toBe(CHAT_QUEUE_SNOOZE_ERROR)

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    vi.mocked(snoozeChatQueueCard).mockRejectedValueOnce(new Error('x'))
    await act(async () => {
      await result.current.snooze('a')
    })

    expect(result.current.error).toBe(CHAT_QUEUE_SNOOZE_ERROR)
    expect(onSnoozed).not.toHaveBeenCalled()
  })

  it('should ignore a second tap while the first snooze is still running', async () => {
    let finish: (value: unknown) => void = () => {}

    vi.mocked(snoozeChatQueueCard).mockReturnValue(new Promise((resolve) => (finish = resolve)) as never)

    const { result } = renderHook(() => useChatQueueQuickSnooze(vi.fn()))

    await act(async () => {
      void result.current.snooze('a')
      void result.current.snooze('a')
    })
    await act(async () => finish({ ok: false, failure: 'other' }))

    expect(snoozeChatQueueCard).toHaveBeenCalledTimes(1)
  })
})
