import { Link } from '@tanstack/react-router'

import type { Curriculum } from './model'

export function SourceApprovalBanner({ curricula }: { curricula: Curriculum[] }) {
  const awaiting = curricula.filter(
    (curriculum) => curriculum.status === 'awaiting_source_approval',
  )

  if (awaiting.length === 0) {
    return null
  }

  return (
    <div
      data-testid="source-approval-banner"
      className="mb-6 rounded-lg border border-violet-200 bg-violet-50 p-4"
    >
      <h2 className="font-semibold text-violet-900">
        {awaiting.length} course{awaiting.length === 1 ? '' : 's'} awaiting source
        approval
      </h2>
      <p className="mt-1 text-sm text-violet-700">
        These courses found their sources but can't start generating until you
        review them.
      </p>
      <ul className="mt-3 space-y-1.5">
        {awaiting.map((curriculum) => (
          <li key={curriculum.id}>
            <Link
              to="/curriculum/$curriculumId"
              params={{ curriculumId: curriculum.id }}
              data-testid="source-approval-banner-link"
              className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
            >
              {curriculum.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
