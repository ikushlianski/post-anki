import { localDateParts } from "@post-anki/shared";

export function localDateString(now: Date, tz: string): string {
  const { year, month, day } = localDateParts(now, tz);

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
