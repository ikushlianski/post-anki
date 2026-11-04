import { localDateParts } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { readMotivationSettings } from "../motivation/motivation-settings.repo.js";

export function formatLocalDate(now: Date, timeZone: string): string {
  const { year, month, day } = localDateParts(now, timeZone);

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function readStudyPlanToday(now: Date, db?: DbExecutor): Promise<string> {
  const { timeZone } = await readMotivationSettings(db);

  return formatLocalDate(now, timeZone);
}

export interface StudyPlanClock {
  today: string;
  timeZone: string;
}

export async function readStudyPlanClock(now: Date, db?: DbExecutor): Promise<StudyPlanClock> {
  const { timeZone } = await readMotivationSettings(db);

  return { today: formatLocalDate(now, timeZone), timeZone };
}
