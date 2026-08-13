export function normalizeSearchQuery(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();

  return trimmed.length > 0 ? trimmed : null;
}
