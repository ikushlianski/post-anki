import { createIndexedDbOfflineStore } from './indexeddb-offline-store'
import { createMemoryOfflineStore } from './memory-offline-store'
import { createSafeOfflineStore } from './safe-offline-store'
import type { OfflineReviewStore } from './offline-review-types'

let shared: OfflineReviewStore | null = null

export function getOfflineStore(): OfflineReviewStore {
  if (shared) {
    return shared
  }

  let primary = createMemoryOfflineStore()

  try {
    if (typeof indexedDB !== 'undefined') {
      primary = createIndexedDbOfflineStore(indexedDB)
    }
  } catch {
    primary = createMemoryOfflineStore()
  }

  shared = createSafeOfflineStore(primary)

  return shared
}
