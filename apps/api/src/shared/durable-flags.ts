import { parseDurableFlag } from "../knowledge-bit/durable-extraction.config.js";

export function isDurableCardsEnabled(raw: string | undefined = process.env.DURABLE_CARDS): boolean {
  return parseDurableFlag(raw);
}

export function isDurableCourseJobsEnabled(
  raw: string | undefined = process.env.DURABLE_COURSE_JOBS,
): boolean {
  return parseDurableFlag(raw);
}

export function isDurableBackgroundJobsEnabled(
  raw: string | undefined = process.env.DURABLE_BACKGROUND_JOBS,
): boolean {
  return parseDurableFlag(raw);
}

const DURABLE_FLAG_NAMES = [
  "DURABLE_EXTRACTION",
  "DURABLE_CARDS",
  "DURABLE_COURSE_JOBS",
  "DURABLE_BACKGROUND_JOBS",
] as const;

export function listDisabledDurableFlags(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return DURABLE_FLAG_NAMES.filter((name) => !parseDurableFlag(env[name]));
}
