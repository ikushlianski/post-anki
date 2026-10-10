import { SubjectReviewLink } from './subject-review-link'

export interface SubjectDueSummaryProps {
  subjectId: string
  dueCount: number
}

// Due count for a subject card, rolled up over its sub-subjects; Review only appears when something is due.
export function SubjectDueSummary({ subjectId, dueCount }: SubjectDueSummaryProps) {
  return (
    <div className="absolute right-12 top-1/2 flex -translate-y-1/2 items-center gap-2 text-sm">
      <span data-testid={`subject-due-count-${subjectId}`} className="text-neutral-500">
        {dueCount} due
      </span>
      {dueCount > 0 ? (
        <SubjectReviewLink
          subjectId={subjectId}
          testId={`subject-review-${subjectId}`}
          className="rounded-md border border-indigo-200 px-2 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Review
        </SubjectReviewLink>
      ) : null}
    </div>
  )
}
