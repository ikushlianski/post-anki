import { createHash } from "node:crypto";

export const HALF_LIFE_DAYS = 14;
export const WINDOW_DAYS = 60;
export const FAVOUR = 0.5;
export const POOL_FACTOR = 2;

export const poolSize = (limit: number): number => POOL_FACTOR * limit;

export interface MixCandidate<T> {
  id: string;
  group: string;
  item: T;
}

export const recencyWeight = (ageDays: number): number => 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS);

// Weight 1 for an inactive group up to 1 + FAVOUR for the most active one.
export function groupWeights(activity: number[]): number[] {
  const max = Math.max(0, ...activity);

  return activity.map((value) => (max > 0 ? 1 + (FAVOUR * Math.max(0, value)) / max : 1));
}

// Deterministic value strictly inside (0, 1) for a seed and an id.
export function seededUnit(seed: string, id: string): number {
  const digest = createHash("sha256").update(`${seed}:${id}`).digest();
  const scale = 2 ** 48;

  return (digest.readUIntBE(0, 6) + 0.5) / scale;
}

// Weighted random sampling without replacement: each card's weight is its group weight
// spread over the group's cards, so a big group does not out-draw a small one. The sort key
// ln(u) / w orders the same as u^(1/w) without underflow. A card's key depends only on the
// seed and the card, so removing a card never reorders the rest.
export function selectWeighted<T>(
  candidates: MixCandidate<T>[],
  weightOf: (group: string) => number,
  seed: string,
  take: number,
  sizeOf?: (group: string) => number,
): T[] {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    counts.set(candidate.group, (counts.get(candidate.group) ?? 0) + 1);
  }

  const sizeFor = (group: string) => Math.max(1, sizeOf?.(group) ?? counts.get(group) ?? 1);

  return candidates
    .map((candidate) => ({
      candidate,
      key: Math.log(seededUnit(seed, candidate.id)) / (weightOf(candidate.group) / sizeFor(candidate.group)),
    }))
    .sort((a, b) => b.key - a.key || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, Math.max(0, take))
    .map(({ candidate }) => candidate.item);
}

// Earlier tiers are exhausted before a later tier contributes; within a tier the seeded key decides.
export function selectTiered<T>(
  tiers: MixCandidate<T>[][],
  weightOf: (group: string) => number,
  seed: string,
  take: number,
): T[] {
  const picked: T[] = [];

  for (const tier of tiers) {
    if (picked.length >= take) {
      break;
    }

    picked.push(...selectWeighted(tier, weightOf, seed, take - picked.length));
  }

  return picked;
}

// Half the page from already-seen cards, the rest new; a short pool is backfilled by the other.
export function splitBalance(
  limit: number,
  seenAvailable: number,
  newAvailable: number,
): { seen: number; fresh: number } {
  const seen = Math.min(Math.ceil(limit / 2), seenAvailable);
  const fresh = Math.min(limit - seen, newAvailable);

  return { seen: Math.min(seenAvailable, limit - fresh), fresh };
}
