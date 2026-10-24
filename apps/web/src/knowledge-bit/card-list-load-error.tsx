interface CardListLoadErrorProps {
  testId: string
  retryTestId: string
  onRetry: () => void
}

export function CardListLoadError({ testId, retryTestId, onRetry }: CardListLoadErrorProps) {
  return (
    <div role="alert" data-testid={testId} className="rounded border border-red-200 bg-red-50 px-4 py-4">
      <p className="text-red-700">Could not load your cards. Check your connection and try again.</p>
      <button
        type="button"
        data-testid={retryTestId}
        className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  )
}
