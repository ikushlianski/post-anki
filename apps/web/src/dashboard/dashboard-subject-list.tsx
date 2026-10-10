import { Link } from '@tanstack/react-router'
import { GripVertical } from 'lucide-react'

import { compareSubjectSiblings } from '@post-anki/core'
import type { Curriculum, Subject } from '../curriculum/model'
import { SubjectRowMenu } from './subject-row-menu'
import { siblingSetKey, SortableSubjectGroup } from './sortable-subject-group'
import type { SortableRowHandle } from './sortable-subject-group'
import { useExpandedSubjects } from './subject-expansion'
import type { ExpandedSubjects } from './subject-expansion'

export interface DashboardSubjectListProps {
  subjects: Subject[]
  curricula: Curriculum[]
  onRenameSubject: (subjectId: string, name: string) => Promise<boolean>
  onDeleteSubject: (subjectId: string) => Promise<boolean>
  onCreateSubSubject: (parentId: string, name: string) => Promise<boolean>
  onMoveSubject: (subjectId: string, parentId: string | null) => Promise<boolean>
  onSubjectOrderSaved?: () => void
}

export interface SubjectTreeNode {
  subject: Subject
  children: SubjectTreeNode[]
}

// Children sit under their parent, sorted by name. A subject whose parent is missing from
// the list is shown at the top level; subjects caught in a parent cycle are still listed.
export function buildSubjectTree(subjects: Subject[]): SubjectTreeNode[] {
  const ids = new Set(subjects.map((subject) => subject.id))
  const childrenOf = new Map<string | null, Subject[]>()

  for (const subject of subjects) {
    const parentKey =
      subject.parentId !== null && subject.parentId !== subject.id && ids.has(subject.parentId)
        ? subject.parentId
        : null

    childrenOf.set(parentKey, [...(childrenOf.get(parentKey) ?? []), subject])
  }

  for (const group of childrenOf.values()) {
    group.sort(compareSubjectSiblings)
  }

  const placed = new Set<string>()

  function toNode(subject: Subject): SubjectTreeNode {
    placed.add(subject.id)

    const children = (childrenOf.get(subject.id) ?? []).filter((child) => !placed.has(child.id))

    return { subject, children: children.map(toNode) }
  }

  const roots = (childrenOf.get(null) ?? []).map(toNode)

  for (const subject of subjects) {
    if (!placed.has(subject.id)) {
      roots.push(toNode(subject))
    }
  }

  return roots
}

interface ListContext {
  subjects: Subject[]
  curricula: Curriculum[]
  expanded: ExpandedSubjects
  onToggle: (subjectId: string) => void
  onRenameSubject: DashboardSubjectListProps['onRenameSubject']
  onDeleteSubject: DashboardSubjectListProps['onDeleteSubject']
  onCreateSubSubject: DashboardSubjectListProps['onCreateSubSubject']
  onMoveSubject: DashboardSubjectListProps['onMoveSubject']
  onOrderSaved?: () => void
}

export function DashboardSubjectList({
  subjects,
  curricula,
  onRenameSubject,
  onDeleteSubject,
  onCreateSubSubject,
  onMoveSubject,
  onSubjectOrderSaved,
}: DashboardSubjectListProps) {
  const { expanded, toggle } = useExpandedSubjects()

  if (subjects.length === 0) {
    return (
      <div data-testid="home-empty-state" className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
        <p className="text-neutral-600">
          You haven't created a subject yet.{' '}
          <Link to="/subjects/new" className="font-medium text-indigo-600 hover:text-indigo-700">
            Create your first subject
          </Link>
        </p>
      </div>
    )
  }

  const context: ListContext = {
    subjects,
    curricula,
    expanded,
    onToggle: toggle,
    onRenameSubject,
    onDeleteSubject,
    onCreateSubSubject,
    onMoveSubject,
    onOrderSaved: onSubjectOrderSaved,
  }

  return <SubjectSiblingGroup nodes={buildSubjectTree(subjects)} parentId={null} depth={0} context={context} />
}

