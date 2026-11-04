import type http from "node:http";
import { ownerStatsAiSpendQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import { getAiSpend } from "./ai-spend.service.js";

export async function handleGetAiSpend(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = ownerStatsAiSpendQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(res, 200, await getAiSpend(parsed.data));
}
