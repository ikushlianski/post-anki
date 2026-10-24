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
