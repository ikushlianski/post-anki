const DEFAULT_SECONDS_PER_CARD = 10;
const MIN_SECONDS_PER_CARD = 3;
const MAX_SECONDS_PER_CARD = 60;

export function secondsPerCard(averageMs: number | null): number {
  if (averageMs === null || !Number.isFinite(averageMs) || averageMs <= 0) {
    return DEFAULT_SECONDS_PER_CARD;
  }

  return Math.min(MAX_SECONDS_PER_CARD, Math.max(MIN_SECONDS_PER_CARD, averageMs / 1000));
}

export function estimateMinutes(cardCount: number, averageMs: number | null): number {
  if (cardCount <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil((cardCount * secondsPerCard(averageMs)) / 60));
}

export function masteryPercent(mastered: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((Math.min(mastered, total) / total) * 100);
}

export function retentionPercent(recalled: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return Math.round((recalled / total) * 100);
}
