import { getOfflineStore } from './default-offline-store'
import { resetFlight } from './offline-flight'
import { notifyQueuedGradesChanged } from './offline-grade-queue'
import type { OfflineReviewStore } from './offline-review-types'
import { bumpGeneration } from './store-generation'

export async function clearOfflineStore(store: OfflineReviewStore = getOfflineStore()): Promise<void> {
  bumpGeneration(store)
  resetFlight(store)

  try {
    await store.clear()
  } finally {
    notifyQueuedGradesChanged()
  }
}
