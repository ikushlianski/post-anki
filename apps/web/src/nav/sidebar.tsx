import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { browserTimeZone } from '../knowledge-bit/anki-review-session-actions'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { getPendingKnowledgeBitCountForNav } from '../knowledge-bit/knowledge-bit-review.api'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'
import { SignOutButton } from '../web-auth/sign-out-button'

const PENDING_COUNT_REFRESH_MS = 60_000

interface TriageCounts {
  pending: number
  attention: number
}

function usePendingReviewCount(): TriageCounts | null {
  const [count, setCount] = useState<TriageCounts | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const result = await getPendingKnowledgeBitCountForNav()

        if (active) {
          setCount({ pending: result.count, attention: result.attentionCount ?? 0 })
        }
      } catch {
        // Badge is optional; keep the last known count.
      }
    }

    void load()

    const timer = setInterval(() => void load(), PENDING_COUNT_REFRESH_MS)

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, load)

    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, load)
    }
  }, [])

  return count
}

interface ReviewCounts {
  due: number
  new: number
}

function useReviewCounts(): ReviewCounts | null {
  const [counts, setCounts] = useState<ReviewCounts | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    let active = true

    async function load() {
      const requestId = ++latestRequest.current

      try {
        const data = await getSubjectReviewDueCounts({ data: { tz: browserTimeZone() } })
        const due =
          data.subjects.reduce((acc, s) => acc + s.dueCount, 0) +
          data.unsorted.dueCount
        const newCount = data.newRemainingToday

        if (active && requestId === latestRequest.current) {
          setCounts({ due, new: newCount })
        }
      } catch {
        // Keep the last known counts when a refresh fails.
      }
    }

    void load()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, load)

    return () => {
      active = false
      window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, load)
    }
  }, [])

  return counts
}

const navLinkClass =
  'flex min-h-[44px] items-center rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:min-h-0 [&.active]:bg-neutral-900 [&.active]:text-white'

export function Sidebar() {
  const pendingCount = usePendingReviewCount()
  const reviewCounts = useReviewCounts()

  return (
    <nav className="flex flex-col gap-1 p-4">
      <AddKnowledgeButton className="mb-2" />
      <Link
        to="/knowledge/browser"
        className={navLinkClass}
        data-testid="nav-knowledge-browser"
      >
        Knowledge browser
      </Link>
      <Link
        to="/knowledge/browser"
        search={{ view: 'subjects' }}
        className={navLinkClass}
        data-testid="nav-subjects"
      >
        Subjects
      </Link>
      <Link
        to="/knowledge-bit-review"
        className={navLinkClass}
        data-testid="nav-knowledge-bit-review"
      >
        {pendingCount === null
          ? 'Knowledge triage'
          : `Knowledge triage (${pendingCount.pending + pendingCount.attention})`}
        {pendingCount !== null && pendingCount.attention > 0 ? (
          <span
            role="img"
            aria-label="Some notes need attention"
            title="Some notes need attention"
            data-testid="nav-knowledge-bit-review-attention-dot"
            className="ml-2 inline-block size-2 shrink-0 rounded-full bg-amber-500"
          />
        ) : null}
      </Link>
      <Link to="/knowledge/review" className={navLinkClass} data-testid="nav-knowledge-review">
        {reviewCounts !== null && (reviewCounts.due > 0 || reviewCounts.new > 0)
          ? `Review (${[reviewCounts.due > 0 ? `${reviewCounts.due} due` : '', reviewCounts.new > 0 ? `${reviewCounts.new} new` : ''].filter(Boolean).join(' · ')})`
          : 'Review'}
      </Link>
      <Link to="/profile" className={navLinkClass} data-testid="nav-profile">
        Profile
      </Link>
      <SignOutButton className={`${navLinkClass} w-full text-left`} />
    </nav>
  )
}
