// Safety of the timeout sweep (touch = curricula.research_touched_at):
//   queued job: touch is at most START_TIMEOUT old, else the engine cancels it
//   live job: touch is at most FINISH_TIMEOUT old, else the engine cancels it
//   so a row owned by a queued or live job is always younger than SWEEP_CUTOFF.
//   timed-out job: at sweep time its touch is older than min(START, FINISH) + SWEEP_DELAY,
//   which exceeds SWEEP_CUTOFF, so the sweep fails it.
export const RESEARCH_RETRIES = 1;
export const RESEARCH_CONCURRENCY = 3;
export const RESEARCH_START_TIMEOUT = "15m";
export const RESEARCH_START_TIMEOUT_MS = 15 * 60 * 1000;
export const RESEARCH_FINISH_TIMEOUT = "15m";
export const RESEARCH_FINISH_TIMEOUT_MS = 15 * 60 * 1000;
export const RESEARCH_SWEEP_CUTOFF_MS = 20 * 60 * 1000;
export const RESEARCH_SWEEP_DELAY = "7m";
export const RESEARCH_SWEEP_DELAY_MS = 7 * 60 * 1000;
// Each run makes paid model calls (docs-URL resolution and trusted-source search).
export const RESEARCH_THROTTLE = { limit: 6, period: "1m", burst: 2 } as const;
