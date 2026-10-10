export interface UnsortedDueBucketProps {
  dueCount: number
}

// Cards with no subject; hidden entirely when nothing is due so an empty bucket never shows.
export function UnsortedDueBucket({ dueCount }: UnsortedDueBucketProps) {
  if (dueCount <= 0) {
    return null
  }

  return (
    <div
      data-testid="unsorted-due-bucket"
      className="mb-6 flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
    >
      <span className="font-medium tracking-tight">Unsorted</span>
      <span data-testid="unsorted-due-count" className="text-sm text-neutral-500">
        {dueCount} due
      </span>
    </div>
  )
}
