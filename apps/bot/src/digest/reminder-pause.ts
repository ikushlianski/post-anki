export const DEFAULT_PAUSE_DAYS = 7;
export const MAX_PAUSE_DAYS = 30;

const DAY_MS = 86_400_000;

export interface ReminderPauseStore {
  getResumeDay(): Promise<string | null>;
  setResumeDay(day: string): Promise<void>;
  clear(): Promise<void>;
}

export function parsePauseDays(arg: string | null): number | null {
  const trimmed = arg?.trim() ?? "";

  if (trimmed === "") return DEFAULT_PAUSE_DAYS;

  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;

  if (parsed < 1) return null;

  return Math.min(parsed, MAX_PAUSE_DAYS);
}

export function localDay(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toISOString().slice(0, 10);

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function resumeDayAfter(now: Date, days: number, timeZone?: string): string {
  return localDay(new Date(now.getTime() + days * DAY_MS), timeZone);
}

export async function isRemindersPaused(
  store: ReminderPauseStore,
  now: Date,
  timeZone?: string,
): Promise<boolean> {
  const resumeDay = await store.getResumeDay();

  return resumeDay !== null && localDay(now, timeZone) < resumeDay;
}

export function describeResumeDay(resumeDay: string): string {
  const date = new Date(`${resumeDay}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return resumeDay;

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function formatPauseReply(days: number, resumeDay: string): string {
  return `⏸ Daily reminders paused for ${days} ${days === 1 ? "day" : "days"}. They come back on ${describeResumeDay(resumeDay)}. Send /resume to restart sooner.`;
}

export const PAUSE_USAGE_REPLY = `Send /pause with a whole number of days from 1 to ${MAX_PAUSE_DAYS}, e.g. /pause 3 — or just /pause for ${DEFAULT_PAUSE_DAYS}.`;

export const RESUME_REPLY = "▶️ Daily reminders are back on.";
