const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_CAUSE_DEPTH = 5;

function safeToken(value: unknown): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

function errorClassOf(err: unknown): string {
  if (err instanceof Error) {
    return safeToken(err.name) ?? safeToken(err.constructor?.name) ?? "Error";
  }

  return "NonError";
}

function errorCodeOf(err: unknown): string | null {
  let current: unknown = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return null;
    }

    const record = current as Record<string, unknown>;
    const status = record.statusCode ?? record.status;

    if (typeof status === "number" && Number.isInteger(status)) {
      return String(status);
    }

    const code = safeToken(record.code);

    if (code) {
      return code;
    }

    current = record.cause;
  }

  return null;
}

export function summarizeLlmError(err: unknown): string {
  const errorClass = errorClassOf(err);
  const code = errorCodeOf(err);

  return code ? `${errorClass} (${code})` : errorClass;
}
