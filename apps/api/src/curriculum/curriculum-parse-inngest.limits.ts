// Parse, reparse and merge hold status "curating", the same status and the same touch column
// (curricula.research_touched_at) as research, so the research sweep and cutoff cover them.
// A queued or live parse job is at most START or FINISH old, both under RESEARCH_SWEEP_CUTOFF_MS;
// a timed-out one is at least min(START, FINISH) + SWEEP_DELAY old, which exceeds the cutoff.
// RETRIES is 0: saving a plan and rewriting modules are not idempotent.
export const PARSE_RETRIES = 0;
export const PARSE_CONCURRENCY = 2;
export const PARSE_START_TIMEOUT = "15m";
export const PARSE_START_TIMEOUT_MS = 15 * 60 * 1000;
export const PARSE_FINISH_TIMEOUT = "15m";
export const PARSE_FINISH_TIMEOUT_MS = 15 * 60 * 1000;
export const PARSE_SWEEP_DELAY = "7m";
export const PARSE_SWEEP_DELAY_MS = 7 * 60 * 1000;
// One architect call per run.
export const PARSE_THROTTLE = { limit: 6, period: "1m", burst: 2 } as const;
