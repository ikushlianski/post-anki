import pino from "pino";

const SQL_PARAMS_MARKER = "\nparams:";

function hasQueryParams(err: object): boolean {
  return Object.prototype.hasOwnProperty.call(err, "params") || Object.prototype.hasOwnProperty.call(err, "query");
}

function trimMessage(message: string): string {
  const cut = message.indexOf(SQL_PARAMS_MARKER);
  const trimmed = cut === -1 ? message : message.slice(0, cut);

  return trimmed.split("\n")[0] ?? "";
}

function serializeWithoutParams(err: Error): Record<string, unknown> {
  const base = pino.stdSerializers.err(err) as unknown as Record<string, unknown>;
  const { params: _params, query: _query, ...rest } = base;
  const cause = (err as { cause?: unknown }).cause;
  const result: Record<string, unknown> = { ...rest, message: trimMessage(err.message) };

  if (typeof result.stack === "string") {
    result.stack = result.stack.replace(err.message, result.message as string);
  }

  if (cause instanceof Error) {
    result.cause = { code: (cause as { code?: unknown }).code, message: cause.message };
  }

  return result;
}

export function serializeError(err: unknown): unknown {
  if (err instanceof Error && (hasQueryParams(err) || err.message.includes(SQL_PARAMS_MARKER))) {
    return serializeWithoutParams(err);
  }

  return pino.stdSerializers.err(err as Error);
}
