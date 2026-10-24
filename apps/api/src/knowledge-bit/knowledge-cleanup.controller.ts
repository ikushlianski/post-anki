import type http from "node:http";
import { clearAllKnowledgeInput, purgeKnowledgeBitsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { clearAllKnowledge, deleteKnowledgeSource, purgeKnowledgeBits } from "./knowledge-cleanup.repo.js";

// POST /knowledge-bits/purges
export async function handlePurgeKnowledgeBits(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, purgeKnowledgeBitsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, { counts: await purgeKnowledgeBits(body.data.ids) });
}

// DELETE /knowledge-sources/:id
export async function handleDeleteKnowledgeSource(
  res: http.ServerResponse,
  sourceId: string,
): Promise<void> {
  sendJson(res, 200, { counts: await deleteKnowledgeSource(sourceId) });
}

// POST /knowledge/purges
export async function handleClearAllKnowledge(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, clearAllKnowledgeInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, { counts: await clearAllKnowledge() });
}
