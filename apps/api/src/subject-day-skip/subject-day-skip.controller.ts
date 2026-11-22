import type http from "node:http";
import { subjectDaySkipsQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import {
  listSkippedSubjects,
  skipSubjectForDay,
  subjectExists,
  unskipSubjectForDay,
} from "./subject-day-skip.repo.js";

function parseClock(res: http.ServerResponse, search: string): { tz: string; now: Date } | null {
  const parsed = subjectDaySkipsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);

    return null;
  }

  return { tz: parsed.data.tz, now: new Date() };
}

export async function handleListSubjectDaySkips(res: http.ServerResponse, search: string): Promise<void> {
  const clock = parseClock(res, search);

  if (!clock) {
    return;
  }

  sendJson(res, 200, await listSkippedSubjects(clock));
}

export async function handleSkipSubjectForDay(
  res: http.ServerResponse,
  subjectId: string,
  search: string,
): Promise<void> {
  const clock = parseClock(res, search);

  if (!clock) {
    return;
  }

  if (!(await subjectExists(subjectId))) {
    sendJson(res, 404, { error: "subject_not_found" });

    return;
  }

  await skipSubjectForDay(subjectId, clock);
  sendJson(res, 200, await listSkippedSubjects(clock));
}

export async function handleUnskipSubjectForDay(
  res: http.ServerResponse,
  subjectId: string,
  search: string,
): Promise<void> {
  const clock = parseClock(res, search);

  if (!clock) {
    return;
  }

  await unskipSubjectForDay(subjectId, clock);
  sendJson(res, 200, await listSkippedSubjects(clock));
}