function SubjectSiblingGroup({
  nodes,
  parentId,
  depth,
  context,
}: {
  nodes: SubjectTreeNode[]
  parentId: string | null
  depth: number
  context: ListContext
}) {
  const nodeById = new Map(nodes.map((node) => [node.subject.id, node]))
  const siblings = nodes.map((node) => node.subject)

  return (
    <SortableSubjectGroup
      key={siblingSetKey(siblings)}
      parentId={parentId}
      siblings={siblings}
      onOrderSaved={context.onOrderSaved}
      renderRow={(subject, handle) => {
        const node = nodeById.get(subject.id)

        return node ? (
          <SubjectTreeItem node={node} depth={depth} context={context} handle={handle} />
        ) : null
      }}
    />
  )
}

function subjectCountLabel(count: number): string {
  return `${count} sub-subject${count === 1 ? '' : 's'}`
}

function SubjectTreeItem({
  node,
  depth,
  context,
  handle,
}: {
  node: SubjectTreeNode
  depth: number
  context: ListContext
  handle: SortableRowHandle
}) {
  const { subject, children } = node
  const hasChildren = children.length > 0
  const isExpanded = context.expanded[subject.id] === true
  const childrenId = `subject-children-${subject.id}`
  const subjectCurricula = context.curricula.filter((c) => c.subjectId === subject.id)

  return (
    <li
      ref={handle.rowRef}
      style={handle.rowStyle}
      data-depth={depth}
      className={handle.isDragging ? 'opacity-60' : undefined}
    >
      <div className="relative flex items-stretch rounded-lg border border-neutral-200 bg-white hover:border-neutral-400">
        <button
          type="button"
          aria-label="Drag to reorder"
          data-testid={`subject-drag-handle-${subject.id}`}
          className="flex w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-l-lg text-neutral-400 hover:text-neutral-700 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          {...handle.attributes}
          {...handle.listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>

        {hasChildren ? (
          <button
            type="button"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${subject.name}`}
            aria-expanded={isExpanded}
            aria-controls={childrenId}
            data-testid={`subject-toggle-${subject.id}`}
            onClick={() => context.onToggle(subject.id)}
            className="flex w-8 shrink-0 items-center justify-center rounded-l-lg text-neutral-400 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
          </button>
        ) : null}

        <Link
          to="/subject/$subjectId"
          params={{ subjectId: subject.id }}
          data-testid="subject-name"
          className={`flex flex-1 items-center justify-between py-3 pr-14 ${hasChildren ? 'pl-1' : 'pl-4'}`}
        >
          <span className="font-medium tracking-tight">{subject.name}</span>
          <span className="flex items-center gap-3 text-sm text-neutral-400">
            {hasChildren && !isExpanded ? (
              <span data-testid={`subject-children-count-${subject.id}`}>
                {subjectCountLabel(children.length)}
              </span>
            ) : null}
            <span>
              {subjectCurricula.length === 0
                ? 'No curricula yet'
                : `${subjectCurricula.length} curricul${subjectCurricula.length === 1 ? 'um' : 'a'}`}
            </span>
          </span>
        </Link>

        <div className="absolute right-2 top-2">
          <SubjectRowMenu
            subject={subject}
            allSubjects={context.subjects}
            onRename={context.onRenameSubject}
            onDelete={context.onDeleteSubject}
            onCreateSubSubject={context.onCreateSubSubject}
            onMoveSubject={context.onMoveSubject}
          />
        </div>
      </div>

      {hasChildren ? (
        <div id={childrenId} hidden={!isExpanded} className="mt-2 pl-6">
          {isExpanded ? (
            <SubjectSiblingGroup
              nodes={children}
              parentId={subject.id}
              depth={depth + 1}
              context={context}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
