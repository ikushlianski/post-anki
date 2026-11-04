import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getWeeklyDigestCard } from "./weekly-digest-card.service.js";

export async function handleGetWeeklyDigestCard(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await getWeeklyDigestCard());
}
