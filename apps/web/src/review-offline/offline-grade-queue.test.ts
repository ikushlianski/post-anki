import { describe, expect, it, vi } from 'vitest'

import {
  backoffDelayMs,
  enqueueGrade,
  flushQueuedGrades,
  resetParkedGrades,
  withoutQueuedGrades,
} from './offline-grade-queue'
import { MAX_HARD_FAILURES } from './offline-review-types'
import { confirmed, fullGrade, makeGrade, makeStore, rejected, retry } from './test-helpers'
import { createMemoryOfflineStore } from './memory-offline-store'
import { createSafeOfflineStore } from './safe-offline-store'

describe('offline grade queue', () => {
  it('should keep the real review time of a grade given while offline', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade({ variantId: 'v1' }), new Date('2026-11-19T10:15:00.000Z'))

    expect((await store.listGrades())[0]?.reviewedAt).toBe('2026-11-19T10:15:00.000Z')
  })

  it('should not queue the same grade twice when it is submitted again with the same key', async () => {
    const store = makeStore()
    const grade = makeGrade()

    await enqueueGrade(store, grade)
    await enqueueGrade(store, grade)

    expect(await store.listGrades()).toHaveLength(1)
  })

  it('should tell the caller when a grade could only be kept in memory', async () => {
    const failing = createMemoryOfflineStore()

    failing.putGrade = () => Promise.reject(new Error('quota'))

    const store = createSafeOfflineStore(failing)

    expect(await enqueueGrade(store, makeGrade())).toBe(false)
    expect(await store.listGrades()).toHaveLength(1)
    expect(await enqueueGrade(makeStore(), makeGrade())).toBe(true)
  })

  it('should send queued grades oldest first and clear the confirmed ones', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade({ variantId: 'b' }), new Date(2000))
    await enqueueGrade(store, makeGrade({ variantId: 'a' }), new Date(1000))

    const sent: string[] = []
    const result = await flushQueuedGrades(store, async (grade) => {
      sent.push(grade.variantId)

      return confirmed
    })

    expect(sent).toEqual(['a', 'b'])
    expect(result).toEqual({ confirmed: 2, remaining: 0, parked: 0, blocked: false })
  })

  it('should keep every grade when the server cannot be reached, so none is lost', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade())
    await enqueueGrade(store, makeGrade())

    const result = await flushQueuedGrades(store, async () => retry)

    expect(result).toMatchObject({ confirmed: 0, remaining: 2, blocked: true })
    expect(await store.listGrades()).toHaveLength(2)
  })

  it('should drop a grade the server rejects for good so it does not block the rest', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade({ variantId: 'gone' }), new Date(1000))
    await enqueueGrade(store, makeGrade({ variantId: 'ok' }), new Date(2000))

    const result = await flushQueuedGrades(store, async (grade) => (grade.variantId === 'gone' ? rejected : confirmed))

    expect(result).toMatchObject({ confirmed: 1, remaining: 0, blocked: false })
  })

  it('should not run two syncs at once', async () => {
    const store = makeStore()
    const send = vi.fn(async () => confirmed)

    await enqueueGrade(store, makeGrade())
    await Promise.all([flushQueuedGrades(store, send), flushQueuedGrades(store, send)])

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('should keep retrying a failing grade and let later grades through while it waits', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade({ variantId: 'poison' }), new Date(1000))
    await enqueueGrade(store, makeGrade({ variantId: 'fine' }), new Date(2000))

    const send = vi.fn(async (grade: { variantId: string }) => {
      if (grade.variantId === 'poison') {
        throw new Error('server down')
      }

      return confirmed
    })
    const first = await flushQueuedGrades(store, send)

    expect(first).toMatchObject({ confirmed: 1, remaining: 1, parked: 0, blocked: true })
    expect((await store.listGrades()).map((grade) => grade.variantId)).toEqual(['poison'])
  })

  it('should park a grade only after several failed attempts', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade())

    const send = async () => {
      throw new Error('server down')
    }

    for (let round = 1; round < MAX_HARD_FAILURES; round += 1) {
      expect(await flushQueuedGrades(store, send)).toMatchObject({ parked: 0, blocked: true })
    }

    expect(await flushQueuedGrades(store, send)).toMatchObject({ remaining: 0, parked: 1, blocked: false })
  })

  it('should stop hammering a server that fails on every grade in one pass', async () => {
    const store = makeStore()
    const send = vi.fn(async () => {
      throw new Error('server down')
    })

    for (let index = 0; index < 5; index += 1) {
      await enqueueGrade(store, makeGrade(), new Date(index))
    }

    await flushQueuedGrades(store, send)

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('should not count network failures as poison', async () => {
    const store = makeStore()

    await enqueueGrade(store, makeGrade())

    for (let round = 0; round < MAX_HARD_FAILURES + 2; round += 1) {
      await flushQueuedGrades(store, async () => retry)
    }

    expect((await flushQueuedGrades(store, async () => retry)).parked).toBe(0)
  })

  it('should give a parked grade another chance after a reset', async () => {
    const store = makeStore()

    await store.putGrade({ ...fullGrade(), hardFailures: MAX_HARD_FAILURES })
    await resetParkedGrades(store)

    expect((await flushQueuedGrades(store, async () => confirmed)).confirmed).toBe(1)
  })

  it('should hide cards already graded offline, including their siblings', () => {
    const cards = [
      { variantId: 'v1', knowledgeBitId: 'b1' },
      { variantId: 'v2', knowledgeBitId: 'b1' },
      { variantId: 'v3', knowledgeBitId: 'b2' },
    ]

    expect(withoutQueuedGrades(cards, [fullGrade({ variantId: 'v1', knowledgeBitId: 'b1' })]).map((c) => c.variantId)).toEqual(['v3'])
  })

  it('should wait longer between retries up to a cap', () => {
    expect([backoffDelayMs(0), backoffDelayMs(2), backoffDelayMs(20)]).toEqual([2000, 8000, 60000])
  })
})
