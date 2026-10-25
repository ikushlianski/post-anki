const MAX_CAUSE_DEPTH = 5;

export function hasPostgresErrorCode(err: unknown, code: string): boolean {
  let current: unknown = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    if ((current as { code?: unknown }).code === code) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
