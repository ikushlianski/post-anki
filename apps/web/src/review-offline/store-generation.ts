import type { OfflineReviewStore } from './offline-review-types'

const generations = new WeakMap<OfflineReviewStore, number>()

export function generationOf(store: OfflineReviewStore): number {
  return generations.get(store) ?? 0
}

export function bumpGeneration(store: OfflineReviewStore): void {
  generations.set(store, generationOf(store) + 1)
}

export function isCurrentGeneration(store: OfflineReviewStore, token: number): boolean {
  return generationOf(store) === token
}
