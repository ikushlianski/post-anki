import { Link } from '@tanstack/react-router'

export function AddKnowledgeSuccess({
  message,
  backLabel,
  backSubjectId,
}: {
  message: string
  backLabel?: string
  backSubjectId?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <p role="status" data-testid="knowledge-success-message" className="text-green-700">
        {message}
      </p>
      <Link
        to="/knowledge-bit-review"
        data-testid="knowledge-success-review-link"
        className="text-neutral-700 underline"
      >
        Knowledge triage
      </Link>
      {backLabel && backSubjectId && (
        <Link
          to="/subject/$subjectId"
          params={{ subjectId: backSubjectId }}
          data-testid="knowledge-success-back-link"
          className="text-neutral-700 underline"
        >
          Back to {backLabel}
        </Link>
      )}
    </div>
  )
}
