import type http from "node:http";
import { studyOverviewQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import { getHomeSummary } from "./home.service.js";
import { getStudyOverview } from "./home-study-overview.service.js";

export async function handleGetHomeSummary(res: http.ServerResponse): Promise<void> {
  const summary = await getHomeSummary();

  sendJson(res, 200, summary);
}

export async function handleGetStudyOverview(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = studyOverviewQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(res, 200, await getStudyOverview(parsed.data));
}
