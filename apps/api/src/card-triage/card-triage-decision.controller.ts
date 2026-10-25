import type http from "node:http";
import { putTriageDecisionInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  getLiveTriageDecision,
  listTriageDecisions,
  putTriageDecision,
  toTriageDecisionResponse,
  undoTriageDecision,
} from "./card-triage-decision.repo.js";
import { getTriageSessionRow } from "./card-triage-session.repo.js";

// PUT /triage-sessions/:id/decisions/:bitId
export async function handlePutTriageDecision(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string,
  bitId: string,
): Promise<void> {
  const body = await readJsonBody(req, putTriageDecisionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await putTriageDecision(sessionId, bitId, body.data);

  if (result.status === "ok") {
    sendJson(res, 200, toTriageDecisionResponse(result.decision));
    return;
  }

  if (result.status === "session_finished" || result.status === "decision_not_applied") {
    sendError(res, 409, result.status);
    return;
  }

  sendError(res, 404, "not_found");
}

// DELETE /triage-sessions/:id/decisions/:bitId
export async function handleDeleteTriageDecision(
  res: http.ServerResponse,
  sessionId: string,
  bitId: string,
): Promise<void> {
  const result = await undoTriageDecision(sessionId, bitId);

  if (result.status === "ok") {
    sendJson(res, 200, toTriageDecisionResponse(result.decision));
    return;
  }

  if (result.status === "session_finished") {
    sendError(res, 409, "session_finished");
    return;
  }

  sendError(res, 404, "not_found");
}

// GET /triage-sessions/:id/decisions/:bitId
export async function handleGetTriageDecision(
  res: http.ServerResponse,
  sessionId: string,
  bitId: string,
): Promise<void> {
  const row = await getLiveTriageDecision(sessionId, bitId);

  if (!row) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, toTriageDecisionResponse(row));
}

// GET /triage-sessions/:id/decisions
export async function handleListTriageDecisions(
  res: http.ServerResponse,
  sessionId: string,
  search: string = "",
): Promise<void> {
  if (!(await getTriageSessionRow(sessionId))) {
    sendError(res, 404, "not_found");
    return;
  }

  const includeUndone = new URLSearchParams(search).get("includeUndone") === "1";
  const rows = await listTriageDecisions(sessionId, { includeUndone });

  sendJson(res, 200, { decisions: rows.map(toTriageDecisionResponse) });
}
