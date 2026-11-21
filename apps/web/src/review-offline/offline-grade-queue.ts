import type { ReviewGrade } from '@post-anki/shared'

import { noteGraded } from './pack-graded-marks'
import { generationOf, isCurrentGeneration } from './store-generation'
import { flightFor, rememberSent, settleCancelled, type Flight } from './offline-flight'
import {
  isParkedGrade,
  MAX_HARD_FAILURES,
  type OfflineReviewStore,
  type QueuedGrade,
  type SendGrade,
  type SendResult,
} from './offline-review-types'

const CHANGE_EVENT = 'offline-review-grades-changed'
const ENQUEUED_EVENT = 'offline-review-grade-enqueued'
const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 60_000
const MAX_CONSECUTIVE_HARD_FAILURES = 2

export interface NewQueuedGrade {
  requestId: string
  variantId: string
  knowledgeBitId: string
  grade: ReviewGrade
  durationMs: number
  tz: string
  burySiblings: boolean
}

function emit(name: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(name))
  }
}

function listen(name: string, listener: () => void): () => void {
  window.addEventListener(name, listener)

  return () => window.removeEventListener(name, listener)
}

export const notifyQueuedGradesChanged = () => emit(CHANGE_EVENT)
export const onQueuedGradesChanged = (listener: () => void) => listen(CHANGE_EVENT, listener)
export const onGradeEnqueued = (listener: () => void) => listen(ENQUEUED_EVENT, listener)

export function backoffDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempt, 0), MAX_DELAY_MS)
}

export async function enqueueGrade(
  store: OfflineReviewStore,
  input: NewQueuedGrade,
  now = new Date(),
  token = generationOf(store),
): Promise<boolean> {
  if (await store.hasGrade(input.requestId)) {
    return true
  }

  if (!isCurrentGeneration(store, token)) {
    return false
  }

  const durable = await store.putGrade({
    ...input,
    reviewedAt: now.toISOString(),
    createdAt: now.getTime(),
    hardFailures: 0,
  })

  if (!durable) {
    flightFor(store).memoryOnly = true
  }

  notifyQueuedGradesChanged()
  emit(ENQUEUED_EVENT)

  return durable
}

export async function resetParkedGrades(store: OfflineReviewStore): Promise<void> {
  const token = generationOf(store)

  for (const grade of await store.listGrades()) {
    if (isParkedGrade(grade)) {
      await putIfCurrent(store, token, { ...grade, hardFailures: 0 })
    }
  }

  notifyQueuedGradesChanged()
}

export function withoutQueuedGrades<T extends { variantId: string; knowledgeBitId: string }>(
  cards: T[],
  grades: QueuedGrade[],
): T[] {
  if (grades.length === 0) {
    return cards
  }

  const variantIds = new Set(grades.map((grade) => grade.variantId))
  const buriedBitIds = new Set(grades.filter((grade) => grade.burySiblings).map((grade) => grade.knowledgeBitId))

  return cards.filter((card) => !variantIds.has(card.variantId) && !buriedBitIds.has(card.knowledgeBitId))
}

export interface FlushResult {
  confirmed: number
  remaining: number
  parked: number
  blocked: boolean
}

type Attempt = { kind: 'hard' } | { kind: 'done'; result: SendResult }

async function attempt(send: SendGrade, grade: QueuedGrade): Promise<Attempt> {
  try {
    return { kind: 'done', result: await send(grade) }
  } catch {
    return { kind: 'hard' }
  }
}

async function resolveCancelledRetry(store: OfflineReviewStore, flight: Flight, send: SendGrade, grade: QueuedGrade) {
  const again = await attempt(send, grade)

  if (again.kind === 'done' && again.result.outcome === 'confirmed') {
    await store.deleteGrade(grade.requestId)
    settleCancelled(flight, grade.requestId, { kind: 'sent', reviewId: again.result.reviewId })

    return
  }

  if (again.kind === 'done' && again.result.outcome === 'rejected') {
    await store.deleteGrade(grade.requestId)
    settleCancelled(flight, grade.requestId, { kind: 'removed' })

    return
  }

  flight.unconfirmed.add(grade.requestId)
  settleCancelled(flight, grade.requestId, { kind: 'unconfirmed' })
}

async function putIfCurrent(store: OfflineReviewStore, token: number, grade: QueuedGrade): Promise<void> {
  if (isCurrentGeneration(store, token)) {
    await store.putGrade(grade)
  }
}

function leaveFlight(flight: Flight, requestId: string): boolean {
  const wasCancelled = flight.cancelled.delete(requestId)

  flight.inFlight = null

  return wasCancelled
}

async function flushOnce(store: OfflineReviewStore, send: SendGrade): Promise<FlushResult> {
  const flight = flightFor(store)
  let confirmed = 0
  let blocked = false
  let consecutiveHard = 0
  const token = generationOf(store)

  for (const grade of await store.listGrades()) {
    if (isParkedGrade(grade) || flight.undoing.has(grade.requestId)) {
      continue
    }

    flight.inFlight = grade.requestId

    if (!isCurrentGeneration(store, token) || !(await store.hasGrade(grade.requestId))) {
      if (leaveFlight(flight, grade.requestId)) {
        settleCancelled(flight, grade.requestId, { kind: 'removed' })
      }

      continue
    }

    const outcome = await attempt(send, grade)

    if (outcome.kind === 'hard') {
      await putIfCurrent(store, token, { ...grade, hardFailures: grade.hardFailures + 1 })

      if (leaveFlight(flight, grade.requestId)) {
        flight.unconfirmed.add(grade.requestId)
        settleCancelled(flight, grade.requestId, { kind: 'unconfirmed' })
      }

      consecutiveHard += 1
      blocked ||= grade.hardFailures + 1 < MAX_HARD_FAILURES

      if (consecutiveHard >= MAX_CONSECUTIVE_HARD_FAILURES) {
        break
      }

      continue
    }

    consecutiveHard = 0

    if (outcome.result.outcome === 'retry') {
      if (grade.hardFailures > 0) {
        await putIfCurrent(store, token, { ...grade, hardFailures: 0 })
      }

      if (flight.cancelled.has(grade.requestId)) {
        await resolveCancelledRetry(store, flight, send, grade)
      }

      leaveFlight(flight, grade.requestId)
      blocked = true

      break
    }

    await store.deleteGrade(grade.requestId)
    flight.unconfirmed.delete(grade.requestId)

    const { reviewId } = outcome.result
    const isConfirmed = outcome.result.outcome === 'confirmed'

    if (isConfirmed) {
      confirmed += 1
      await noteGraded(store, grade.variantId, grade.knowledgeBitId, Date.now(), token).catch(() => undefined)
    }

    if (leaveFlight(flight, grade.requestId)) {
      settleCancelled(flight, grade.requestId, isConfirmed ? { kind: 'sent', reviewId } : { kind: 'removed' })
    } else if (isConfirmed && reviewId) {
      rememberSent(flight, grade.requestId, reviewId)
    }
  }

  const left = await store.listGrades()

  if (left.length === 0) {
    flight.memoryOnly = false
  }

  notifyQueuedGradesChanged()

  const parked = left.filter(isParkedGrade).length

  return { confirmed, remaining: left.length - parked, parked, blocked }
}

const running = new WeakMap<OfflineReviewStore, Promise<FlushResult>>()

export function flushQueuedGrades(store: OfflineReviewStore, send: SendGrade): Promise<FlushResult> {
  const active = running.get(store)

  if (active) {
    return active
  }

  const started = flushOnce(store, send).finally(() => running.delete(store))

  running.set(store, started)

  return started
}
