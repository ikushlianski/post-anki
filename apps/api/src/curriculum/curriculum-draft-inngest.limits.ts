// Sweep safety (touch = curricula.research_touched_at, status shaping_structure):
//   queued job: touch at most START_TIMEOUT old, else the engine cancels it
//   live job: touch at most FINISH_TIMEOUT old, else the engine cancels it
//   so a row a queued or live job owns is always younger than SWEEP_CUTOFF.
//   timed-out job: at sweep time its touch is older than min(START, FINISH) + SWEEP_DELAY,
//   which exceeds SWEEP_CUTOFF, so the sweep fails it.
// FINISH stays at or under 10m so a live draft is not left "stalled" for long (stalled shows after 5m).
export const DRAFT_RETRIES = 1;
export const DRAFT_CONCURRENCY = 2;
export const DRAFT_START_TIMEOUT = "10m";
export const DRAFT_START_TIMEOUT_MS = 10 * 60 * 1000;
export const DRAFT_FINISH_TIMEOUT = "10m";
export const DRAFT_FINISH_TIMEOUT_MS = 10 * 60 * 1000;
export const DRAFT_SWEEP_CUTOFF_MS = 15 * 60 * 1000;
export const DRAFT_SWEEP_DELAY = "6m";
export const DRAFT_SWEEP_DELAY_MS = 6 * 60 * 1000;
// Each run makes paid calls: a trusted-source search and the architect agent.
export const DRAFT_THROTTLE = { limit: 6, period: "1m", burst: 2 } as const;
