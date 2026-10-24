export const DURABLE_OWNER_PREFIX = "durable:";
export const DEFAULT_DURABLE_TIMEOUT_MS = 10_000;
export const DEFAULT_DURABLE_STALE_MS = 30 * 60 * 1000;
// Legacy stale reset leaves durable-owned rows to the workflow reconcile until this age (flag turned off while rows are stuck).
export const DURABLE_HARD_CEILING_MS = 6 * 60 * 60 * 1000;
export const DURABLE_CHUNK_DEADLINE_MS = 10 * 60 * 1000;
export const DURABLE_MAX_RECOVERY_ATTEMPTS = 3;

export function parseDurableFlag(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

function integerInRange(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export const DURABLE_TIMEOUT_RANGE_MS = { min: 1_000, max: 5 * 60 * 1000 } as const;
// Stale cutoff minimum must exceed launch timeout max (5 min) + chunk deadline (10 min) with headroom.
export const DURABLE_STALE_RANGE_MS = { min: 20 * 60 * 1000, max: 6 * 60 * 60 * 1000 } as const;

export function durableTimeoutMs(raw: string | undefined = process.env.DURABLE_EXTRACTION_TIMEOUT_MS): number {
  return integerInRange(raw, DURABLE_TIMEOUT_RANGE_MS.min, DURABLE_TIMEOUT_RANGE_MS.max, DEFAULT_DURABLE_TIMEOUT_MS);
}

export function durableStaleMs(raw: string | undefined = process.env.DURABLE_EXTRACTION_STALE_MS): number {
  return integerInRange(raw, DURABLE_STALE_RANGE_MS.min, DURABLE_STALE_RANGE_MS.max, DEFAULT_DURABLE_STALE_MS);
}

const KNOWN_REASONS = new Set([
  "no_valid_items",
  "wrong_language",
  "source_empty",
  "source_too_long",
  "source_chunk_missing",
  "knowledge_source_reclaimed",
]);

export const GENERIC_FAILURE_REASON = "extraction_failed";

// A reason that is safe to store in the engine tables: a known code, never free text from a provider error.
export function safeFailureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : "";

  return KNOWN_REASONS.has(message) ? message : GENERIC_FAILURE_REASON;
}
