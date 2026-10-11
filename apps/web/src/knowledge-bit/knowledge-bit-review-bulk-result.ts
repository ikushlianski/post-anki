import type {
  BulkApprovalSkipReason,
  BulkApproveKnowledgeBitsResponse,
} from '@post-anki/shared'

const SKIP_REASON_PHRASES: Record<BulkApprovalSkipReason, (count: number) => string> = {
  not_found: (count) => `${count} ${count === 1 ? 'no longer exists' : 'no longer exist'}`,
  already_decided: (count) => `${count} already decided`,
  no_variant: (count) => `${count} ${count === 1 ? 'has no questions yet' : 'have no questions yet'}`,
}

export function describeBulkApprovalResult(result: BulkApproveKnowledgeBitsResponse): string {
  const approvedText = `Approved ${result.approved.length}.`

  if (result.skipped.length === 0) {
    return approvedText
  }

  const countsByReason = new Map<BulkApprovalSkipReason, number>()

  for (const { reason } of result.skipped) {
    countsByReason.set(reason, (countsByReason.get(reason) ?? 0) + 1)
  }

  const reasonParts = [...countsByReason].map(([reason, count]) =>
    SKIP_REASON_PHRASES[reason](count),
  )

  return `${approvedText} Skipped ${result.skipped.length}: ${reasonParts.join(', ')}.`
}
