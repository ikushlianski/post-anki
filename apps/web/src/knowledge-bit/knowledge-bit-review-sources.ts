import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

export function removeBits(
  sources: PendingKnowledgeSourceForReview[],
  bitIds: ReadonlySet<string>,
): PendingKnowledgeSourceForReview[] {
  return sources
    .map((source) => ({ ...source, bits: source.bits.filter((bit) => !bitIds.has(bit.id)) }))
    .filter((source) => source.bits.length > 0)
}

export function applyVariantEdit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
  oldVariantId: string,
  newVariantId: string,
  prompt: string,
  answer: string,
): PendingKnowledgeSourceForReview[] {
  return sources.map((source) => ({
    ...source,
    bits: source.bits.map((bit) =>
      bit.id !== bitId
        ? bit
        : {
            ...bit,
            variants: bit.variants.map((variant) =>
              variant.id !== oldVariantId ? variant : { ...variant, id: newVariantId, prompt, answer },
            ),
          },
    ),
  }))
}

export function applyBitEdit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
  body: string,
  background: string | null,
): PendingKnowledgeSourceForReview[] {
  return sources.map((source) => ({
    ...source,
    bits: source.bits.map((bit) =>
      bit.id !== bitId
        ? bit
        : { ...bit, body, background, variants: bit.body === body ? bit.variants : [] },
    ),
  }))
}

// Keeps the group on screen with no bits so a regenerating source does not vanish.
export function markSourceRegenerating(
  sources: PendingKnowledgeSourceForReview[],
  sourceId: string,
): PendingKnowledgeSourceForReview[] {
  return sources.map((source) =>
    source.knowledgeSourceId === sourceId ? { ...source, bits: [] } : source,
  )
}

export function dropEmptySourcesExcept(
  sources: PendingKnowledgeSourceForReview[],
  keepIds: ReadonlySet<string>,
): PendingKnowledgeSourceForReview[] {
  return sources.filter(
    (source) => source.bits.length > 0 || keepIds.has(source.knowledgeSourceId),
  )
}

export function addManualBit(
  sources: PendingKnowledgeSourceForReview[],
  sourceId: string,
  bit: PendingKnowledgeBitForReview,
): PendingKnowledgeSourceForReview[] {
  return sources.map((source) => {
    if (source.knowledgeSourceId !== sourceId) {
      return source
    }

    return { ...source, bits: [...source.bits, bit] }
  })
}
