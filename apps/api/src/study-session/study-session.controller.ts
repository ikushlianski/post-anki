import type http from "node:http";
import {
  createStudySessionInput,
  endStudySessionInput,
  questionKindSchema,
  recordStudySessionAnswerInput,
  type QuestionKind,
} from "@post-anki/shared";
import { shouldEndSession } from "@post-anki/core";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  getStudySession,
  insertStudySession,
  recordStudySessionAnswer,
  startStudySession,
} from "./study-session.repo.js";
import { completeSession, getConsistency, getSessionPush, listSessionsForSchedule } from "./study-session.service.js";

export async function handleCreateStudySession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createStudySessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const session = await insertStudySession(body.data);

  sendJson(res, 201, session);
}

export async function handleListStudySessions(res: http.ServerResponse): Promise<void> {
  const sessions = await listSessionsForSchedule(new Date().toISOString());

  sendJson(res, 200, sessions);
}

export async function handleGetStudySession(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const session = await getStudySession(id);

  if (!session) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, session);
}

export async function handleStartStudySession(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const session = await startStudySession(id, new Date());

  if (!session) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, session);
}

export async function handleEndStudySession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, endStudySessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const existing = await getStudySession(id);

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  const now = new Date();
  const ended = shouldEndSession({
    startedAt: existing.startedAt,
    plannedDurationMinutes: existing.plannedDurationMinutes,
    now: now.toISOString(),
    userRequestedEnd: body.data.userRequestedEnd ?? false,
  });

  if (!ended) {
    sendJson(res, 200, existing);
    return;
  }

  const session = await completeSession(id, now);

  sendJson(res, 200, session);
}

export async function handleRecordStudySessionAnswer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, recordStudySessionAnswerInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const session = await recordStudySessionAnswer(id, body.data.correct);

  if (!session) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, session);
}

export async function handleGetStudySessionPush(
  res: http.ServerResponse,
  id: string,
  excludeGapIdsParam: string | null,
  modeParam: string | null,
): Promise<void> {
  const excludeGapIds = excludeGapIdsParam
    ? excludeGapIdsParam.split(",").filter(Boolean)
    : [];
  const parsedMode = questionKindSchema.safeParse(modeParam);
  const mode: QuestionKind = parsedMode.success ? parsedMode.data : "socratic";

  const result = await getSessionPush(id, excludeGapIds, mode, new Date().toISOString());

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleGetStudySessionConsistency(
  res: http.ServerResponse,
  windowDaysParam: string | null,
): Promise<void> {
  const parsedWindowDays = windowDaysParam ? Number.parseInt(windowDaysParam, 10) : undefined;
  const windowDays = parsedWindowDays && Number.isFinite(parsedWindowDays) ? parsedWindowDays : undefined;

  const consistency = await getConsistency(new Date().toISOString(), windowDays);

  sendJson(res, 200, consistency);
}
