export const EXTRACTION_RETRIES = 1;
export const EXTRACTION_START_TIMEOUT = "30m";
export const EXTRACTION_FINISH_TIMEOUT = "30m";
export const EXTRACTION_THROTTLE = { limit: 10, period: "1m", burst: 2 } as const;
export const RATE_LIMIT_DEFAULT_WAIT_MS = 30_000;
export const RATE_LIMIT_MAX_WAIT_MS = 10 * 60 * 1000;
