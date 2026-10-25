import { Link } from '@tanstack/react-router'

import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'
import { BrowserShell } from './knowledge-browser-screen'
import { KnowledgeBrowserSubjectList } from './knowledge-browser-subject-list'

export function KnowledgeSubjectsScreen() {
  return (
    <BrowserShell>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Subjects</h1>
        <div className="flex items-center gap-4">
          <Link to="/knowledge" className="text-sm text-neutral-600 underline">
            Manage cards
          </Link>
          <AddKnowledgeButton />
        </div>
      </div>
      <KnowledgeBrowserSubjectList />
    </BrowserShell>
  )
}
