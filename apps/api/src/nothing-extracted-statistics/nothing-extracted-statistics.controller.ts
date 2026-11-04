import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getNothingExtractedStatistics } from "./nothing-extracted-statistics.service.js";

export async function handleGetNothingExtractedStatistics(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await getNothingExtractedStatistics());
}
