import type { PriorityPeriodKind } from "./study-goals";

export interface LocalDateRange {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatUtcDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function isoWeekOneMonday(isoYear: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const weekday = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();

  return new Date(jan4.getTime() - (weekday - 1) * DAY_MS);
}

export function localDateParts(now: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return { year: read("year"), month: read("month"), day: read("day") };
}

export function isoWeekKeyOf(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const thursday = new Date(date.getTime() + (4 - weekday) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - isoWeekOneMonday(isoYear).getTime()) / (7 * DAY_MS)) + 1;

  return `${pad(isoYear, 4)}-W${pad(week)}`;
}

export function currentPeriodKey(kind: PriorityPeriodKind, now: Date, tz: string): string {
  const { year, month, day } = localDateParts(now, tz);

  if (kind === "year") {
    return pad(year, 4);
  }

  if (kind === "month") {
    return `${pad(year, 4)}-${pad(month)}`;
  }

  return isoWeekKeyOf(year, month, day);
}

export function periodLocalRange(kind: PriorityPeriodKind, key: string): LocalDateRange {
  if (kind === "year") {
    const year = Number(key);

    return { start: `${pad(year, 4)}-01-01`, end: `${pad(year + 1, 4)}-01-01` };
  }

  if (kind === "month") {
    const [year, month] = key.split("-").map(Number) as [number, number];
    const next = new Date(Date.UTC(year, month, 1));

    return { start: `${pad(year, 4)}-${pad(month)}-01`, end: formatUtcDate(next) };
  }

  const [yearPart, weekPart] = key.split("-W") as [string, string];
  const monday = new Date(isoWeekOneMonday(Number(yearPart)).getTime() + (Number(weekPart) - 1) * 7 * DAY_MS);

  return { start: formatUtcDate(monday), end: formatUtcDate(new Date(monday.getTime() + 7 * DAY_MS)) };
}

export function isPeriodKeyReal(kind: PriorityPeriodKind, key: string): boolean {
  if (kind !== "week") {
    return true;
  }

  const [yearPart, weekPart] = key.split("-W") as [string, string];
  const { start } = periodLocalRange("week", key);
  const [year, month, day] = start.split("-").map(Number) as [number, number, number];

  return isoWeekKeyOf(year, month, day) === `${yearPart}-W${weekPart}`;
}
