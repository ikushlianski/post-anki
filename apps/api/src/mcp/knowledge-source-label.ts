export const SOURCE_LABEL_MAX_LENGTH = 120;

export function buildSourceLabel(source: { summary: string | null; rawText: string | null }): string {
  const text = (source.summary?.trim() ? source.summary : (source.rawText ?? "")).replace(/\s+/g, " ").trim();

  if (text.length <= SOURCE_LABEL_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, SOURCE_LABEL_MAX_LENGTH).trimEnd()}…`;
}
