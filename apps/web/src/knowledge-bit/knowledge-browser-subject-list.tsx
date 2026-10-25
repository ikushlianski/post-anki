import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'
import type { KnowledgeBitBrowserSubjectCounts } from '@post-anki/shared'

import { CardListLoadError } from './card-list-load-error'
import { useKnowledgeBrowserSubjectCounts } from './use-knowledge-browser-data'
import { SubjectDragProvider, useSubjectDragRow } from './subject-tree-drag'
import { useKnowledgeOverviewSubjects } from './use-knowledge-overview-subjects'

export const NO_SUBJECT_PARAM = KNOWLEDGE_BIT_BROWSER_NO_SUBJECT

export interface BrowserSubjectEntry {
  id: string
  label: string
  count: number
  newCount: number
  learningCount: number
  matureCount: number
}

type CountField = 'count' | 'newCount' | 'learningCount' | 'matureCount'

function sumOf(rows: (KnowledgeBitBrowserSubjectCounts[number] | undefined)[], field: CountField): number {
  return rows.reduce((sum, row) => sum + (row?.[field] ?? 0), 0)
}

export function buildBrowserSubjectEntries(
  options: { id: string; label: string }[],
  counts: KnowledgeBitBrowserSubjectCounts,
): BrowserSubjectEntry[] {
  const direct = new Map(counts.map((row) => [row.subjectId, row]))
  const entries = options.map((option) => {
    const group = options
      .filter((other) => other.label === option.label || other.label.startsWith(`${option.label} › `))
      .map((other) => direct.get(other.id))

    return {
      id: option.id,
      label: option.label,
      count: sumOf(group, 'count'),
      newCount: sumOf(group, 'newCount'),
      learningCount: sumOf(group, 'learningCount'),
      matureCount: sumOf(group, 'matureCount'),
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
  const parts = [
    { key: 'mature', label: 'mature', value: entry.matureCount, color: 'bg-emerald-500' },
    { key: 'learning', label: 'learning', value: entry.learningCount, color: 'bg-amber-400' },
    { key: 'new', label: 'new', value: entry.newCount, color: 'bg-sky-400' },
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
      {entry.count > 0
        ? parts.map((part) => (
            <span
              key={part.key}
              data-part={part.key}
              className={part.color}
              style={{ width: `${(part.value / entry.count) * 100}%` }}
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

function SubjectRow({ node, depth }: { node: SubjectTreeNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const { entry, children } = node
  const name = entry.label.split(PATH_SEPARATOR).at(-1)
  const drag = useSubjectDragRow(entry.id)
  const movable = entry.id !== NO_SUBJECT_PARAM

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
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <DepthBar entry={entry} />
          <span className="w-10 text-right text-sm text-neutral-500">{entry.count}</span>
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

function toDragNode(node: SubjectTreeNode): { id: string; children: ReturnType<typeof toDragNode>[] } {
  return { id: node.entry.id, children: node.children.map(toDragNode) }
}

function SubjectTree({ entries }: { entries: BrowserSubjectEntry[] }) {
  const tree = buildSubjectTree(entries)

  return (
    <SubjectDragProvider nodes={tree.map(toDragNode)}>
      <ul className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-200">
        {tree.map((node) => (
          <SubjectRow key={node.entry.id} node={node} depth={0} />
        ))}
      </ul>
    </SubjectDragProvider>
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
