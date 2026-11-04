import type { ReviewCard } from "@/api/review-commands";

export const REFILL_THRESHOLD = 8;
export const SYNC_RETRY_MS = 20_000;

export function needsRefill(remainingAfterCurrent: number, refilling: boolean, exhausted: boolean): boolean {
  return !refilling && !exhausted && remainingAfterCurrent < REFILL_THRESHOLD;
}

export function mergeIncoming(held: readonly ReviewCard[], incoming: readonly ReviewCard[]): ReviewCard[] {
  const seen = new Set(held.map((card) => card.id));
  const added: ReviewCard[] = [];

  for (const card of incoming) {
    if (seen.has(card.id)) {
      continue;
    }

    seen.add(card.id);
    added.push(card);
  }

  return [...held, ...added];
}

export function pendingNote(pending: number): string | null {
  if (pending === 0) {
    return null;
  }

  return `${pending} waiting to sync`;
}
