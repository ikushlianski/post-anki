export const LEECH_THRESHOLD = 8;
export const LEECH_REPEAT = 4;

export interface LeechOutcome {
  leech: boolean;
  autoSuspend: boolean;
}

export const isLeech = (lapses: number): boolean => lapses >= LEECH_THRESHOLD;

export function deriveLeechOutcome(lapsesBefore: number, lapsesAfter: number): LeechOutcome {
  return {
    leech: isLeech(lapsesAfter),
    autoSuspend:
      lapsesAfter > lapsesBefore &&
      lapsesAfter >= LEECH_THRESHOLD &&
      (lapsesAfter - LEECH_THRESHOLD) % LEECH_REPEAT === 0,
  };
}
