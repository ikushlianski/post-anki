import { Link } from '@tanstack/react-router'

export function LearningPathLoadError({ status, onRetry }: { status: number; onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      {status === 404 ? (
        <p data-testid="learning-path-not-found" className="text-sm text-neutral-500">
          Learning path not found.
        </p>
      ) : (
        <div role="alert" data-testid="learning-path-load-error" className="flex items-center gap-3 text-sm text-neutral-600">
          <p>Couldn't load this path, try again.</p>
          <button
            type="button"
            data-testid="learning-path-load-retry"
            onClick={onRetry}
            className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-700 hover:bg-neutral-50"
          >
            Try again
          </button>
        </div>
      )}
      <Link to="/learning-paths" className="text-sm underline">
        Back to learning paths
      </Link>
    </main>
  )
}
