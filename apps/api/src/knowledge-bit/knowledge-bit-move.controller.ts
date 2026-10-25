import type http from "node:http";
import { bulkMoveKnowledgeBitsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { moveKnowledgeBitsBulk } from "./knowledge-bit-move.repo.js";

// POST /knowledge-bits/moves
export async function handleBulkMoveKnowledgeBits(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, bulkMoveKnowledgeBitsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await moveKnowledgeBitsBulk(body.data.knowledgeBitIds, body.data.subjectId);

  if ("error" in result) {
    sendJson(res, 404, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}
