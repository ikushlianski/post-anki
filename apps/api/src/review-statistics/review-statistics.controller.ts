import type http from "node:http";
import { reviewStatisticsQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import { getReviewStatistics } from "./review-statistics.service.js";

export async function handleGetReviewStatistics(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = reviewStatisticsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(res, 200, await getReviewStatistics(parsed.data));
}
