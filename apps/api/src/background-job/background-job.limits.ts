export const BACKGROUND_JOB_RETRIES = 0;
export const BACKGROUND_JOB_CONCURRENCY = 5;
export const BACKGROUND_JOB_START_TIMEOUT = "14m";
export const BACKGROUND_JOB_FINISH_TIMEOUT = "14m";
export const BACKGROUND_JOB_THROTTLE = { limit: 30, period: "1m", burst: 5 } as const;
