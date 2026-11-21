import { generationOf, isCurrentGeneration } from './store-generation'
import type { GradedMark, OfflineReviewStore, StoredPack } from './offline-review-types'

export const GRADED_MARK_LIFETIME_MS = 3_600_000

const locks = new WeakMap<OfflineReviewStore, Promise<unknown>>()

export function withPackLock<T>(store: OfflineReviewStore, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(store) ?? Promise.resolve()
  const next = previous.then(work, work)

  locks.set(
    store,
    next.catch(() => undefined),
  )

  return next
}

function rewrite(
  store: OfflineReviewStore,
  change: (marks: GradedMark[]) => GradedMark[],
  token = generationOf(store),
): Promise<void> {
  return withPackLock(store, async () => {
    const stored = await store.readPack()

    if (!stored || !isCurrentGeneration(store, token)) {
      return
    }

    await store.writePack({ savedAt: stored.savedAt, pack: stored.pack, gradedSince: change(stored.gradedSince) })
  })
}

export function noteGraded(
  store: OfflineReviewStore,
  variantId: string,
  bitId: string,
  now = Date.now(),
  token = generationOf(store),
) {
  return rewrite(
    store,
    (marks) => [...marks.filter((mark) => mark.variantId !== variantId), { variantId, bitId, at: now }],
    token,
  )
}

export function unmarkGraded(store: OfflineReviewStore, variantId: string) {
  return rewrite(store, (marks) => marks.filter((mark) => mark.variantId !== variantId))
}

export function carriedMarks(stored: StoredPack | null, now = Date.now()): GradedMark[] {
  return (stored?.gradedSince ?? []).filter((mark) => mark.at > now - GRADED_MARK_LIFETIME_MS)
}
