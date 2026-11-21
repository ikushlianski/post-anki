import {
  listActiveVariantsForBitsEmbedding,
  listApprovedBitsForEmbedding,
} from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import type { EvidenceCard } from "./card-synthesis-mining.types.js";

export async function loadEvidenceCards(bitIds: string[]): Promise<EvidenceCard[]> {
  const [bits, variants] = await Promise.all([
    listApprovedBitsForEmbedding(bitIds),
    listActiveVariantsForBitsEmbedding(bitIds),
  ]);
  const bitById = new Map(bits.map((bit) => [bit.id, bit]));
  const variantByBit = new Map<string, (typeof variants)[number]>();

  for (const variant of variants) {
    if (!variantByBit.has(variant.knowledgeBitId)) {
      variantByBit.set(variant.knowledgeBitId, variant);
    }
  }

  return bitIds.flatMap((id) => {
    const bit = bitById.get(id);

    if (!bit) {
      return [];
    }

    const variant = variantByBit.get(id);

    return [{ id, question: variant?.prompt ?? bit.body, answer: variant?.answer ?? "" }];
  });
}
