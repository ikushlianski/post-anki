import type http from "node:http";
import { createManualKnowledgeItemInput } from "@post-anki/shared";
import { insertManualKnowledgeItem } from "../knowledge-bit/knowledge-bit-manual-item.repo.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";

const ERROR_STATUS = { not_found: 404, already_running: 409, entry_processed: 409 } as const;

export async function handleCreateKnowledgeSourceItem(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, createManualKnowledgeItemInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await insertManualKnowledgeItem(id, body.data);

  if (!result.ok) {
    sendError(res, ERROR_STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 201, result.item);
}
