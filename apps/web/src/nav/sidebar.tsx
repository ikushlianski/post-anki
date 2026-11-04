import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { browserTimeZone } from '../shared/browser-time-zone'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { useChatQueueCount } from '../chat-queue/use-chat-queue-count'
import { getPendingKnowledgeBitCountForNav } from '../knowledge-bit/knowledge-bit-review.api'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'
import { useDueTabTitle } from './use-due-tab-title'
import {
  AdminSettingsIcon,
  ChatQueueIcon,
  InboxDeckIcon,
  KnowledgeBrowserIcon,
  NotionSourcesIcon,
  OverviewIcon,
  ReviewIcon,
  SourcesIcon,
  StatisticsIcon,
  SubjectsIcon,
  TriageIcon,
} from './nav-icons'

const PENDING_COUNT_REFRESH_MS = 60_000

interface TriageCounts {
  pending: number
  attention: number
  inbox: number
}

function usePendingReviewCount(): TriageCounts | null {
  const [count, setCount] = useState<TriageCounts | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const result = await getPendingKnowledgeBitCountForNav()

        if (active) {
          setCount({
            pending: result.count,
            attention: result.attentionCount ?? 0,
            inbox: result.inboxCount ?? 0,
          })
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
  const { count: chatCount, stale: chatCountStale } = useChatQueueCount()

  useDueTabTitle(reviewCounts ? reviewCounts.due : null)

  return (
    <nav className="flex min-h-full flex-1 flex-col gap-1 p-4">
      <AddKnowledgeButton className="mb-2" />
      <Link
        to="/"
        activeOptions={{ exact: true }}
        className={navLinkClass}
        data-testid="nav-overview"
      >
        <OverviewIcon />
        Overview
      </Link>
      <Link
        to="/knowledge/browser"
        className={navLinkClass}
        data-testid="nav-knowledge-browser"
      >
        <KnowledgeBrowserIcon />
        All cards
      </Link>
      <Link
        to="/subjects"
        className={navLinkClass}
        data-testid="nav-subjects"
      >
        <SubjectsIcon />
        Subjects
      </Link>
      <Link
        to="/knowledge-bit-review"
        className={navLinkClass}
        data-testid="nav-knowledge-bit-review"
      >
        <TriageIcon />
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
      <Link
        to="/knowledge/inbox"
        className={navLinkClass}
        data-testid="nav-knowledge-inbox"
        title="Cards you set aside during triage, to come back to later"
      >
        <InboxDeckIcon />
        {pendingCount === null ? 'Set aside' : `Set aside (${pendingCount.inbox})`}
      </Link>
      <Link to="/knowledge/chat" className={navLinkClass} data-testid="nav-knowledge-chat">
        <ChatQueueIcon />
        Chat
        {chatCount !== null && chatCount > 0 ? (
          <span
            role="img"
            aria-label={`${chatCount} ${chatCount === 1 ? 'card' : 'cards'} waiting in Chat${chatCountStale ? ' (may be out of date)' : ''}`}
            title={chatCountStale ? 'Could not refresh; this count may be out of date' : undefined}
            data-testid="nav-knowledge-chat-badge"
            className="ml-2 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white"
          >
            {chatCount > 99 ? '99+' : chatCount}
            {chatCountStale ? '?' : ''}
          </span>
        ) : null}
      </Link>
      <Link to="/knowledge/review" className={navLinkClass} data-testid="nav-knowledge-review">
        <ReviewIcon />
        {reviewCounts !== null && (reviewCounts.due > 0 || reviewCounts.new > 0)
          ? `Review (${[reviewCounts.due > 0 ? `${reviewCounts.due} due` : '', reviewCounts.new > 0 ? `${reviewCounts.new} new` : ''].filter(Boolean).join(' · ')})`
          : 'Review'}
      </Link>
      <Link to="/statistics" className={navLinkClass} data-testid="nav-statistics">
        <StatisticsIcon />
        Statistics
      </Link>
      <Link to="/notion-sources" className={navLinkClass} data-testid="nav-notion-sources">
        <NotionSourcesIcon />
        Notion sources
      </Link>
      <Link to="/sources" className={navLinkClass} data-testid="nav-sources">
        <SourcesIcon />
        Sources
      </Link>
      <div className="mt-auto border-t border-neutral-200 pt-2">
        <Link to="/admin-settings" className={navLinkClass} data-testid="nav-admin-settings">
          <AdminSettingsIcon />
          Admin settings
        </Link>
      </div>
    </nav>
  )
}
