export function interleaveNewWithSeen<T>(seen: T[], fresh: T[], limit: number): T[] {
  const mixed: T[] = [];
  let s = 0;
  let f = 0;

  while (mixed.length < limit && (s < seen.length || f < fresh.length)) {
    if (s < seen.length) {
      mixed.push(seen[s++]!);
    }

    if (mixed.length < limit && f < fresh.length) {
      mixed.push(fresh[f++]!);
    }
  }

  return mixed;
}

const DAY_MS = 86_400_000;
const RECENCY_HALF_SCALE_DAYS = 30;

function hashText(text: string): number {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }

  return hash >>> 0;
}

function mulberry32Once(initial: number): number {
  const state = (initial + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface ShuffleCandidate {
  variantId: string;
  createdAt: Date;
}

export function weightedShuffle<T extends ShuffleCandidate>(cards: T[], seed: string, reference: Date): T[] {
  const referenceDay = Math.floor(reference.getTime() / DAY_MS) * DAY_MS;
  const keyed = cards.map((card) => {
    const u = mulberry32Once(hashText(`${seed}|${card.variantId}`)) || Number.MIN_VALUE;
    const ageDays = Math.max(0, (referenceDay - card.createdAt.getTime()) / DAY_MS);
    const weight = 1 / Math.sqrt(1 + ageDays / RECENCY_HALF_SCALE_DAYS);

    return { card, key: -Math.log(u) / weight };
  });

  return keyed
    .sort((a, b) => a.key - b.key || a.card.variantId.localeCompare(b.card.variantId))
    .map(({ card }) => card);
}
