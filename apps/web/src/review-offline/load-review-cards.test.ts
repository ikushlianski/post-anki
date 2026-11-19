import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReviewCardsOutcome } from '../knowledge-bit/anki-review.api'
import { enqueueGrade } from './offline-grade-queue'
import { loadReviewCardsWithOfflineFallback } from './load-review-cards'
import { refreshStoredPack, PACK_MAX_AGE_MS } from './review-pack'
import { confirmed, makeCard, makeGrade, makePack, makeStore, retry } from './test-helpers'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

const online: ReviewCardsOutcome = {
  ok: true,
  cards: [makeCard('live')],
  counts: { new: 0, learning: 0, review: 1 },
  newRemainingToday: 0,
  nextDueAt: null,
}

afterEach(() => {
  setOnline(true)
  vi.useRealTimers()
})

describe('loading cards for review', () => {
  it('should review from the saved cards, flagged as saved, when the connection fails', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('saved')]))

    const outcome = await loadReviewCardsWithOfflineFallback(() => Promise.reject(new TypeError('fetch failed')), true, store)

    expect(outcome.ok && outcome.cards.map((card) => card.variantId)).toEqual(['variant-saved'])
    expect(outcome.ok && outcome.savedPack).toBe(true)
  })

  it('should not serve saved cards for a scoped or study-ahead review', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('saved')]))

    await expect(
      loadReviewCardsWithOfflineFallback(() => Promise.reject(new TypeError('fetch failed')), false, store),
    ).rejects.toThrow('fetch failed')
  })

  it('should keep showing the error when the server answers with a failure while the browser is online', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('saved')]))

    expect(await loadReviewCardsWithOfflineFallback(async () => ({ ok: false, error: 'boom' }), true, store)).toEqual({
      ok: false,
      error: 'boom',
    })
    await expect(
      loadReviewCardsWithOfflineFallback(() => Promise.reject(new Error('server exploded')), true, store),
    ).rejects.toThrow('server exploded')
  })

  it('should serve saved cards for a server failure only when the browser is offline', async () => {
    const store = makeStore()

    setOnline(false)
    await refreshStoredPack(store, async () => makePack([makeCard('saved')]))

    const outcome = await loadReviewCardsWithOfflineFallback(async () => ({ ok: false, error: 'boom' }), true, store)

    expect(outcome.ok).toBe(true)
  })

  it('should not serve a pack that is too old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })

    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('saved')]))
    vi.setSystemTime(Date.now() + PACK_MAX_AGE_MS + 60_000)

    await expect(
      loadReviewCardsWithOfflineFallback(() => Promise.reject(new TypeError('fetch failed')), true, store),
    ).rejects.toThrow()
  })

  it('should hide cards whose grades are still waiting to sync', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade({ variantId: 'variant-live', knowledgeBitId: 'bit-live' }))

    const outcome = await loadReviewCardsWithOfflineFallback(async () => online, true, store, async () => retry)

    expect(outcome.ok && outcome.cards).toEqual([])
  })

  it('should skip sending while the browser is offline', async () => {
    setOnline(false)

    const store = makeStore()
    const send = vi.fn(async () => confirmed)

    await enqueueGrade(store, makeGrade())
    await loadReviewCardsWithOfflineFallback(async () => online, true, store, send)

    expect(send).not.toHaveBeenCalled()
  })
})
