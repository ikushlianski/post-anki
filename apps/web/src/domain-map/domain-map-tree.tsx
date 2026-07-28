import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { DepthLevel, DomainNodeTreeItem } from '@post-anki/shared'
import { domainPriorityDistance } from '@post-anki/core'

import { CreateCurriculumForm } from '../curriculum/create-curriculum-form'
import { TargetDepthControl } from './target-depth-control'

export function DomainMapTree({
  subjectId,
  nodes,
  requireSources,
}: {
  subjectId: string
  nodes: DomainNodeTreeItem[]
  requireSources: boolean
}) {
  return (
    <div data-testid="domain-map-tree" className="space-y-3">
      {nodes.map((node) => (
        <DomainMapNode
          key={node.id}
          subjectId={subjectId}
          node={node}
          requireSources={requireSources}
          depth={0}
        />
      ))}
    </div>
  )
}

function DomainMapNode({
  subjectId,
  node,
  requireSources,
  depth,
}: {
  subjectId: string
  node: DomainNodeTreeItem
  requireSources: boolean
  depth: number
}) {
  const [targetDepth, setTargetDepth] = useState<DepthLevel | null>(node.targetDepth)
  const priorityDistance = domainPriorityDistance(targetDepth, node.percent)

  return (
    <div
      data-testid={`domain-map-node-${node.id}`}
      style={{ marginLeft: depth * 16 }}
      className="rounded-lg border border-neutral-200 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{node.name}</span>
        <div className="flex items-center gap-2">
          <span
            data-testid={`domain-map-node-percent-${node.id}`}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
          >
            {node.percent}%
          </span>
          {priorityDistance !== null ? (
            <span
              data-testid={`domain-map-node-priority-distance-${node.id}`}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
            >
              {priorityDistance} to target
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        <TargetDepthControl nodeId={node.id} targetDepth={targetDepth} onChanged={setTargetDepth} />
      </div>

      {node.description ? (
        <p className="mt-1 text-xs text-neutral-400">{node.description}</p>
      ) : null}

      {node.curricula.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {node.curricula.map((curriculum) => (
            <li key={curriculum.id}>
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: curriculum.id }}
                data-testid={`domain-node-curriculum-${curriculum.id}`}
                className="text-sm text-neutral-700 hover:underline"
              >
                {curriculum.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2">
        <CreateCurriculumForm
          subjectId={subjectId}
          requireSources={requireSources}
          domainNodeId={node.id}
          toggleLabel="add course here"
          toggleTestId={`domain-map-add-course-${node.id}`}
        />
      </div>

      {node.children.length > 0 ? (
        <div className="mt-3 space-y-2">
          {node.children.map((child) => (
            <DomainMapNode
              key={child.id}
              subjectId={subjectId}
              node={child}
              requireSources={requireSources}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
