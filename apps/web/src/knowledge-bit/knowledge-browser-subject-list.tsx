import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'
import type { KnowledgeBitBrowserSubjectCounts } from '@post-anki/shared'

import type { Subject } from '../curriculum/model'
import { subjectKindBadge } from '../subject/subject-kind-badge'
import { useLiveSubjects } from '../subject/subject-live-data'
import { CARD_MATURITY_PALETTE } from './card-maturity-palette'
import { CardListLoadError } from './card-list-load-error'
import { SubjectRowActions } from './subject-row-actions'
import { useKnowledgeBrowserSubjectCounts } from './use-knowledge-browser-data'
import { SubjectDragProvider, useSubjectDragRow } from './subject-tree-drag'
import { useSubjectCardCounts } from './use-subject-card-counts'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'
import { SubjectTodayColumns } from './subject-today-columns'
import { useSubjectTodayCounts, type SubjectTodayCounts } from './use-subject-today-counts'

export const NO_SUBJECT_PARAM = KNOWLEDGE_BIT_BROWSER_NO_SUBJECT

export interface BrowserSubjectEntry {
  id: string
  label: string
  count: number
  newCount: number
  learningCount: number
  matureCount: number
}

export function buildBrowserSubjectEntries(
  options: { id: string; label: string }[],
  counts: KnowledgeBitBrowserSubjectCounts,
  cardCounts: ReadonlyMap<string, number> = new Map(),
): BrowserSubjectEntry[] {
  const direct = new Map(counts.map((row) => [row.subjectId, row]))
  const entries = options.map((option) => {
    const row = direct.get(option.id)

    return {
      id: option.id,
      label: option.label,
      count: cardCounts.get(option.id) ?? row?.count ?? 0,
      newCount: row?.newCount ?? 0,
      learningCount: row?.learningCount ?? 0,
      matureCount: row?.matureCount ?? 0,
    }
  })
  const unsorted = direct.get(null)

  return [
    ...entries,
    ...(unsorted && unsorted.count > 0
      ? [
          {
            id: NO_SUBJECT_PARAM,
            label: 'No subject',
            count: unsorted.count,
            newCount: unsorted.newCount,
            learningCount: unsorted.learningCount,
            matureCount: unsorted.matureCount,
          },
        ]
      : []),
  ]
}

export function DepthBar({ entry }: { entry: BrowserSubjectEntry }) {
  const shown = entry.matureCount + entry.learningCount + entry.newCount
  const parts = [
    { key: 'mature', label: 'mature', value: entry.matureCount, color: CARD_MATURITY_PALETTE.mature.fill },
    { key: 'learning', label: 'learning', value: entry.learningCount, color: CARD_MATURITY_PALETTE.learning.fill },
    { key: 'new', label: 'new', value: entry.newCount, color: CARD_MATURITY_PALETTE.new.fill },
  ]
  const title = parts.map((part) => `${part.value} ${part.label}`).join(', ')

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-testid={`knowledge-browser-subject-depth-${entry.id}`}
      className="flex h-2 w-24 shrink-0 overflow-hidden rounded-full bg-neutral-200 sm:w-40"
    >
      {shown > 0
        ? parts.map((part) => (
            <span
              key={part.key}
              data-part={part.key}
              className={part.color}
              style={{ width: `${(part.value / shown) * 100}%` }}
            />
          ))
        : null}
    </span>
  )
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

function SubjectRow({
  node,
  depth,
  subjects,
  today,
}: {
  node: SubjectTreeNode
  depth: number
  subjects: Subject[]
  today: SubjectTodayCounts
}) {
  const [open, setOpen] = useState(false)
  const { entry, children } = node
  const name = entry.label.split(PATH_SEPARATOR).at(-1)
  const drag = useSubjectDragRow(entry.id)
  const movable = entry.id !== NO_SUBJECT_PARAM
  const subject = subjects.find((candidate) => candidate.id === entry.id)
  const kindBadge = subjectKindBadge(subject?.kind)

  return (
    <li ref={movable ? drag.rowRef : undefined} className={drag.isDragging ? 'opacity-40' : ''}>
      <div
        className={`flex items-center hover:bg-neutral-50 ${drag.isOver ? 'bg-neutral-100 ring-2 ring-inset ring-neutral-900' : ''}`}
        style={{ paddingLeft: `${depth * 1.5}rem` }}
      >
        {movable ? (
          <button
            type="button"
            ref={drag.handleRef}
            aria-label={`Move ${name}`}
            title="Drag onto another subject to nest it, or onto the top strip to make it top-level"
            data-testid={`knowledge-browser-subject-drag-${entry.id}`}
            className="flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-400 hover:text-neutral-700"
            {...drag.handleProps}
          >
            ⋮⋮
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
            data-testid={`knowledge-browser-subject-toggle-${entry.id}`}
            onClick={() => setOpen(!open)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-lg text-neutral-600"
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
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{name}</span>
            {kindBadge ? (
              <span
                data-testid="subject-kind-badge"
                title={kindBadge}
                className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500"
              >
                {kindBadge}
              </span>
            ) : null}
          </span>
          <DepthBar entry={entry} />
          <SubjectTodayColumns
            subjectId={entry.id}
            matureCount={entry.matureCount}
            learningCount={entry.learningCount}
            newCount={entry.newCount}
            today={today}
          />
          <span className="w-10 text-right text-sm text-neutral-500">{entry.count}</span>
        </Link>
        {subject ? (
          <span className="shrink-0 pr-2">
            <SubjectRowActions subject={subject} allSubjects={subjects} />
          </span>
        ) : null}
      </div>
      {open && children.length > 0 ? (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {children.map((child) => (
            <SubjectRow key={child.entry.id} node={child} depth={depth + 1} subjects={subjects} today={today} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function toDragNode(node: SubjectTreeNode): { id: string; children: ReturnType<typeof toDragNode>[] } {
  return { id: node.entry.id, children: node.children.map(toDragNode) }
}

function SubjectTree({
  entries,
  subjects,
  today,
}: {
  entries: BrowserSubjectEntry[]
  subjects: Subject[]
  today: SubjectTodayCounts
}) {
  const tree = buildSubjectTree(entries)

  return (
    <SubjectDragProvider nodes={tree.map(toDragNode)}>
      <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-200">
        {tree.map((node) => (
          <SubjectRow key={node.entry.id} node={node} depth={0} subjects={subjects} today={today} />
        ))}
      </ul>
    </SubjectDragProvider>
  )
}

export function KnowledgeBrowserSubjectList() {
  const { options } = useKnowledgeOverviewSubjects()
  const data = useKnowledgeBrowserSubjectCounts()
  const cardCounts = useSubjectCardCounts()
  const subjects = useLiveSubjects() ?? []
  const today = useSubjectTodayCounts()

  if (data.isPending) {
    return <p role="status" data-testid="knowledge-browser-loading" className="text-neutral-500">
        Loading…
      </p>
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

  const entries = buildBrowserSubjectEntries(options, data.counts, cardCounts)

  if (entries.length === 0) {
    return (
      <div data-testid="knowledge-browser-empty" className="space-y-2 text-neutral-500">
        <p>No subjects yet.</p>
        <Link to="/subjects/new" data-testid="knowledge-browser-create-subject" className="font-medium text-indigo-600 hover:underline">
          Create a subject
        </Link>
      </div>
    )
  }

  return <SubjectTree entries={entries} subjects={subjects} today={today} />
}
