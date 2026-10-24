import type http from "node:http";
import { undoTriageKnowledgeBitInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { undoTriageKnowledgeBit } from "./knowledge-bit-triage-undo.repo.js";

// POST /knowledge-bits/:id/triage/undo
export async function handleUndoTriageKnowledgeBit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, undoTriageKnowledgeBitInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await undoTriageKnowledgeBit(id, body.data.restoreVariantIds);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result !== true) {
    sendError(res, 409, result);
    return;
  }

  sendJson(res, 200, { ok: true });
}
