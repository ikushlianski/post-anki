export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

export function hasPgErrorCode(err: unknown, code: string): boolean {
  let current: unknown = err;

  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === code) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
