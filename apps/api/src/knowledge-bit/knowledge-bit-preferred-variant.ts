import { ANKI_VARIANT_KIND_PREFERENCE } from "./knowledge-bit-variant-kind-rules.js";

export interface PreferredVariant {
  knowledgeBitId: string;
  prompt: string;
  answer: string;
  kind: string;
  createdAt: Date;
  id: string;
}

const kindRank = (kind: string): number => {
  const index = (ANKI_VARIANT_KIND_PREFERENCE as readonly string[]).indexOf(kind);

  return index === -1 ? ANKI_VARIANT_KIND_PREFERENCE.length : index;
};

// Same preference as the review queue: basic over fill-in-the-blank over the rest.
export function pickPreferredVariants(variants: PreferredVariant[]): Map<string, PreferredVariant> {
  const picked = new Map<string, PreferredVariant>();

  for (const variant of variants) {
    const current = picked.get(variant.knowledgeBitId);

    if (!current || isPreferred(variant, current)) {
      picked.set(variant.knowledgeBitId, variant);
    }
  }

  return picked;
}

function isPreferred(candidate: PreferredVariant, current: PreferredVariant): boolean {
  const rankDiff = kindRank(candidate.kind) - kindRank(current.kind);

  if (rankDiff !== 0) {
    return rankDiff < 0;
  }

  const createdDiff = candidate.createdAt.getTime() - current.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff < 0;
  }

  return candidate.id < current.id;
}
