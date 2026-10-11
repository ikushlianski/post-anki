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

export interface RemovedBitSnapshot {
  knowledgeSourceId: string
  sourceText: string | null
  index: number
  bit: PendingKnowledgeBitForReview
}

export function snapshotBit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
): RemovedBitSnapshot | null {
  for (const source of sources) {
    const index = source.bits.findIndex((bit) => bit.id === bitId)

    if (index >= 0) {
      return {
        knowledgeSourceId: source.knowledgeSourceId,
        sourceText: source.sourceText,
        index,
        bit: source.bits[index]!,
      }
    }
  }

  return null
}

export function restoreBit(
  sources: PendingKnowledgeSourceForReview[],
  snapshot: RemovedBitSnapshot,
): PendingKnowledgeSourceForReview[] {
  if (sources.some((source) => source.bits.some((bit) => bit.id === snapshot.bit.id))) {
    return sources
  }

  const group = sources.find((source) => source.knowledgeSourceId === snapshot.knowledgeSourceId)

  if (!group) {
    return [
      {
        knowledgeSourceId: snapshot.knowledgeSourceId,
        sourceText: snapshot.sourceText,
        bits: [snapshot.bit],
      },
      ...sources,
    ]
  }

  return sources.map((source) => {
    if (source.knowledgeSourceId !== snapshot.knowledgeSourceId) {
      return source
    }

    const bits = [...source.bits]

    bits.splice(Math.min(snapshot.index, bits.length), 0, snapshot.bit)

    return { ...source, bits }
  })
}
