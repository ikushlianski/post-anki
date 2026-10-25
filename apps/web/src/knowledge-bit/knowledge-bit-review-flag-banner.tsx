import { cardFlagWording } from '@post-anki/shared'

export function KnowledgeBitReviewFlagBanner({
  bitId,
  reviewFlag,
}: {
  bitId: string
  reviewFlag: string | null | undefined
}) {
  if (!reviewFlag) {
    return null
  }

  return (
    <div
      data-testid={`knowledge-bit-review-flag-${bitId}`}
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <p className="font-medium">Needs manual review</p>
      <p>{cardFlagWording(reviewFlag)}. Check or edit it before approving.</p>
    </div>
  )
}
