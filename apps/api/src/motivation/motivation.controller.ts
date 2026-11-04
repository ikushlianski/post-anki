import type http from "node:http";
import {
  motivationProgressQuery,
  pauseStreakInput,
  updateMotivationSettingsInput,
} from "@post-anki/shared";
import { readJsonBody, sendInvalidQuery, sendJson } from "../shared/http.js";
import { getGoalStreak, pauseStreak } from "../streak/streak.service.js";
import { writeMotivationSettings } from "./motivation-settings.repo.js";
import { readProgressView } from "./motivation-progress.orchestrator.js";
import { readSessionSummary } from "./motivation-session-summary.orchestrator.js";
import { readSettings, readTodayView } from "./motivation-today.orchestrator.js";
import { readWeeklySummary } from "./motivation-weekly-summary.orchestrator.js";

function invalid(res: http.ServerResponse, issues: unknown): void {
  sendJson(res, 400, { error: "invalid_input", message: issues });
}

export async function handleGetMotivationSettings(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readSettings());
}

export async function handlePutMotivationSettings(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, updateMotivationSettingsInput);

  if (!body.ok) {
    return invalid(res, body.issues);
  }

  sendJson(res, 200, await writeMotivationSettings(body.data));
}

export async function handleGetMotivationToday(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readTodayView(new Date()));
}

export async function handleGetGoalStreak(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await getGoalStreak());
}

export async function handlePauseStreak(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, pauseStreakInput);

  if (!body.ok) {
    return invalid(res, body.issues);
  }

  sendJson(res, 200, await pauseStreak(body.data.days));
}

export async function handleGetSessionSummary(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readSessionSummary(new Date()));
}

export async function handleGetMotivationProgress(res: http.ServerResponse, search: string): Promise<void> {
  const query = motivationProgressQuery.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!query.success) {
    return sendInvalidQuery(res, query.error);
  }

  sendJson(res, 200, await readProgressView(new Date(), query.data.days));
}

export async function handleGetWeeklySummary(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readWeeklySummary(new Date()));
}
