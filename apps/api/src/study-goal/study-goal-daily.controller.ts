import type http from "node:http";
import { timeZoneQuery, updateDailyGoalInput } from "@post-anki/shared";
import { readJsonBody, sendJson, sendInvalidQuery } from "../shared/http.js";
import { readDailyGoal, readDailyGoalProgress, saveDailyGoal } from "./study-goal-daily.orchestrator.js";

export async function handleGetDailyGoal(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readDailyGoal());
}

export async function handlePutDailyGoal(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, updateDailyGoalInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });

    return;
  }

  sendJson(res, 200, await saveDailyGoal(body.data));
}

export async function handleGetDailyGoalProgress(res: http.ServerResponse, search: string): Promise<void> {
  const query = timeZoneQuery.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  sendJson(res, 200, await readDailyGoalProgress(query.data.tz, new Date()));
}
