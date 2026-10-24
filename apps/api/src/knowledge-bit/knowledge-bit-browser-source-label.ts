export const BROWSER_SOURCE_LABEL_MAX = 80;

function clip(text: string): string {
  return text.length > BROWSER_SOURCE_LABEL_MAX
    ? `${text.slice(0, BROWSER_SOURCE_LABEL_MAX - 1)}…`
    : text;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function deriveBrowserSourceLabel(input: {
  sourceUrl: string | null;
  rawText: string | null;
}): string | null {
  const host = input.sourceUrl ? hostOf(input.sourceUrl) : null;

  if (host) return clip(host);

  const firstLine = input.rawText
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ? clip(firstLine) : null;
}
