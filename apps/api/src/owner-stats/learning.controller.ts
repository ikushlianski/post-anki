import type http from "node:http";
import { ownerStatsLearningQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import { getOwnerStatsLearning } from "./learning.service.js";

export async function handleGetOwnerStatsLearning(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = ownerStatsLearningQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(res, 200, await getOwnerStatsLearning(parsed.data));
}
