import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getChatQueueOutcomesStatistics } from "./chat-queue-outcomes-statistics.service.js";

export async function handleGetChatQueueOutcomesStatistics(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await getChatQueueOutcomesStatistics());
}
