import { Link } from '@tanstack/react-router'

export function KnowledgeBitReviewEmptyState() {
  return (
    <div data-testid="knowledge-bit-review-empty-state" className="space-y-1 text-sm text-neutral-600">
      <p className="font-medium text-neutral-900">No pending knowledge bits. Everything is decided.</p>
      <p>
        <Link to="/add-knowledge" className="text-indigo-600 underline hover:text-indigo-700">
          Add knowledge
        </Link>{' '}
        to get new suggestions, or go to{' '}
        <Link to="/knowledge/review" className="text-indigo-600 underline hover:text-indigo-700">
          Review
        </Link>{' '}
        to study your approved cards.
      </p>
    </div>
  )
}
