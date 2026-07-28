import type http from "node:http";
import { decideInput, resolveDecideBlindSpotInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { submitDecideSession } from "./decide.orchestrator.js";
import { listDecideSessions, updateDecideBlindSpotStatus } from "./decide.repo.js";

// POST /decide-sessions. Both agent-failure branches (a thrown error, and
// the agent returning no/invalid structured output) surface here as the
// SAME EvaluatorUnavailableError, mapped to the same 502
// evaluator_unavailable response — spec.md's Route design section. Neither
// failure path persists a row (submitDecideSession never reaches
// insertDecideSession on either branch).
export async function handleCreateDecideSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, decideInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  try {
    const session = await submitDecideSession(body.data.decision, body.data.opinion);

    sendJson(res, 200, session);
  } catch (err) {
    log.error({ err }, "decide_session_failed");
    sendError(res, 502, "evaluator_unavailable");
  }
}

// GET /decide-sessions — full history, newest-first, each session's blind
// spots nested inline. No pagination (matches writing_checks' own
// unpaginated GET), acceptable at this app's current, small personal-use
// scale.
export async function handleListDecideSessions(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listDecideSessions());
}

// PATCH /decide-blind-spots/:id. Mirrors resolvePrioritySuggestion's exact
// shape: accept or reject, sets resolvedAt, persisted row never deleted.
export async function handleResolveDecideBlindSpot(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  blindSpotId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveDecideBlindSpotInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await updateDecideBlindSpotStatus(blindSpotId, body.data.status);

  if (!updated) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, updated);
}
