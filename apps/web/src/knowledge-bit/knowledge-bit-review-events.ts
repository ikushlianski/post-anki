export const PENDING_REVIEW_CHANGED_EVENT = 'pending-review-changed'

export function notifyPendingReviewChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
  }
}
