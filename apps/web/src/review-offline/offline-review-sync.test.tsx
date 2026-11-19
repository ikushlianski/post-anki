// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { enqueueGrade } from './offline-grade-queue'
import { OfflineReviewSync, offlineGradesLabel } from './offline-review-sync'
import { MAX_HARD_FAILURES, type SendResult } from './offline-review-types'
import { savedCardsView } from './saved-cards-view'
import { confirmed, fullGrade, makeCard, makeGrade, makePack, makeStore, retry } from './test-helpers'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

const noPack = async () => makePack([])

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setOnline(true)
})

describe('offline review sync', () => {
  it('should word the waiting count by connection and sync state', () => {
    expect(offlineGradesLabel(1, false)).toBe('Offline: 1 grade waiting')
    expect(offlineGradesLabel(3, true, 'syncing')).toBe('Syncing: 3 grades waiting')
    expect(offlineGradesLabel(3, true, 'scheduled')).toBe('Syncing: 3 grades waiting')
    expect(offlineGradesLabel(3, true, 'idle')).toBe('Waiting to retry: 3 grades waiting')
  })

  it('should show how many grades are waiting while offline and send nothing', async () => {
    setOnline(false)

    const store = makeStore()
    const send = vi.fn(async () => confirmed)

    await enqueueGrade(store, makeGrade())
    await enqueueGrade(store, makeGrade())
    render(<OfflineReviewSync store={store} send={send} download={noPack} />)

    expect((await screen.findByTestId('offline-grades-indicator')).textContent).toBe('Offline: 2 grades waiting')
    expect(send).not.toHaveBeenCalled()
  })

  it('should send waiting grades when the connection returns and then hide the indicator', async () => {
    setOnline(false)

    const store = makeStore()
    const send = vi.fn(async () => confirmed)

    await enqueueGrade(store, makeGrade())
    render(<OfflineReviewSync store={store} send={send} download={noPack} />)
    await screen.findByTestId('offline-grades-indicator')

    act(() => setOnline(true))

    await waitFor(() => expect(screen.queryByTestId('offline-grades-indicator')).toBeNull())
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('should download the pack on load when online', async () => {
    const store = makeStore()
    const download = vi.fn(async () => makePack([makeCard('1')]))

    render(<OfflineReviewSync store={store} send={async () => confirmed} download={download} />)

    await waitFor(async () => expect(await store.readPack()).not.toBeNull())
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('should try to send right away when a grade is queued while online and keep retrying with backoff', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const store = makeStore()
    const send = vi.fn<() => Promise<SendResult>>().mockResolvedValueOnce(retry).mockResolvedValue(confirmed)

    render(<OfflineReviewSync store={store} send={send} download={noPack} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    await act(async () => {
      await enqueueGrade(store, makeGrade())
    })
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect((await screen.findByTestId('offline-grades-indicator')).textContent).toBe('Syncing: 1 grade waiting')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    await waitFor(async () => expect(await store.listGrades()).toEqual([]))
  })

  it('should say a grade is waiting to retry when no attempt is running or scheduled', async () => {
    const store = makeStore()
    const gate = vi.fn(async (): Promise<SendResult> => confirmed)

    await enqueueGrade(store, makeGrade())
    setOnline(false)
    render(<OfflineReviewSync store={store} send={gate} download={noPack} />)
    await screen.findByTestId('offline-grades-indicator')
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    act(() => window.dispatchEvent(new Event('online')))

    await waitFor(() => expect(screen.queryByTestId('offline-grades-indicator')).toBeNull())
  })

  it('should show parked grades as not saved while later grades still sync', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const store = makeStore()
    const poison = fullGrade({ variantId: 'poison' })
    const send = vi.fn(async (grade: { variantId: string }): Promise<SendResult> => {
      if (grade.variantId === 'poison') {
        throw new Error('validation')
      }

      return confirmed
    })

    await store.putGrade({ ...poison, createdAt: 1, hardFailures: MAX_HARD_FAILURES - 1 })
    await store.putGrade({ ...fullGrade({ variantId: 'fine' }), createdAt: 2 })
    render(<OfflineReviewSync store={store} send={send} download={noPack} />)

    expect((await screen.findByTestId('offline-grades-failed')).textContent).toBe('1 grade could not be saved')
    await waitFor(async () => expect((await store.listGrades()).map((grade) => grade.variantId)).toEqual(['poison']))
  })

  it('should warn when waiting grades exist only in memory', async () => {
    const store = makeStore()
    const memoryOnly = { ...store, putGrade: async (grade: Parameters<typeof store.putGrade>[0]) => (await store.putGrade(grade), false) }

    setOnline(false)
    await enqueueGrade(memoryOnly, makeGrade())
    render(<OfflineReviewSync store={memoryOnly} send={async () => retry} download={noPack} />)

    expect(await screen.findByTestId('offline-grades-memory-only')).toBeTruthy()
  })

  it('should caption saved cards and show a finished state once they run out', () => {
    const data = { ok: true as const, savedPack: true, cards: [], counts: { new: 0, learning: 0, review: 0 }, newRemainingToday: 0, nextDueAt: null }

    expect(savedCardsView(data, true)).toEqual({ usingSavedCards: true, savedCardsFinished: false })
    expect(savedCardsView(data, false)).toEqual({ usingSavedCards: true, savedCardsFinished: true })
    expect(savedCardsView({ ...data, savedPack: false }, false)).toEqual({ usingSavedCards: false, savedCardsFinished: false })

    render(<OfflineReviewSync store={makeStore()} send={async () => retry} download={noPack} usingSavedCards savedCardsFinished />)

    expect(screen.getByTestId('saved-cards-caption').textContent).toBe('Using saved cards')
    expect(screen.getByTestId('saved-cards-finished').textContent).toContain('Saved cards finished')
  })
})
