import type { OfflineReviewStore } from './offline-review-types'

const SENT_HISTORY_LIMIT = 50

export type CancelledOutcome =
  | { kind: 'sent'; reviewId?: string }
  | { kind: 'removed' }
  | { kind: 'unconfirmed' }

export interface Flight {
  inFlight: string | null
  cancelled: Set<string>
  unconfirmed: Set<string>
  undoing: Set<string>
  sent: Map<string, string>
  waiters: Map<string, Array<(outcome: CancelledOutcome) => void>>
  memoryOnly: boolean
}

const flights = new WeakMap<OfflineReviewStore, Flight>()

export function flightFor(store: OfflineReviewStore): Flight {
  let flight = flights.get(store)

  if (!flight) {
    flight = {
      inFlight: null,
      cancelled: new Set(),
      unconfirmed: new Set(),
      undoing: new Set(),
      sent: new Map(),
      waiters: new Map(),
      memoryOnly: false,
    }
    flights.set(store, flight)
  }

  return flight
}

export function resetFlight(store: OfflineReviewStore): void {
  flights.delete(store)
}

export function rememberSent(flight: Flight, requestId: string, reviewId: string): void {
  flight.sent.set(requestId, reviewId)

  if (flight.sent.size > SENT_HISTORY_LIMIT) {
    const oldest = flight.sent.keys().next().value

    if (oldest !== undefined) {
      flight.sent.delete(oldest)
    }
  }
}

export function settleCancelled(flight: Flight, requestId: string, outcome: CancelledOutcome): void {
  const waiting = flight.waiters.get(requestId) ?? []

  flight.waiters.delete(requestId)

  for (const resolve of waiting) {
    resolve(outcome)
  }
}

export function waitForCancelled(flight: Flight, requestId: string): Promise<CancelledOutcome> {
  return new Promise((resolve) => {
    flight.waiters.set(requestId, [...(flight.waiters.get(requestId) ?? []), resolve])
  })
}
