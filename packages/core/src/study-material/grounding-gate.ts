export const MIN_GROUNDING_CHARS = 200;

export const MAX_GROUNDING_CHARS = 8_000;

export function hasUsableGroundingText(
  text: string,
  minChars: number = MIN_GROUNDING_CHARS,
): boolean {
  return text.trim().length >= minChars;
}

export function capGroundingText(
  text: string,
  maxChars: number = MAX_GROUNDING_CHARS,
): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
