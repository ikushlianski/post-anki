import { NonRetriableError, RetryAfterError } from "inngest";
import { safeFailureReason } from "./durable-extraction.config.js";
import { RATE_LIMIT_DEFAULT_WAIT_MS, RATE_LIMIT_MAX_WAIT_MS } from "./extraction-inngest.limits.js";

export const RATE_LIMITED_REASON = "provider_rate_limited";

const MAX_CAUSE_DEPTH = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function findRateLimited(err: unknown): Record<string, unknown> | null {
  let current: unknown = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    const record = asRecord(current);

    if (!record) {
      return null;
    }

    if (record.statusCode === 429 || record.status === 429) {
      return record;
    }

    current = record.cause;
  }

  return null;
}

function readHeader(headers: unknown, name: string): string | null {
  const record = asRecord(headers);

  if (!record) {
    return null;
  }

  if (typeof record.get === "function") {
    const value: unknown = record.get(name);

    return typeof value === "string" ? value : null;
  }

  const value = record[name];

  return typeof value === "string" ? value : null;
}

function parseWaitMs(headers: unknown): number | null {
  const millis = Number(readHeader(headers, "retry-after-ms"));

  if (Number.isFinite(millis) && millis > 0) {
    return millis;
  }

  const raw = readHeader(headers, "retry-after");

  if (raw === null) {
    return null;
  }

  const seconds = Number(raw);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(raw);

  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function rateLimitWaitMs(err: unknown): number | null {
  const limited = findRateLimited(err);

  if (!limited) {
    return null;
  }

  const waitMs = parseWaitMs(limited.responseHeaders ?? limited.headers) ?? RATE_LIMIT_DEFAULT_WAIT_MS;

  return Math.min(Math.max(waitMs, 1000), RATE_LIMIT_MAX_WAIT_MS);
}

// The model wrapper already retries transient failures; only a provider 429 earns an engine retry.
export function toChunkError(err: unknown): Error {
  const waitMs = rateLimitWaitMs(err);

  if (waitMs !== null) {
    return new RetryAfterError(RATE_LIMITED_REASON, waitMs, { cause: err });
  }

  return new NonRetriableError(safeFailureReason(err), { cause: err });
}
