import type { GradedMark, OfflineReviewStore, StoredPack } from './offline-review-types'

export const GRADED_MARK_LIFETIME_MS = 3_600_000

async function rewrite(store: OfflineReviewStore, change: (marks: GradedMark[]) => GradedMark[]): Promise<void> {
  const stored = await store.readPack()

  if (!stored) {
    return
  }

  await store.writePack({ savedAt: stored.savedAt, pack: stored.pack, gradedSince: change(stored.gradedSince) })
}

export function noteGraded(store: OfflineReviewStore, variantId: string, bitId: string, now = Date.now()) {
  return rewrite(store, (marks) => [...marks.filter((mark) => mark.variantId !== variantId), { variantId, bitId, at: now }])
}

export function unmarkGraded(store: OfflineReviewStore, variantId: string) {
  return rewrite(store, (marks) => marks.filter((mark) => mark.variantId !== variantId))
}

export function carriedMarks(stored: StoredPack | null, now = Date.now()): GradedMark[] {
  return (stored?.gradedSince ?? []).filter((mark) => mark.at > now - GRADED_MARK_LIFETIME_MS)
}
