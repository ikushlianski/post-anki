import { sql, type AnyColumn, type SQL } from "drizzle-orm";

export const NORMALIZED_MATCH_MIN_LENGTH = 12;

export function normalizeDuplicateText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizedMatchKey(text: string): string | null {
  const normalized = normalizeDuplicateText(text);

  return normalized.length >= NORMALIZED_MATCH_MIN_LENGTH ? normalized : null;
}

export function normalizedColumnIn(column: AnyColumn, normalizedTexts: string[]): SQL {
  return sql`lower(regexp_replace(${column}, '[^[:alnum:]]+', '', 'g')) IN (${sql.join(
    normalizedTexts.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}
