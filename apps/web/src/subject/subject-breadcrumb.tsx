import { Link } from '@tanstack/react-router'

type SubjectNode = { id: string; name: string; parentId: string | null }

export function subjectAncestors(subjects: SubjectNode[], subjectId: string): SubjectNode[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const chain: SubjectNode[] = []
  const seen = new Set<string>([subjectId])
  let parentId = byId.get(subjectId)?.parentId ?? null

  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId)

    if (!parent) {
      break
    }

    seen.add(parent.id)
    chain.unshift(parent)
    parentId = parent.parentId
  }

  return chain
}

export function SubjectBreadcrumb({
  subjects,
  subjectId,
}: {
  subjects: SubjectNode[]
  subjectId: string
}) {
  const ancestors = subjectAncestors(subjects, subjectId)

  if (ancestors.length === 0) {
    return null
  }

  return (
    <nav aria-label="Parent subjects" className="mt-2 text-sm text-neutral-500" data-testid="subject-breadcrumb">
      {ancestors.map((ancestor, index) => (
        <span key={ancestor.id}>
          {index > 0 ? ' › ' : null}
          <Link
            to="/subject/$subjectId"
            params={{ subjectId: ancestor.id }}
            className="hover:text-neutral-900"
          >
            {ancestor.name}
          </Link>
        </span>
      ))}
    </nav>
  )
}
