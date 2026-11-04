export const CARD_DEDUP_BIT_CAP = 25;
export const CARD_DEDUP_ESCALATION_PAIR_CAP = 10;
export const CARD_DEDUP_ESCALATION_CARD_CHARS = 500;
export const CARD_DEDUP_CANDIDATES_PER_CARD = 3;
export const CARD_DEDUP_REASON_CHARS = 300;
export const CARD_DEDUP_NEAR_IDENTICAL_REASON = "Near-identical wording to an existing card.";
export const CARD_DEDUP_DUPLICATE_THRESHOLD = 0.95;
export const CARD_DEDUP_BORDERLINE_THRESHOLD = 0.85;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

export function isCardDedupEnabled(): boolean {
  const raw = process.env.CARD_DEDUP_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}
