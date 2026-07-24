import type http from "node:http";
import { answerSocraticInput, startSocraticSessionInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  answerSocraticSession,
  startSocraticSession,
  type SocraticError,
} from "./socratic.service.js";

const STATUS: Record<SocraticError, number> = {
  not_found: 404,
  not_confirmed: 409,
  turn_not_found: 404,
};

export async function handleStartSocratic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, startSocraticSessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await startSocraticSession(body.data, new Date().toISOString());

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleAnswerSocratic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    answerSocraticInput.omit({ sessionId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await answerSocraticSession(
    { ...body.data, sessionId },
    new Date().toISOString(),
  );

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
