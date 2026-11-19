// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitReview, undoReview } from '../knowledge-bit/anki-review.api'
import { enqueueGrade, flushQueuedGrades } from './offline-grade-queue'
import { refreshStoredPack } from './review-pack'
import { isOfflineReviewId, submitGradeOrQueue, undoGrade, type GradeSubmission } from './submit-grade-or-queue'
import { confirmed, gatedSend, makeCard, makePack, makeStore, retry } from './test-helpers'

vi.mock('../knowledge-bit/anki-review.api', () => ({ submitReview: vi.fn(), undoReview: vi.fn() }))

const submission: GradeSubmission = {
  variantId: 'variant-1',
  knowledgeBitId: 'bit-1',
  grade: 'good',
  durationMs: 900,
  requestId: '00000000-0000-4000-8000-000000000001',
  tz: 'UTC',
  burySiblings: true,
  rehearsal: false,
}

afterEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('grading with offline queue', () => {
  it('should queue the grade with its key when the request cannot reach the server', async () => {
    const store = makeStore()

    vi.mocked(submitReview).mockRejectedValue(new TypeError('Failed to fetch'))

    const outcome = await submitGradeOrQueue(submission, store)

    expect(outcome.ok && isOfflineReviewId(outcome.reviewId)).toBe(true)
    expect((await store.listGrades()).map((grade) => grade.requestId)).toEqual([submission.requestId])
  })

  it('should report a failure instead of queueing when the error is not a lost connection', async () => {
    const store = makeStore()

    vi.mocked(submitReview).mockRejectedValue(new Error('server exploded'))

    expect(await submitGradeOrQueue(submission, store)).toEqual({ ok: false, error: 'grading_failed' })
    expect(await store.listGrades()).toEqual([])
  })

  it('should never queue rehearsal grades', async () => {
    const store = makeStore()

    vi.mocked(submitReview).mockRejectedValue(new TypeError('Failed to fetch'))

    expect((await submitGradeOrQueue({ ...submission, rehearsal: true }, store)).ok).toBe(false)
    expect(await store.listGrades()).toEqual([])
  })

  it('should mark an online grade on the saved pack and unmark it when undone', async () => {
    const store = makeStore()

    await refreshStoredPack(store, async () => makePack([makeCard('1')]))
    vi.mocked(submitReview).mockResolvedValue({ ok: true, reviewId: 'r1' } as never)
    vi.mocked(undoReview).mockResolvedValue({ ok: true } as never)

    await submitGradeOrQueue(submission, store)

    expect((await store.readPack())?.gradedSince.map((mark) => mark.variantId)).toEqual(['variant-1'])

    await undoGrade('r1', 'variant-1', store)

    expect((await store.readPack())?.gradedSince).toEqual([])
  })

  it('should undo a waiting grade by removing it, and refuse once nothing is known about it', async () => {
    const store = makeStore()

    vi.mocked(submitReview).mockRejectedValue(new TypeError('Failed to fetch'))

    const queued = await submitGradeOrQueue(submission, store)
    const reviewId = queued.ok ? queued.reviewId : ''

    expect((await undoGrade(reviewId, 'variant-1', store)).ok).toBe(true)
    expect(await undoGrade(reviewId, 'variant-1', store)).toEqual({ ok: false, error: 'review_not_found' })
    expect(undoReview).not.toHaveBeenCalled()
  })

  it('should send the normal server undo when the grade finished syncing before the undo', async () => {
    const store = makeStore()

    vi.mocked(submitReview).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(undoReview).mockResolvedValue({ ok: true } as never)

    const queued = await submitGradeOrQueue(submission, store)

    await flushQueuedGrades(store, async () => confirmed)
    await undoGrade(queued.ok ? queued.reviewId : '', 'variant-1', store)

    expect(undoReview).toHaveBeenCalledWith({ data: { reviewId: 'server-review-1' } })
  })

  it('should undo through the server when the undo lands during an in-flight send', async () => {
    const store = makeStore()
    const gate = gatedSend()

    await enqueueGrade(store, { ...submission })
    vi.mocked(undoReview).mockResolvedValue({ ok: true } as never)

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const undo = undoGrade(`offline:${submission.requestId}`, 'variant-1', store, async () => retry)

    gate.resolve(confirmed)
    await flush

    expect((await undo).ok).toBe(true)
    expect(undoReview).toHaveBeenCalledWith({ data: { reviewId: 'server-review-1' } })
  })

  it('should tell the learner the undo is unconfirmed when the server cannot be asked', async () => {
    const store = makeStore()
    const gate = gatedSend()

    await enqueueGrade(store, { ...submission })

    const flush = flushQueuedGrades(store, gate.send)
    await gate.started

    const undo = undoGrade(`offline:${submission.requestId}`, 'variant-1', store, async () => retry)

    gate.resolve(retry)
    await flush

    expect(await undo).toEqual({ ok: false, error: 'undo_unconfirmed' })
    expect(undoReview).not.toHaveBeenCalled()
  })
})
