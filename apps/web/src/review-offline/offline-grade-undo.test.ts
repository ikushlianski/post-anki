import { describe, expect, it, vi } from 'vitest'

import { flightFor } from './offline-flight'
import { enqueueGrade, flushQueuedGrades } from './offline-grade-queue'
import { undoQueuedGrade } from './offline-grade-undo'
import { confirmed, deferred, gatedSend, makeGrade, makeStore, rejected, retry } from './test-helpers'

describe('undoing a queued grade', () => {
  it('should remove a grade that has not been sent yet', async () => {
    const store = makeStore()
    const grade = makeGrade()

    await enqueueGrade(store, grade)

    expect(await undoQueuedGrade(store, async () => confirmed, grade.requestId)).toEqual({ kind: 'removed' })
    expect(await store.listGrades()).toEqual([])
  })

  it('should report a grade that is unknown', async () => {
    expect(await undoQueuedGrade(makeStore(), async () => confirmed, 'nope')).toEqual({ kind: 'missing' })
  })

  it('should point to the server review when the grade was already synced', async () => {
    const store = makeStore()
    const grade = makeGrade()

    await enqueueGrade(store, grade)
    await flushQueuedGrades(store, async () => confirmed)

    expect(await undoQueuedGrade(store, async () => confirmed, grade.requestId)).toEqual({
      kind: 'sent',
      reviewId: 'server-review-1',
    })
  })

  it('should wait for a send in progress and hand back the server review when it lands', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const gate = gatedSend()

    await enqueueGrade(store, grade)

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const undo = undoQueuedGrade(store, async () => confirmed, grade.requestId)

    gate.resolve(confirmed)
    await flush

    expect(await undo).toEqual({ kind: 'sent', reviewId: 'server-review-1' })
    expect(await store.listGrades()).toEqual([])
  })

  it('should report the grade as unconfirmed when a send in progress fails and the retry also fails', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const gate = gatedSend()

    await enqueueGrade(store, grade)

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const undo = undoQueuedGrade(store, async () => retry, grade.requestId)

    gate.resolve(retry)
    await flush

    expect(await undo).toEqual({ kind: 'unconfirmed' })
    expect(await store.listGrades()).toHaveLength(1)
  })

  it('should remove the grade when a cancelled send is rejected by the server', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const gate = gatedSend()

    await enqueueGrade(store, grade)

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const undo = undoQueuedGrade(store, async () => rejected, grade.requestId)

    gate.resolve(rejected)
    await flush

    expect(await undo).toEqual({ kind: 'removed' })
  })

  it('should resolve an unconfirmed grade by asking the server again before undoing', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const gate = gatedSend()

    await enqueueGrade(store, grade)

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const first = undoQueuedGrade(store, async () => retry, grade.requestId)

    gate.resolve(retry)
    await flush
    await first

    expect(await undoQueuedGrade(store, async () => confirmed, grade.requestId)).toEqual({
      kind: 'sent',
      reviewId: 'server-review-1',
    })
    expect(await store.listGrades()).toEqual([])
  })

  it('should hand back the server review when undo lands just after a send is confirmed but before it is cleared', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const clearing = deferred<void>()
    const deleteGrade = store.deleteGrade

    store.deleteGrade = async (requestId) => {
      await clearing.promise
      await deleteGrade(requestId)
    }

    await enqueueGrade(store, grade)

    const flush = flushQueuedGrades(store, async () => confirmed)

    await vi.waitFor(() => expect(flightFor(store).inFlight).toBe(grade.requestId))

    const undo = undoQueuedGrade(store, async () => confirmed, grade.requestId)

    clearing.resolve()
    await flush

    expect(await undo).toEqual({ kind: 'sent', reviewId: 'server-review-1' })
  })

  it('should not send a grade the learner is already undoing', async () => {
    const store = makeStore()
    const grade = makeGrade()
    const send = vi.fn(async () => confirmed)

    await enqueueGrade(store, grade)

    const undo = undoQueuedGrade(store, send, grade.requestId)

    await flushQueuedGrades(store, send)

    expect(await undo).toEqual({ kind: 'removed' })
    expect(send).not.toHaveBeenCalled()
  })
})
