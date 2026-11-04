import type http from "node:http";
import { studyForecastQuerySchema } from "@post-anki/shared";
import { sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import { getStudyForecast } from "./study-forecast.service.js";

export async function handleGetStudyForecast(
  res: http.ServerResponse,
  subjectId: string,
  search: string,
): Promise<void> {
  const parsed = studyForecastQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  const forecast = await getStudyForecast(subjectId, parsed.data.tz);

  if (!forecast) {
    sendError(res, 404, "subject_not_found");
    return;
  }

  sendJson(res, 200, forecast);
}
