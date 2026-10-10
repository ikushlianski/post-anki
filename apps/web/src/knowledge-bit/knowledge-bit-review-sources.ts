import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

export function removeBits(
  sources: PendingKnowledgeSourceForReview[],
  bitIds: ReadonlySet<string>,
): PendingKnowledgeSourceForReview[] {
  return sources
    .map((source) => ({ ...source, bits: source.bits.filter((bit) => !bitIds.has(bit.id)) }))
    .filter((source) => source.bits.length > 0)
}

export function removeBit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
): PendingKnowledgeSourceForReview[] {
  return removeBits(sources, new Set([bitId]))
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
