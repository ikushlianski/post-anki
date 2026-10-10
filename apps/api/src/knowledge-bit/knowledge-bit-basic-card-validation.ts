export const BASIC_CARD_FRONT_MAX_CHARS = 300;
export const BASIC_CARD_BACK_MAX_CHARS = 600;
const ANSWER_ON_FRONT_MIN_CHARS = 4;

export type BasicCardValidation =
  | { ok: true; front: string; back: string }
  | { ok: false; reason: "empty" | "too_long" | "same_text" | "answer_on_front" };

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateBasicCard(raw: { front: string; back: string }): BasicCardValidation {
  const front = raw.front.trim();
  const back = raw.back.trim();

  if (front.length === 0 || back.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (front.length > BASIC_CARD_FRONT_MAX_CHARS || back.length > BASIC_CARD_BACK_MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  const normalizedFront = normalize(front);
  const normalizedBack = normalize(back);

  if (normalizedFront === normalizedBack) {
    return { ok: false, reason: "same_text" };
  }

  if (normalizedBack.length >= ANSWER_ON_FRONT_MIN_CHARS && normalizedFront.includes(normalizedBack)) {
    return { ok: false, reason: "answer_on_front" };
  }

  return { ok: true, front, back };
}
