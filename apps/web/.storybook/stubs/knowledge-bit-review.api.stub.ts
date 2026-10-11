import type {
  BulkApproveKnowledgeBitsResponse,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

// Browser stand-in for knowledge-bit-review.api.ts: the real module wraps
// server functions, which cannot load in the Storybook bundle. Every call
// resolves successfully so approve, reject and save are clickable in stories.

export async function getPendingKnowledgeBitsForReview(): Promise<PendingKnowledgeSourceForReview[]> {
  return []
}

export async function approveKnowledgeBitForReview(_input: { data: { bitId: string } }) {
  return { ok: true as const }
}

export async function rejectKnowledgeBitForReview(_input: { data: { bitId: string } }) {
  return { ok: true as const }
}

export async function editKnowledgeBitQuestionVariantForReview(input: {
  data: { variantId: string }
}) {
  return { ok: true as const, variantId: `${input.data.variantId}-edited` }
}

export async function editKnowledgeBitForReview(_input: { data: { bitId: string } }) {
  return { ok: true as const }
}

export async function bulkApproveKnowledgeBitsForReview(input: {
  data: { knowledgeBitIds: string[] }
}): Promise<BulkApproveKnowledgeBitsResponse> {
  return { approved: input.data.knowledgeBitIds, skipped: [] } as BulkApproveKnowledgeBitsResponse
}

export async function regenerateKnowledgeSourceForReview(_input: {
  data: { sourceId: string }
}) {
  return { status: 'running' as const, supersededCount: 0 }
}

export async function getKnowledgeSourceRegenerationForReview(_input: {
  data: { sourceId: string }
}) {
  return { status: 'running' as const, failureReason: null }
}
