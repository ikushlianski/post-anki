import { describe, expect, it, vi } from 'vitest'

import { clearOfflineStore } from './clear-offline-store'
import { noteGraded } from './pack-graded-marks'
import { refreshStoredPack } from './review-pack'
import { createMemoryOfflineStore } from './memory-offline-store'
import { flightFor } from './offline-flight'
import { MAX_HARD_FAILURES, type SendResult } from './offline-review-types'
import { createSafeOfflineStore } from './safe-offline-store'
import { deferred, fullGrade, makeCard, makeGrade, makePack, makeStore, retry } from './test-helpers'
import { enqueueGrade, flushQueuedGrades, resetParkedGrades } from './offline-grade-queue'

describe('clearing the offline store on sign-out', () => {
  it('should leave no saved cards, queued grades or marks for the next person on this device', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1')]))
    await noteGraded(store, 'variant-1', 'bit-1')
    await enqueueGrade(store, makeGrade())

    await clearOfflineStore(store)

    expect(await store.readPack()).toBeNull()
    expect(await store.listGrades()).toEqual([])
  })

  it('should not bring back a grade when a send that was running fails after the wipe', async () => {
    const store = makeStore()
    let fail: (error: Error) => void = () => undefined
    const failing = new Promise<SendResult>((_, reject) => {
      fail = reject
    })

    await enqueueGrade(store, makeGrade())

    const flush = flushQueuedGrades(store, () => failing)

    await vi.waitFor(() => expect(flightFor(store).inFlight).not.toBeNull())
    await clearOfflineStore(store)
    fail(new Error('server down'))
    await flush

    expect(await store.listGrades()).toEqual([])
  })

  it('should not bring back a grade when a send that was running ends in a retry after the wipe', async () => {
    const store = makeStore()
    const gate = deferred<SendResult>()

    await store.putGrade({ ...fullGrade(), hardFailures: 1 })

    const flush = flushQueuedGrades(store, () => gate.promise)

    await vi.waitFor(() => expect(flightFor(store).inFlight).not.toBeNull())
    await clearOfflineStore(store)
    gate.resolve(retry)
    await flush

    expect(await store.listGrades()).toEqual([])
  })

  it('should not save a pack that finished downloading after the wipe', async () => {
    const store = makeStore()
    const download = deferred<unknown>()
    const refresh = refreshStoredPack(store, () => download.promise)

    await clearOfflineStore(store)
    download.resolve(makePack([makeCard('1')]))

    expect(await refresh).toBe(false)
    expect(await store.readPack()).toBeNull()
  })

  it('should tell the caller when the wipe itself fails', async () => {
    const raw = createMemoryOfflineStore()
    const store = createSafeOfflineStore({ ...raw, clear: () => Promise.reject(new Error('locked')) })

    await expect(clearOfflineStore(store)).rejects.toThrow('locked')
  })

  it('should not un-park a grade when the wipe lands between reading the queue and writing it', async () => {
    const store = makeStore()
    const listGrades = store.listGrades

    await store.putGrade({ ...fullGrade(), hardFailures: MAX_HARD_FAILURES })

    store.listGrades = async () => {
      const grades = await listGrades()

      await clearOfflineStore(store)

      return grades
    }

    await resetParkedGrades(store)

    expect(await listGrades()).toEqual([])
  })

  it('should not queue a grade when the wipe lands during the duplicate check', async () => {
    const store = makeStore()
    const hasGrade = store.hasGrade

    store.hasGrade = async (requestId) => {
      const found = await hasGrade(requestId)

      await clearOfflineStore(store)

      return found
    }

    expect(await enqueueGrade(store, makeGrade())).toBe(false)
    expect(await store.listGrades()).toEqual([])
  })

  it('should not record a graded mark that finishes after the wipe', async () => {
    const store = makeStore()
    const readPack = store.readPack

    await refreshStoredPack(store, async () => makePack([makeCard('1')]))

    store.readPack = async () => {
      const stored = await readPack()

      await clearOfflineStore(store)

      return stored
    }

    await noteGraded(store, 'variant-1', 'bit-1')
    store.readPack = readPack

    expect(await store.readPack()).toBeNull()
  })
})
