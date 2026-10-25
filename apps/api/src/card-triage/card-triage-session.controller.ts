import type http from "node:http";
import { discardTriageSessionInput, finishTriageSessionInput, startTriageSessionInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { distillTriageSession } from "./card-triage-distill.orchestrator.js";
import {
  discardTriageSession,
  finishTriageSession,
  getTriageSessionRow,
  startTriageSession,
  toTriageSessionResponse,
} from "./card-triage-session.repo.js";

// POST /triage-sessions
export async function handleStartTriageSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, startTriageSessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const { session, created } = await startTriageSession(body.data);

  sendJson(res, created ? 201 : 200, await toTriageSessionResponse(session));
}

// GET /triage-sessions/:id
export async function handleGetTriageSession(res: http.ServerResponse, id: string): Promise<void> {
  const session = await getTriageSessionRow(id);

  if (!session) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, await toTriageSessionResponse(session));
}

// POST /triage-sessions/:id/finish
export async function handleFinishTriageSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, finishTriageSessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await finishTriageSession(id, body.data);

  if (result.status === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result.status === "already_finished") {
    sendJson(res, 200, await toTriageSessionResponse(result.session));
    return;
  }

  await distillTriageSession(id);

  const session = await getTriageSessionRow(id);

  sendJson(res, 200, await toTriageSessionResponse(session ?? result.session));
}

// POST /triage-sessions/:id/discards
export async function handleDiscardTriageSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, discardTriageSessionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await discardTriageSession(id, body.data);

  if (result.status === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result.status === "already_finished" && result.session.status !== "discarded") {
    sendError(res, 409, "already_finished");
    return;
  }

  sendJson(res, 200, await toTriageSessionResponse(result.session));
}

// POST /triage-sessions/:id/distill
export async function handleDistillTriageSession(res: http.ServerResponse, id: string): Promise<void> {
  const session = await getTriageSessionRow(id);

  if (!session) {
    sendError(res, 404, "not_found");
    return;
  }

  if (session.status === "open") {
    sendError(res, 409, "not_finished");
    return;
  }

  await distillTriageSession(id);

  const updated = await getTriageSessionRow(id);

  sendJson(res, 200, await toTriageSessionResponse(updated ?? session));
}
