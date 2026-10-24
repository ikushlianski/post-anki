export const PENDING_REVIEW_CHANGED_EVENT = 'pending-review-changed'
export const REVIEW_REFRESH_REQUESTED_EVENT = 'review-refresh-requested'

export function notifyPendingReviewChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_REVIEW_CHANGED_EVENT))
  }
}
