import { Link } from '@tanstack/react-router'
import { useState } from 'react'

const navLinkClass =
  'block rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 [&.active]:bg-neutral-900 [&.active]:text-white'

export function Sidebar() {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <nav className="flex flex-col gap-1 p-4">
      <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
        Home
      </Link>

      <Link to="/today" search={{ mode: 'socratic' }} className={navLinkClass}>
        Today
      </Link>

      <Link to="/dashboard" className={navLinkClass}>
        Dashboard
      </Link>

      <Link to="/study-sessions" className={navLinkClass}>
        Sessions
      </Link>

      <Link to="/learning-list" className={navLinkClass}>
        Learning list
      </Link>

      <Link to="/analytics" className={navLinkClass}>
        Analytics
      </Link>

      <Link to="/subjects/new" className={navLinkClass}>
        New subject
      </Link>

      <button
        type="button"
        data-testid="nav-more-toggle"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
        className="mt-2 flex items-center justify-between rounded-md px-3 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        More
        <span aria-hidden="true">{moreOpen ? '−' : '+'}</span>
      </button>

      {moreOpen ? (
        <div data-testid="nav-more-panel" className="flex flex-col gap-1">
          <Link to="/learning-paths" className={navLinkClass}>
            Learning paths
          </Link>

          <Link to="/notes" className={navLinkClass}>
            Notes
          </Link>

          <Link to="/open-questions" className={navLinkClass}>
            Open questions
          </Link>

          <Link to="/milestones" className={navLinkClass}>
            Milestones
          </Link>

          <Link to="/content-library" className={navLinkClass}>
            Content library
          </Link>

          <Link to="/concerns" className={navLinkClass}>
            Concerns
          </Link>

          <Link to="/decide" className={navLinkClass}>
            Decide
          </Link>

          <Link to="/duplicates" className={navLinkClass}>
            Duplicates
          </Link>

          <Link to="/tags" className={navLinkClass}>
            Tags
          </Link>

          <Link to="/admin-settings" className={navLinkClass}>
            Admin
          </Link>

          <Link to="/admin-observability" className={navLinkClass}>
            Admin observability
          </Link>
        </div>
      ) : null}
    </nav>
  )
}
