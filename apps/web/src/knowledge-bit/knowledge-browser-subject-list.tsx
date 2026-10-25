import { useState } from 'react'
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
      .filter((other) => other.label === option.label || other.label.startsWith(`${option.label} › `))
      .reduce((sum, other) => sum + (direct.get(other.id) ?? 0), 0),
  }))
  const unsorted = direct.get(null) ?? 0

  return [
    ...entries,
    ...(unsorted > 0 ? [{ id: NO_SUBJECT_PARAM, label: 'No subject', count: unsorted }] : []),
  ]
}

const PATH_SEPARATOR = ' › '

export interface SubjectTreeNode {
  entry: BrowserSubjectEntry
  children: SubjectTreeNode[]
}

export function buildSubjectTree(entries: BrowserSubjectEntry[]): SubjectTreeNode[] {
  const nodes = new Map(entries.map((entry) => [entry.label, { entry, children: [] as SubjectTreeNode[] }]))
  const roots: SubjectTreeNode[] = []

  for (const node of nodes.values()) {
    const cut = node.entry.label.lastIndexOf(PATH_SEPARATOR)
    const parent = cut > 0 ? nodes.get(node.entry.label.slice(0, cut)) : undefined

    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function SubjectRow({ node, depth }: { node: SubjectTreeNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const { entry, children } = node
  const name = entry.label.split(PATH_SEPARATOR).at(-1)

  return (
    <li>
      <div className="flex items-center hover:bg-neutral-50" style={{ paddingLeft: `${depth * 1.5}rem` }}>
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
            data-testid={`knowledge-browser-subject-toggle-${entry.id}`}
            onClick={() => setOpen(!open)}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-lg text-neutral-600"
          >
            {open ? '−' : '+'}
          </button>
        ) : (
          <span className="w-10 shrink-0" />
        )}
        <Link
          to="/knowledge/browser"
          search={{ subject: entry.id }}
          data-testid={`knowledge-browser-subject-${entry.id}`}
          className="flex flex-1 items-center justify-between gap-3 py-3 pr-4"
        >
          <span>{name}</span>
          <span className="text-sm text-neutral-500">{entry.count}</span>
        </Link>
      </div>
      {open && children.length > 0 ? (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {children.map((child) => (
            <SubjectRow key={child.entry.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function SubjectTree({ entries }: { entries: BrowserSubjectEntry[] }) {
  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-200">
      {buildSubjectTree(entries).map((node) => (
        <SubjectRow key={node.entry.id} node={node} depth={0} />
      ))}
    </ul>
  )
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
    return <p data-testid="knowledge-browser-empty" className="text-neutral-500">No subjects yet.</p>
  }

  return <SubjectTree entries={entries} />
}
