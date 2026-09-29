import type http from "node:http";
import { editKnowledgeBitInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { editKnowledgeBit, type EditKnowledgeBitError } from "./knowledge-bit-edit.service.js";

const STATUS: Record<EditKnowledgeBitError, number> = {
  not_found: 404,
};

export async function handleEditKnowledgeBit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, editKnowledgeBitInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await editKnowledgeBit(id, body.data);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
