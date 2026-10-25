import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { discardKnowledgeSource } from "./knowledge-source-discard.repo.js";

// POST /knowledge-sources/:id/discards
export async function handleDiscardKnowledgeSource(
  res: http.ServerResponse,
  sourceId: string,
): Promise<void> {
  const result = await discardKnowledgeSource(sourceId);

  if (!result.ok) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 200, { counts: result.counts });
}
