import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'

import { curriculaCollection } from '../curriculum/board.collection'

const navLinkClass =
  'block rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 [&.active]:bg-neutral-900 [&.active]:text-white'

export function Sidebar() {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
        <span className="flex items-center justify-between gap-2">
          Dashboard
          <ApprovalCountBadge />
        </span>
      </Link>
      <Link to="/knowledge/answer" className={navLinkClass} data-testid="nav-knowledge-answer">
        Answer knowledge bits
      </Link>
      <Link to="/add-knowledge" className={navLinkClass} data-testid="nav-add-knowledge">
        Add knowledge
      </Link>
    </nav>
  )
}

function ApprovalCountBadge() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return null
  }

  return <ApprovalCountBadgeLive />
}

function ApprovalCountBadgeLive() {
  const { data } = useLiveQuery(
    (q) => q.from({ curriculum: curriculaCollection }),
    [],
  )
  const count = (data ?? []).filter(
    (row) => row.status === 'awaiting_source_approval',
  ).length

  if (count === 0) {
    return null
  }

  return (
    <span
      data-testid="dashboard-approval-count"
      className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700"
    >
      {count}
    </span>
  )
}
