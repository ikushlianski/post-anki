import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { generateRecommendations, getCurriculumStats, type StatsError } from "./stats.service.js";

const STATUS: Record<StatsError, number> = {
  not_found: 404,
};

export async function handleGetCurriculumStats(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const result = await getCurriculumStats(curriculumId);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleGenerateRecommendations(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const result = await generateRecommendations(curriculumId, now);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
