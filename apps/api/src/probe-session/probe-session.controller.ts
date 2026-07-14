import type http from "node:http";
import {
  answerProbeSessionInput,
  prepareProbeSessionInput,
  probeScopeSchema,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  answerProbeSession,
  getActiveProbeSession,
  prepareProbeSession,
  type ProbeSessionError,
} from "./probe-session.service.js";

const STATUS: Record<ProbeSessionError, number> = {
  not_found: 404,
  not_confirmed: 409,
  generation_failed: 502,
  question_not_found: 404,
};

export async function handlePrepareProbeSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, prepareProbeSessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await prepareProbeSession(body.data, new Date().toISOString());

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleActiveProbeSession(
  res: http.ServerResponse,
  scopeRaw: string | null,
  scopeId: string | null,
): Promise<void> {
  const scope = probeScopeSchema.safeParse(scopeRaw);

  if (!scope.success || !scopeId) {
    sendError(res, 400, "invalid_input", "scope and scopeId are required");
    return;
  }

  const session = await getActiveProbeSession(scope.data, scopeId);

  sendJson(res, 200, session);
}

export async function handleAnswerProbeSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    answerProbeSessionInput.omit({ sessionId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await answerProbeSession(
    { ...body.data, sessionId },
    new Date().toISOString(),
  );

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
