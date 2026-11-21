import { describe, expect, it } from 'vitest'

import { enqueueGrade, flushQueuedGrades } from './offline-grade-queue'
import { noteGraded, unmarkGraded } from './pack-graded-marks'
import { boundPack, isPackFresh, MAX_PACK_CARDS, PACK_MAX_AGE_MS, packToReviewCards, refreshStoredPack } from './review-pack'
import { confirmed, deferred, fullGrade, makeCard, makeGrade, makePack, makeStore } from './test-helpers'

const stored = (cards = [makeCard('1')]) => ({
  savedAt: '2026-11-19T10:00:00.000Z',
  pack: makePack(cards),
  gradedSince: [],
})

describe('review pack', () => {
  it('should count saved cards by how the learner will see them', () => {
    const cards = [
      makeCard('1', { phase: 'new' }),
      makeCard('2', { phase: 'learning' }),
      makeCard('3', { phase: 'relearning' }),
      makeCard('4', { phase: 'review' }),
    ]

    expect(packToReviewCards(stored(cards), []).counts).toEqual({ new: 1, learning: 2, review: 1 })
  })

  it('should not offer a card again once it was graded offline', () => {
    const cards = [makeCard('1'), makeCard('2')]
    const grades = [fullGrade({ variantId: 'variant-1', knowledgeBitId: 'bit-1' })]

    expect(packToReviewCards(stored(cards), grades).cards.map((card) => card.variantId)).toEqual(['variant-2'])
  })

  it('should not offer cards graded online since the pack was saved', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]))
    await noteGraded(store, 'variant-1', 'bit-1')

    const saved = await store.readPack()

    expect(saved && packToReviewCards(saved, []).cards.map((card) => card.variantId)).toEqual(['variant-2'])
  })

  it('should offer the card again after an online grade is undone', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1')]))
    await noteGraded(store, 'variant-1', 'bit-1')
    await unmarkGraded(store, 'variant-1')

    const saved = await store.readPack()

    expect(saved && packToReviewCards(saved, []).cards).toHaveLength(1)
  })

  it('should carry recent graded marks over a refresh and drop old ones', async () => {
    const store = makeStore()
    const now = new Date('2026-11-19T12:00:00.000Z')

    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]), now)
    await noteGraded(store, 'variant-1', 'bit-1', now.getTime() - 1000)
    await noteGraded(store, 'variant-2', 'bit-2', now.getTime() - 2 * 3_600_000)
    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]), now)

    expect((await store.readPack())?.gradedSince.map((mark) => mark.variantId)).toEqual(['variant-1'])
  })

  it('should stop serving a pack older than a day', () => {
    const saved = stored()
    const savedAt = Date.parse(saved.savedAt)

    expect(isPackFresh(saved, savedAt + PACK_MAX_AGE_MS)).toBe(true)
    expect(isPackFresh(saved, savedAt + PACK_MAX_AGE_MS + 1)).toBe(false)
  })

  it('should cap how many cards are stored on the device', () => {
    const cards = Array.from({ length: MAX_PACK_CARDS + 20 }, (_, index) => makeCard(String(index)))
    const bounded = boundPack(makePack(cards))

    expect(bounded.cards).toHaveLength(MAX_PACK_CARDS)
    expect(bounded.truncated).toBe(true)
  })

  it('should keep the previous pack when the download fails or is malformed', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1')]))

    expect(await refreshStoredPack(store, async () => Promise.reject(new Error('offline')))).toBe(false)
    expect(await refreshStoredPack(store, async () => ({ cards: 'bad' }))).toBe(false)
    expect((await store.readPack())?.pack.cards).toHaveLength(1)
  })

  it('should keep a card graded while the pack is being refreshed', async () => {
    const store = makeStore()
    const gate = deferred<void>()
    const writePack = store.writePack

    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]))

    store.writePack = async (value) => {
      await gate.promise

      return writePack(value)
    }

    const refresh = refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]))
    const noting = noteGraded(store, 'variant-1', 'bit-1')

    gate.resolve()
    await Promise.all([refresh, noting])

    expect((await store.readPack())?.gradedSince.map((mark) => mark.variantId)).toEqual(['variant-1'])
  })

  it('should keep hiding a card whose queued grade synced while the pack was downloading', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]))
    await enqueueGrade(store, makeGrade({ variantId: 'variant-1', knowledgeBitId: 'bit-1' }))
    await flushQueuedGrades(store, async () => confirmed)
    await refreshStoredPack(store, async () => makePack([makeCard('1'), makeCard('2')]))

    const saved = await store.readPack()

    expect(saved && packToReviewCards(saved, []).cards.map((card) => card.variantId)).toEqual(['variant-2'])
  })
})
