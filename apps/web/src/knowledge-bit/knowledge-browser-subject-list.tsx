import { Link } from '@tanstack/react-router'
import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'
import type { KnowledgeBitBrowserSubjectCounts } from '@post-anki/shared'

import { CardListLoadError } from './card-list-load-error'
import { useKnowledgeBrowserSubjectCounts } from './use-knowledge-browser-data'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

export const NO_SUBJECT_PARAM = KNOWLEDGE_BIT_BROWSER_NO_SUBJECT

export interface BrowserSubjectEntry {
  id: string
  label: string
  count: number
}

export function buildBrowserSubjectEntries(
  options: { id: string; label: string }[],
  counts: KnowledgeBitBrowserSubjectCounts,
): BrowserSubjectEntry[] {
  const direct = new Map(counts.map((row) => [row.subjectId, row.count]))
  const entries = options.map((option) => ({
    id: option.id,
    label: option.label,
    count: options
      .filter((other) => other.label === option.label || other.label.startsWith(`${option.label} / `))
      .reduce((sum, other) => sum + (direct.get(other.id) ?? 0), 0),
  }))
  const unsorted = direct.get(null) ?? 0

  return [
    ...entries.filter((entry) => entry.count > 0),
    ...(unsorted > 0 ? [{ id: NO_SUBJECT_PARAM, label: 'No subject', count: unsorted }] : []),
  ]
}

export function KnowledgeBrowserSubjectList() {
  const { options } = useKnowledgeOverviewSubjects()
  const data = useKnowledgeBrowserSubjectCounts()

  if (data.isPending) {
    return <p data-testid="knowledge-browser-loading" className="text-neutral-500">Loading…</p>
  }

  if (data.isError) {
    return (
      <CardListLoadError
        testId="knowledge-browser-error"
        retryTestId="knowledge-browser-retry"
        onRetry={data.retry}
      />
    )
  }

  const entries = buildBrowserSubjectEntries(options, data.counts)

  if (entries.length === 0) {
    return <p data-testid="knowledge-browser-empty" className="text-neutral-500">No approved knowledge yet.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-200">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            to="/knowledge/browser"
            search={{ subject: entry.id }}
            data-testid={`knowledge-browser-subject-${entry.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
          >
            <span>{entry.label}</span>
            <span className="text-sm text-neutral-500">{entry.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
