import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'

import {
  buildBrowserSubjectEntries,
  type BrowserSubjectEntry,
} from '../knowledge-bit/knowledge-browser-subject-list'
import { useKnowledgeBrowserSubjectCounts } from '../knowledge-bit/use-knowledge-browser-data'
import { useKnowledgeOverviewSubjects } from '../knowledge-bit/use-knowledge-overview-subjects'

export const SIDEBAR_SUBJECTS_LIMIT = 12

const subjectLinkClass =
  'flex min-h-[44px] items-center rounded-md px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:min-h-0'

export function pickTopLevelSubjects(entries: BrowserSubjectEntry[]): BrowserSubjectEntry[] {
  return entries.filter((entry) => !entry.label.includes(' / ')).slice(0, SIDEBAR_SUBJECTS_LIMIT)
}

export function SidebarSubjects() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? <SidebarSubjectsList /> : null
}

function SidebarSubjectsList() {
  const { options } = useKnowledgeOverviewSubjects()
  const { counts } = useKnowledgeBrowserSubjectCounts()
  const subjects = pickTopLevelSubjects(buildBrowserSubjectEntries(options, counts))

  if (subjects.length === 0) {
    return null
  }

  return (
    <div data-testid="sidebar-subjects" className="flex max-h-60 flex-col gap-1 overflow-y-auto">
      {subjects.map((subject) => (
        <Link
          key={subject.id}
          to="/knowledge/browser"
          search={{ subject: subject.id }}
          className={subjectLinkClass}
          data-testid={`sidebar-subject-${subject.id}`}
        >
          {subject.label}
        </Link>
      ))}
    </div>
  )
}
