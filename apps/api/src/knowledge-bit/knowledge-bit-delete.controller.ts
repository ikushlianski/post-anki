import type http from "node:http";
import { bulkDeleteKnowledgeBitsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { deleteKnowledgeBitsBulk } from "./knowledge-bit-delete.repo.js";

// POST /knowledge-bits/deletions
export async function handleBulkDeleteKnowledgeBits(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, bulkDeleteKnowledgeBitsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, await deleteKnowledgeBitsBulk(body.data.knowledgeBitIds));
}
