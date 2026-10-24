import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { setKnowledgeSourceProcessed } from "./knowledge-source-processed.repo.js";

const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

async function respondWithProcessed(
  res: http.ServerResponse,
  id: string,
  processed: boolean,
): Promise<void> {
  if (!SOURCE_ID_PATTERN.test(id)) {
    sendJson(res, 400, { error: "invalid_id" });
    return;
  }

  const result = await setKnowledgeSourceProcessed(id, processed);

  if (!result.ok) {
    sendError(res, result.reason === "not_found" ? 404 : 409, result.reason);
    return;
  }

  sendJson(res, 200, { id: result.id, processedAt: result.processedAt?.toISOString() ?? null });
}

// POST /knowledge-sources/:id/processed
export function handleMarkKnowledgeSourceProcessed(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  return respondWithProcessed(res, id, true);
}

// DELETE /knowledge-sources/:id/processed
export function handleReopenKnowledgeSource(res: http.ServerResponse, id: string): Promise<void> {
  return respondWithProcessed(res, id, false);
}
