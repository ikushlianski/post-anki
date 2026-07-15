import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getStreak } from "./streak.service.js";

export async function handleGetStreak(res: http.ServerResponse): Promise<void> {
  const streak = await getStreak();

  sendJson(res, 200, streak);
}
