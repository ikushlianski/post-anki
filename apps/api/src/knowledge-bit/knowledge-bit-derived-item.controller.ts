import type http from "node:http";
import { createManualKnowledgeItemInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { insertDerivedKnowledgeItem } from "./knowledge-bit-manual-item.repo.js";

const ERROR_STATUS = { not_found: 404, not_approved: 409 } as const;

export async function handleCreateDerivedKnowledgeItem(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, createManualKnowledgeItemInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await insertDerivedKnowledgeItem(id, body.data);

  if (!result.ok) {
    sendError(res, ERROR_STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 201, result.item);
}
