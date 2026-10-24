import { useState } from 'react'

export interface Announcement {
  polite: string
  assertive: string
}

interface KnowledgeBitReviewAnnouncerProps {
  announcement: Announcement
}

export function KnowledgeBitReviewAnnouncer({ announcement }: KnowledgeBitReviewAnnouncerProps) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="knowledge-bit-review-announcer-polite"
        className="sr-only"
      >
        {announcement.polite}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="knowledge-bit-review-announcer-assertive"
        className="sr-only"
      >
        {announcement.assertive}
      </div>
    </>
  )
}

export function useReviewAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement>({ polite: '', assertive: '' })

  function announce(kind: 'polite' | 'assertive', text: string) {
    setAnnouncement((prev) => ({ ...prev, [kind]: text }))
  }

  return { announcement, announce }
}
