const DEFAULT_MAX_CHARS = 6_000;

export function excerptAroundBody(
  raw: string | null,
  body: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  const text = raw?.trim() ?? "";

  if (text.length === 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  const needle = body.trim();
  const index = needle.length > 0 ? text.indexOf(needle) : -1;

  if (index < 0) {
    return text.slice(0, maxChars).trim();
  }

  const centre = index + Math.floor(needle.length / 2);
  const start = Math.max(0, Math.min(centre - Math.floor(maxChars / 2), text.length - maxChars));

  return text.slice(start, start + maxChars).trim();
}
