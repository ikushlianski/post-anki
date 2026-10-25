import pino from "pino";

const MAX_CAUSE_DEPTH = 5;
const SQL_PARAMS_MARKER = "\nparams:";

function hasQueryParams(err: object): boolean {
  return Object.prototype.hasOwnProperty.call(err, "params") || Object.prototype.hasOwnProperty.call(err, "query");
}

function trimMessage(message: string): string {
  const cut = message.indexOf(SQL_PARAMS_MARKER);
  const trimmed = cut === -1 ? message : message.slice(0, cut);

  return trimmed.split("\n")[0] ?? "";
}

function serializeWithoutParams(err: Error, depth = 1): Record<string, unknown> {
  const base = pino.stdSerializers.err(err) as unknown as Record<string, unknown>;
  const { params: _params, query: _query, ...rest } = base;
  const cause = (err as { cause?: unknown }).cause;
  const result: Record<string, unknown> = { ...rest, message: trimMessage(err.message) };

  if (typeof err.stack === "string") {
    result.stack = err.stack.replace(err.message, result.message as string);
  }

  if (cause instanceof Error) {
    result.cause = serializeCause(cause, depth);
  }

  return result;
}

function serializeCause(cause: Error, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { code: (cause as { code?: unknown }).code, message: trimMessage(cause.message) };
  const next = (cause as { cause?: unknown }).cause;

  if (next instanceof Error && depth < MAX_CAUSE_DEPTH) {
    out.cause = serializeCause(next, depth + 1);
  }

  return out;
}

function causeLeaksParams(err: Error): boolean {
  let current = (err as { cause?: unknown }).cause;

  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i += 1) {
    if (hasQueryParams(current) || current.message.includes(SQL_PARAMS_MARKER)) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export function serializeError(err: unknown): unknown {
  if (err instanceof Error && (hasQueryParams(err) || err.message.includes(SQL_PARAMS_MARKER) || causeLeaksParams(err))) {
    return serializeWithoutParams(err);
  }

  return pino.stdSerializers.err(err as Error);
}
